import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    Plus,
    FileText,
    Users,
    Trash2,
    Eye,
    ArrowLeft,
    Calendar,
    Hash,
    Briefcase,
    Save,
    Send,
    Settings,
    CreditCard
} from 'lucide-react';
import { generateEnhancedInvoiceHTML, previewEnhancedInvoice } from '../lib/enhancedInvoicePDF';
import { getNextVoucherNumber } from '../lib/voucherNumberGenerator';
import SearchableSelect from '../components/SearchableSelect';

interface Customer {
    id: string;
    name: string;
}

interface Service {
    id: string;
    name: string;
    description: string;
    default_price: number;
    tax_rate?: number;
    income_account_id?: string;
    hsn_code?: string;
}

interface Account {
    id: string;
    account_code: string;
    account_name: string;
}

interface CreateInvoiceProps {
    onNavigate: (page: string, params?: any) => void;
    initialCustomerId?: string;
    editInvoiceId?: string;
}

export default function CreateInvoice({ onNavigate, initialCustomerId, editInvoiceId }: CreateInvoiceProps) {
    const { user } = useAuth();
    const toast = useToast();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [defaultIncomeAccountId, setDefaultIncomeAccountId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        customer_id: '',
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: new Date().toISOString().split('T')[0], // Default to today, will update
        discount: '0',
        payment_terms: 'net_30', // Default hidden value
        notes: '',
        status: 'draft',
        income_account_id: '',
        customer_account_id: '',
    });

    const [lineItems, setLineItems] = useState([
        { service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0, hsn_sac: '' }
    ]);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (editInvoiceId) {
            fetchInvoiceDetails(editInvoiceId);
        } else if (initialCustomerId && customers.length > 0) {
            setFormData(prev => ({ ...prev, customer_id: initialCustomerId }));
            loadCustomerDetails(initialCustomerId);
        }
    }, [initialCustomerId, customers, editInvoiceId]);

    // Auto-calculate Due Date based on Invoice Date + 30 days (Default Policy since field is hidden)
    useEffect(() => {
        if (formData.invoice_date) {
            const date = new Date(formData.invoice_date);
            date.setDate(date.getDate() + 30); // Hardcoded 30 days as Payment Terms is hidden
            setFormData(prev => ({ ...prev, due_date: date.toISOString().split('T')[0] }));
        }
    }, [formData.invoice_date]);

    const fetchData = async () => {
        try {
            const [customersResult, servicesResult, accountsResult, settingsResult] = await Promise.all([
                supabase.from('customers').select('id, name, account_id').order('name'),
                supabase.from('services').select('id, name, description, default_price, tax_rate, income_account_id, hsn_code').order('name'),
                supabase.from('chart_of_accounts').select('id, account_code, account_name').eq('is_active', true).order('account_name'),
                supabase.from('company_settings').select('default_income_ledger_id').eq('user_id', user!.id).maybeSingle(),
            ]);

            if (customersResult.error) throw customersResult.error;
            if (servicesResult.error) throw servicesResult.error;
            if (accountsResult.error) throw accountsResult.error;

            setCustomers(customersResult.data || []);
            setServices(servicesResult.data || []);
            setAccounts(accountsResult.data || []);

            if (settingsResult.data?.default_income_ledger_id) {
                setDefaultIncomeAccountId(settingsResult.data.default_income_ledger_id);
                if (!editInvoiceId) {
                    setFormData(prev => ({ ...prev, income_account_id: settingsResult.data.default_income_ledger_id }));
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to load data');
        } finally {
            if (!editInvoiceId) {
                setLoading(false);
            }
        }
    };

    const fetchInvoiceDetails = async (id: string) => {
        setLoading(true);
        try {
            const { data: invoice, error } = await supabase
                .from('invoices')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            const { data: items, error: itemsError } = await supabase
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', id);

            if (itemsError) throw itemsError;

            if (invoice) {
                setFormData({
                    customer_id: invoice.customer_id,
                    invoice_number: invoice.invoice_number,
                    invoice_date: invoice.invoice_date,
                    due_date: invoice.due_date,
                    discount: (invoice.subtotal + invoice.tax_amount - invoice.total_amount).toString(),
                    payment_terms: 'net_30',
                    notes: invoice.notes || '',
                    status: invoice.status,
                    income_account_id: invoice.income_account_id || '',
                    customer_account_id: invoice.customer_account_id || '',
                });

                if (items) {
                    setLineItems(items.map((item: any) => ({
                        service_id: item.service_id || '',
                        description: item.description || '',
                        custom_description: '',
                        quantity: item.quantity,
                        rate: item.unit_price,
                        tax_rate: item.tax_rate || 0,
                        hsn_sac: item.hsn_sac || '',
                    })));
                }
            }

        } catch (error) {
            console.error('Error fetching invoice details:', error);
            toast.error('Failed to load invoice details');
        } finally {
            setLoading(false);
        }
    }

    const saveInvoice = async (status: string = 'draft') => {
        setSaving(true);
        try {
            const subtotal = calculateSubtotal();
            const taxAmount = calculateTotalTax();
            const discount = parseFloat(formData.discount || '0');
            const totalAmount = subtotal + taxAmount - discount;

            const invoiceData: any = {
                user_id: user!.id,
                customer_id: formData.customer_id,
                invoice_number: formData.invoice_number,
                invoice_date: formData.invoice_date,
                due_date: formData.due_date,
                subtotal: subtotal,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                status: status, // Use the passed status
                notes: formData.notes,
                income_account_id: formData.income_account_id || null,
                customer_account_id: formData.customer_account_id || null,
                updated_at: new Date().toISOString(),
            };

            let invoiceId = editInvoiceId;

            if (editInvoiceId) {
                const { error: invoiceError } = await supabase
                    .from('invoices')
                    .update(invoiceData)
                    .eq('id', editInvoiceId);

                if (invoiceError) throw invoiceError;

                const { error: deleteError } = await supabase
                    .from('invoice_items')
                    .delete()
                    .eq('invoice_id', editInvoiceId);

                if (deleteError) throw deleteError;

            } else {
                const { data: invoice, error: invoiceError } = await supabase
                    .from('invoices')
                    .insert({ ...invoiceData, created_by: user!.id })
                    .select()
                    .single();

                if (invoiceError) throw invoiceError;
                invoiceId = invoice.id;
            }

            const itemsToInsert = lineItems.map(item => ({
                invoice_id: invoiceId,
                service_id: item.service_id || null,
                description: item.custom_description || item.description,
                quantity: parseFloat(item.quantity.toString()),
                unit_price: parseFloat(item.rate.toString()),
                amount: parseFloat(item.quantity.toString()) * parseFloat(item.rate.toString()),
                tax_rate: parseFloat(item.tax_rate?.toString() || '0'),
                hsn_sac: item.hsn_sac || null,
            }));

            const { error: itemsError } = await supabase
                .from('invoice_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            toast.success(editInvoiceId ? 'Invoice updated' : `Invoice ${status === 'draft' ? 'draft saved' : 'created'}`);
            onNavigate('invoices');
        } catch (error) {
            console.error('Error saving invoice:', error);
            toast.error('Failed to save invoice');
        } finally {
            setSaving(false);
        }
    };

    const addLineItem = () => {
        setLineItems([...lineItems, { service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0, hsn_sac: '' }]);
    };

    const removeLineItem = (index: number) => {
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const updateLineItem = (index: number, field: string, value: any) => {
        const updated = [...lineItems];
        if (field === 'service_id') {
            const service = services.find(s => s.id === value);
            if (service) {
                updated[index] = {
                    ...updated[index],
                    service_id: value,
                    description: service.description || service.name,
                    rate: service.default_price || 0,
                    tax_rate: service.tax_rate || 0,
                    hsn_sac: service.hsn_code || '',
                    custom_description: '',
                };

                if (service.income_account_id && !formData.income_account_id) {
                    setFormData(prev => ({ ...prev, income_account_id: service.income_account_id! }));
                } else if (!service.income_account_id && defaultIncomeAccountId && !formData.income_account_id) {
                    setFormData(prev => ({ ...prev, income_account_id: defaultIncomeAccountId }));
                }
            }
        } else {
            updated[index] = { ...updated[index], [field]: value };
        }
        setLineItems(updated);
    };

    const calculateItemTotal = (item: any) => {
        const subtotal = parseFloat(item.quantity || 0) * parseFloat(item.rate || 0);
        const tax = subtotal * (parseFloat(item.tax_rate || 0) / 100);
        return subtotal + tax;
    };

    const calculateSubtotal = () => lineItems.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.rate || 0)), 0);
    const calculateTotalTax = () => lineItems.reduce((sum, item) => {
        const subtotal = parseFloat(item.quantity || 0) * parseFloat(item.rate || 0);
        return sum + (subtotal * (parseFloat(item.tax_rate || 0) / 100));
    }, 0);

    const loadCustomerDetails = async (customerId: string) => {
        try {
            if (!editInvoiceId) {
                const nextNumber = await getNextVoucherNumber(supabase, user!.id, 'invoice', 'invoices');
                const customer = customers.find(c => c.id === customerId);
                const customerAccountId = customer ? (customer as any).account_id : '';
                setFormData(prev => ({ ...prev, invoice_number: nextNumber, customer_account_id: customerAccountId || '' }));
            } else {
                const customer = customers.find(c => c.id === customerId);
                setFormData(prev => ({ ...prev, customer_account_id: (customer as any)?.account_id || '' }));
            }
        } catch (error) {
            console.error('Error generating invoice number:', error);
        }
    };

    const handlePreview = async () => {
        if (!formData.customer_id) {
            toast.error('Please select a customer first');
            return;
        }

        try {
            const subtotal = calculateSubtotal();
            const taxAmount = calculateTotalTax();
            const discount = parseFloat(formData.discount || '0');
            const totalAmount = subtotal + taxAmount - discount;

            const customer = customers.find(c => c.id === formData.customer_id);
            if (!customer) throw new Error('Customer not found');

            const { data: customerData } = await supabase
                .from('customers')
                .select('name, email, phone, address, gstin')
                .eq('id', formData.customer_id)
                .single();

            const draftInvoice = {
                invoice_number: formData.invoice_number,
                invoice_date: formData.invoice_date,
                due_date: formData.due_date,
                subtotal,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                status: formData.status,
                notes: formData.notes,
                customers: customerData || customer,
            };

            const previewItems = lineItems.map(item => ({
                description: item.custom_description || item.description,
                quantity: parseFloat(item.quantity.toString()),
                unit_price: parseFloat(item.rate.toString()),
                amount: calculateItemTotal(item),
                tax_rate: parseFloat(item.tax_rate.toString()),
            }));

            const { data: settings } = await supabase.from('company_settings').select('*').eq('user_id', user!.id).maybeSingle();

            const html = generateEnhancedInvoiceHTML(
                draftInvoice as any,
                previewItems,
                settings || { company_name: 'Your Company', country: 'India' }
            );

            previewEnhancedInvoice(html);
        } catch (error) {
            console.error('Error previewing invoice:', error);
            toast.error('Failed to preview invoice');
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-full p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-gray-50/50 pb-24">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <button onClick={() => onNavigate('invoices')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{editInvoiceId ? 'Edit Invoice' : 'New Invoice'}</h1>
                            <p className="text-xs text-gray-500">{formData.invoice_number}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">

                {/* Top Section: Customer, Accounts & Meta */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
                        {/* Customer & Income Account (Left Side - Wider) */}
                        <div className="lg:col-span-8 space-y-6">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                                <div>
                                    <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-blue-600" /> Customer Details
                                    </h2>
                                    <div className="space-y-4">
                                        <div>
                                            <SearchableSelect
                                                label="Select Customer"
                                                options={customers}
                                                value={formData.customer_id}
                                                onChange={(value) => {
                                                    setFormData(prev => ({ ...prev, customer_id: value }));
                                                    loadCustomerDetails(value);
                                                }}
                                                placeholder="Search customer..."
                                                required
                                            />
                                            {formData.customer_id && (
                                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100">
                                                    <Briefcase className="w-3 h-3" />
                                                    <span>Linked Account: </span>
                                                    <span className="font-medium text-gray-700">
                                                        {accounts.find(a => a.id === formData.customer_account_id)?.account_name || accounts.find(a => a.id === formData.customer_account_id)?.account_code || 'Not Linked'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-green-600" /> Income Account
                                    </h2>
                                    <div className="relative">
                                        <select
                                            value={formData.income_account_id}
                                            onChange={e => setFormData({ ...formData, income_account_id: e.target.value })}
                                            className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow hover:border-gray-400"
                                        >
                                            <option value="">Select Revenue Account to Credit</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Select the ledger account where income from this invoice should be recorded.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Invoice Meta (Right Side - Narrower) */}
                        <div className="lg:col-span-4 bg-gray-50 rounded-lg p-5 border border-gray-100">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Number</label>
                                    <div className="relative">
                                        <Hash className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={formData.invoice_number}
                                            onChange={e => setFormData({ ...formData, invoice_number: e.target.value })}
                                            className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-mono bg-white"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                                        <input
                                            type="date"
                                            value={formData.invoice_date}
                                            onChange={e => setFormData({ ...formData, invoice_date: e.target.value })}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                                        <input
                                            type="date"
                                            value={formData.due_date}
                                            onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items Section - Full Width & Optimized */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[300px] flex flex-col">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" /> Items & Services
                        </h2>
                        <button onClick={addLineItem} className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg transition-colors">
                            <Plus className="w-4 h-4" /> Add Item
                        </button>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                                <tr>
                                    <th className="px-4 py-3 w-[25%]">Service</th>
                                    <th className="px-4 py-3 w-[25%]">Description</th>
                                    <th className="px-4 py-3 w-[10%] text-center">Qty</th>
                                    <th className="px-4 py-3 w-[12%] text-right">Rate</th>
                                    <th className="px-4 py-3 w-[10%] text-right">Tax %</th>
                                    <th className="px-4 py-3 w-[13%] text-right">Amount</th>
                                    <th className="px-4 py-3 w-[5%]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lineItems.map((item, index) => (
                                    <tr key={index} className="group hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3 align-top">
                                            <select
                                                value={item.service_id}
                                                onChange={(e) => updateLineItem(index, 'service_id', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="">Select Service</option>
                                                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <textarea
                                                value={item.custom_description}
                                                onChange={(e) => updateLineItem(index, 'custom_description', e.target.value)}
                                                placeholder={item.description || "Description..."}
                                                rows={1}
                                                className="w-full p-2 border border-gray-300 rounded-md text-sm text-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                                                style={{ minHeight: '38px' }}
                                            />
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <input
                                                type="number" min="1"
                                                value={item.quantity}
                                                onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-md text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <input
                                                type="number" step="0.01"
                                                value={item.rate}
                                                onChange={(e) => updateLineItem(index, 'rate', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-md text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <input
                                                type="number" step="0.5"
                                                value={item.tax_rate}
                                                onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-md text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="px-4 py-3 align-top text-right font-medium text-gray-900 pt-3">
                                            ₹{calculateItemTotal(item).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 align-top text-center pt-2">
                                            <button onClick={() => removeLineItem(index)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer Section: Notes & Totals */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Notes (Left) */}
                    <div className="lg:col-span-7">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Notes & Terms</label>
                            <textarea
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                rows={4}
                                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Add payment terms, thank you notes, or other details..."
                            />
                        </div>
                    </div>

                    {/* Totals (Right) */}
                    <div className="lg:col-span-5">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-full">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-3 mb-3">Summary</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-gray-600">
                                    <span>Subtotal</span>
                                    <span className="font-medium">₹{calculateSubtotal().toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-600">
                                    <span>Total Tax</span>
                                    <span className="font-medium">₹{calculateTotalTax().toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-600">
                                    <span className="flex items-center gap-1">Discount <span className="text-xs text-gray-400">(₹)</span></span>
                                    <input
                                        type="number"
                                        value={formData.discount}
                                        onChange={e => setFormData({ ...formData, discount: e.target.value })}
                                        className="w-24 p-1 text-right text-sm border border-gray-300 rounded focus:border-blue-500 outline-none"
                                    />
                                </div>
                                <div className="border-t-2 border-dashed border-gray-200 mt-4 pt-4">
                                    <div className="flex justify-between items-center text-lg font-bold">
                                        <span className="text-gray-900">Total Amount</span>
                                        <span className="text-blue-600">₹{(calculateSubtotal() + calculateTotalTax() - parseFloat(formData.discount || '0')).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-30">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <button
                        onClick={() => onNavigate('invoices')}
                        className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={handlePreview}
                            className="flex items-center gap-2 px-4 py-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                        >
                            <Eye className="w-4 h-4" /> Preview
                        </button>
                        <button
                            onClick={() => saveInvoice('draft')}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" /> Save as Draft
                        </button>
                        <button
                            onClick={() => saveInvoice('sent')}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md"
                        >
                            <Send className="w-4 h-4" /> {editInvoiceId ? 'Update Invoice' : 'Create & Send'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
