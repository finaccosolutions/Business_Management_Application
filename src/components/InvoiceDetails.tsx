import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Printer, Download, Edit2, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { generateEnhancedInvoiceHTML, printEnhancedInvoice, downloadEnhancedPDF } from '../lib/enhancedInvoicePDF';
import { useToast } from '../contexts/ToastContext';
import EditInvoiceModal from './EditInvoiceModal';

interface InvoiceDetailsProps {
    invoiceId: string;
    onBack: () => void;
}

export default function InvoiceDetails({ invoiceId, onBack }: InvoiceDetailsProps) {
    const [invoice, setInvoice] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [companySettings, setCompanySettings] = useState<any>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const toast = useToast();

    useEffect(() => {
        fetchInvoiceDetails();
        fetchCompanySettings();
    }, [invoiceId]);

    const fetchInvoiceDetails = async () => {
        try {
            const [invoiceRes, itemsRes] = await Promise.all([
                supabase
                    .from('invoices')
                    .select('*, customers(name, email, phone, address, gstin, city, state, state_code, postal_code)')
                    .eq('id', invoiceId)
                    .single(),
                supabase
                    .from('invoice_items')
                    .select('*')
                    .eq('invoice_id', invoiceId)
            ]);

            if (invoiceRes.error) throw invoiceRes.error;
            if (itemsRes.error) throw itemsRes.error;

            setInvoice(invoiceRes.data);
            setItems(itemsRes.data || []);
        } catch (error) {
            console.error('Error fetching invoice details:', error);
            toast.error('Failed to load invoice details');
        } finally {
            setLoading(false);
        }
    };

    const fetchCompanySettings = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('company_settings')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            setCompanySettings(data);
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    };

    const handlePrint = () => {
        if (!invoice || !items) return;
        const html = generateEnhancedInvoiceHTML(
            invoice,
            items,
            companySettings || { company_name: 'Your Company', country: 'India' }
        );
        printEnhancedInvoice(html);
    };

    const handleDownloadPDF = async () => {
        if (!invoice || !items) return;
        try {
            toast.info('Generating PDF...');
            const html = generateEnhancedInvoiceHTML(
                invoice,
                items,
                companySettings || { company_name: 'Your Company', country: 'India' }
            );
            await downloadEnhancedPDF(html, `Invoice-${invoice.invoice_number}`);
            toast.success('PDF downloaded successfully!');
        } catch (error) {
            console.error('Error downloading PDF:', error);
            toast.error('Failed to generate PDF');
        }
    };

    if (loading || !invoice) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] bg-white shadow-sm rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors text-white mr-2"
                        title="Back"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <FileText size={24} />
                            {invoice.invoice_number}
                        </h2>
                        <p className="text-blue-100 text-sm">{invoice.customers?.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                    >
                        <Edit2 size={18} />
                        Edit
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                    >
                        <Printer size={18} />
                        Print
                    </button>
                    <button
                        onClick={handleDownloadPDF}
                        className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                    >
                        <Download size={18} />
                        PDF
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
                <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">INVOICE</h1>
                            <p className="text-lg text-gray-600">#{invoice.invoice_number}</p>
                        </div>
                        <div className="text-right">
                            <div className={`inline-flex items-center px-4 py-2 rounded-lg font-semibold ${invoice.status === 'paid' ? 'bg-green-100 text-green-700' :
                                    invoice.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-700'
                                }`}>
                                {invoice.status.toUpperCase()}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To:</h3>
                            <div className="text-gray-900">
                                <p className="font-semibold text-lg">{invoice.customers?.name}</p>
                                {invoice.customers?.email && <p className="text-sm">{invoice.customers.email}</p>}
                                {invoice.customers?.phone && <p className="text-sm">{invoice.customers.phone}</p>}
                                {invoice.customers?.address && <p className="text-sm mt-1">{invoice.customers.address}</p>}
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="mb-4">
                                <p className="text-sm text-gray-500">Invoice Date</p>
                                <p className="font-semibold text-gray-900">
                                    {new Date(invoice.invoice_date).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="mb-4">
                                <p className="text-sm text-gray-500">Due Date</p>
                                <p className="font-semibold text-gray-900">
                                    {new Date(invoice.due_date).toLocaleDateString()}
                                </p>
                            </div>
                            {invoice.paid_at && (
                                <div>
                                    <p className="text-sm text-gray-500">Paid On</p>
                                    <p className="font-semibold text-green-600">
                                        {new Date(invoice.paid_at).toLocaleDateString()}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mb-8">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b-2 border-gray-300">
                                    <th className="text-left py-3 text-sm font-semibold text-gray-700">Description</th>
                                    <th className="text-right py-3 text-sm font-semibold text-gray-700">Quantity</th>
                                    <th className="text-right py-3 text-sm font-semibold text-gray-700">Rate</th>
                                    <th className="text-right py-3 text-sm font-semibold text-gray-700">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b border-gray-200">
                                        <td className="py-3 text-gray-900">{item.description}</td>
                                        <td className="text-right py-3 text-gray-900">{item.quantity}</td>
                                        <td className="text-right py-3 text-gray-900">₹{item.unit_price.toFixed(2)}</td>
                                        <td className="text-right py-3 text-gray-900 font-semibold">₹{item.amount.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end mb-8">
                        <div className="w-64">
                            <div className="flex justify-between py-2 text-gray-700">
                                <span>Subtotal:</span>
                                <span className="font-semibold">₹{invoice.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-2 text-gray-700">
                                <span>Tax:</span>
                                <span className="font-semibold">₹{invoice.tax_amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-3 border-t-2 border-gray-300 text-lg font-bold text-gray-900">
                                <span>Total:</span>
                                <span className="text-blue-600">₹{invoice.total_amount.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {invoice.notes && (
                        <div className="border-t border-gray-200 pt-6">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes / Terms:</h3>
                            <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.notes}</p>
                        </div>
                    )}
                </div>
            </div>

            {showEditModal && (
                <EditInvoiceModal
                    invoice={invoice}
                    items={items}
                    onClose={() => setShowEditModal(false)}
                    onSave={() => {
                        fetchInvoiceDetails();
                        setShowEditModal(false);
                    }}
                />
            )}
        </div>
    );
}
