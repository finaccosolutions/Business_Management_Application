import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    ArrowLeft,
    FileText,
    DollarSign,
    Plus,
    Trash2,
    Receipt,
    ArrowRightLeft,
    BookOpen,
    Save,
    Calendar,
    Hash,
    AlignLeft,
    Wallet,
    Building2
} from 'lucide-react';
import { generateNextVoucherNumber, VoucherTypeKey } from '../lib/voucherNumberHelper';
import SearchableSelect from '../components/SearchableSelect';

interface CreateVoucherProps {
    onNavigate: (page: string, params?: any) => void;
    initialType?: string;
    editVoucherId?: string;
}

interface Account {
    id: string;
    account_code: string;
    account_name: string;
}

interface VoucherEntry {
    account_id: string;
    amount: string;
    type: 'debit' | 'credit';
    narration: string;
}

export default function CreateVoucher({ onNavigate, initialType, editVoucherId }: CreateVoucherProps) {
    const { user } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeType, setActiveType] = useState<string>(initialType || '');
    const [voucherTypes, setVoucherTypes] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectOptions, setSelectOptions] = useState<{ id: string, name: string }[]>([]);

    // Form State
    const [formData, setFormData] = useState({
        voucher_number: '',
        voucher_date: new Date().toISOString().split('T')[0],
        reference_number: '',
        narration: '',
        status: 'draft',
    });

    // Specific States
    const [entries, setEntries] = useState<VoucherEntry[]>([
        { account_id: '', amount: '', type: 'debit', narration: '' },
    ]);

    // Payment/Receipt Specific
    const [cashBankAccountId, setCashBankAccountId] = useState<string>('');
    const [paymentReceiptType, setPaymentReceiptType] = useState<'cash' | 'bank'>('cash');

    useEffect(() => {
        fetchDependencies().then(() => {
            if (editVoucherId) {
                fetchVoucher();
            }
        });
    }, []);

    useEffect(() => {
        if (accounts.length > 0) {
            setSelectOptions(accounts.map(a => ({ id: a.id, name: `${a.account_name} (${a.account_code})` })));
        }
    }, [accounts]);

    useEffect(() => {
        if (activeType && voucherTypes.length > 0 && !editVoucherId) {
            const type = voucherTypes.find(t => t.name.toLowerCase() === activeType.toLowerCase() || t.id === activeType);
            if (type) {
                generateVoucherNumber(type.id);
            }
        }

        // Reset entries based on type when type changes (only for new vouchers)
        if (!editVoucherId && activeType) {
            if (activeType === 'Journal' || activeType === 'Contra') {
                setEntries([
                    { account_id: '', amount: '', type: 'debit', narration: '' },
                    { account_id: '', amount: '', type: 'credit', narration: '' }
                ]);
            } else {
                setEntries([{ account_id: '', amount: '', type: activeType === 'Payment' ? 'debit' : 'credit', narration: '' }]);
            }
        }
    }, [activeType, voucherTypes, editVoucherId]);

    useEffect(() => {
        if (initialType) {
            setActiveType(initialType);
        }
    }, [initialType]);


    const fetchDependencies = async () => {
        try {
            const [typesRes, accountsRes, settingsRes] = await Promise.all([
                supabase.from('voucher_types').select('*').order('name'),
                supabase.from('chart_of_accounts').select('id, account_code, account_name').eq('is_active', true).order('account_name'),
                supabase.from('company_settings').select('*').eq('user_id', user!.id).maybeSingle()
            ]);

            setVoucherTypes(typesRes.data || []);
            setAccounts(accountsRes.data || []);

            if (settingsRes.data) {
                const type = settingsRes.data.default_payment_receipt_type || 'cash';
                setPaymentReceiptType(type);
                const accountId = type === 'bank'
                    ? settingsRes.data.default_bank_ledger_id
                    : settingsRes.data.default_cash_ledger_id;
                if (accountId) {
                    setCashBankAccountId(accountId);
                }
            }
        } catch (error) {
            console.error('Error fetching dependencies:', error);
            toast.error('Failed to load data');
        } finally {
            if (!editVoucherId) setLoading(false);
        }
    };

    const fetchVoucher = async () => {
        try {
            setLoading(true);
            const { data: voucher, error } = await supabase
                .from('vouchers')
                .select('*, voucher_entries(*), voucher_types(*)')
                .eq('id', editVoucherId)
                .single();

            if (error) throw error;
            if (!voucher) return;

            setFormData({
                voucher_number: voucher.voucher_number,
                voucher_date: voucher.voucher_date,
                reference_number: voucher.reference_number || '',
                narration: voucher.narration || '',
                status: voucher.status
            });

            const typeName = voucher.voucher_types.name;
            setActiveType(typeName);

            const vEntries = voucher.voucher_entries || [];

            if (typeName === 'Payment') {
                const creditEntry = vEntries.find((e: any) => e.credit_amount > 0);
                if (creditEntry) setCashBankAccountId(creditEntry.account_id);

                const debits = vEntries.filter((e: any) => e.debit_amount > 0).map((e: any) => ({
                    account_id: e.account_id,
                    amount: e.debit_amount.toString(),
                    type: 'debit',
                    narration: e.narration || ''
                }));
                setEntries(debits.length ? debits : [{ account_id: '', amount: '', type: 'debit', narration: '' }]);

            } else if (typeName === 'Receipt') {
                const debitEntry = vEntries.find((e: any) => e.debit_amount > 0);
                if (debitEntry) setCashBankAccountId(debitEntry.account_id);

                const credits = vEntries.filter((e: any) => e.credit_amount > 0).map((e: any) => ({
                    account_id: e.account_id,
                    amount: e.credit_amount.toString(),
                    type: 'credit',
                    narration: e.narration || ''
                }));
                setEntries(credits.length ? credits : [{ account_id: '', amount: '', type: 'credit', narration: '' }]);

            } else {
                const mapped = vEntries.map((e: any) => ({
                    account_id: e.account_id,
                    amount: (e.debit_amount || e.credit_amount).toString(),
                    type: e.debit_amount > 0 ? 'debit' : 'credit',
                    narration: e.narration || ''
                }));
                setEntries(mapped.length ? mapped : [{ account_id: '', amount: '', type: 'debit', narration: '' }]);
            }

        } catch (error) {
            console.error('Error fetching voucher:', error);
            toast.error('Failed to load voucher details');
        } finally {
            setLoading(false);
        }
    };

    const generateVoucherNumber = async (typeId: string) => {
        try {
            let helperType = 'journal';
            if (activeType === 'Payment') helperType = 'payment';
            if (activeType === 'Receipt') helperType = 'receipt';
            if (activeType === 'Contra') helperType = 'contra';

            const num = await generateNextVoucherNumber(user!.id, typeId, helperType as VoucherTypeKey);
            setFormData(prev => ({ ...prev, voucher_number: num }));
        } catch (error) {
            console.error('Error generating number:', error);
        }
    };

    const getCashBankAccounts = () => {
        const cashBank = accounts.filter(acc => {
            const code = acc.account_code.toLowerCase();
            const name = acc.account_name.toLowerCase();
            return code.includes('cash') || code.includes('bank') ||
                name.includes('cash') || name.includes('bank');
        });
        return cashBank.map(a => ({ id: a.id, name: `${a.account_name} (${a.account_code})` }));
    };

    const handleEntryChange = (index: number, field: keyof VoucherEntry, value: any) => {
        const updated = [...entries];
        updated[index] = { ...updated[index], [field]: value };
        setEntries(updated);
    };

    const addEntry = () => {
        const type = activeType === 'Payment' ? 'debit' : activeType === 'Receipt' ? 'credit' : 'debit';
        setEntries([...entries, { account_id: '', amount: '', type, narration: '' }]);
    };

    const removeEntry = (index: number) => {
        if (entries.length > 1) {
            setEntries(entries.filter((_, i) => i !== index));
        }
    };

    const calculateTotals = () => {
        if (activeType === 'Journal' || activeType === 'Contra') {
            const debit = entries.reduce((sum, e) => sum + (e.type === 'debit' ? parseFloat(e.amount || '0') : 0), 0);
            const credit = entries.reduce((sum, e) => sum + (e.type === 'credit' ? parseFloat(e.amount || '0') : 0), 0);
            return { debit, credit, diff: debit - credit, total: 0 };
        } else {
            const total = entries.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
            return { total, debit: 0, credit: 0, diff: 0 };
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        const typeObj = voucherTypes.find(t => t.name.toLowerCase() === activeType.toLowerCase() || t.id === activeType);
        if (!typeObj) {
            toast.error('Invalid Voucher Type');
            setSaving(false);
            return;
        }

        if (activeType === 'Journal' || activeType === 'Contra') {
            const { diff } = calculateTotals();
            if (Math.abs(diff) > 0.01) {
                toast.error('Debit and Credit must match');
                setSaving(false);
                return;
            }
        } else if (activeType === 'Payment' || activeType === 'Receipt') {
            if (!cashBankAccountId) {
                toast.error('Select a Cash/Bank Account');
                setSaving(false);
                return;
            }
            if (entries.length === 0 || !entries.some(e => parseFloat(e.amount) > 0)) {
                toast.error('Add at least one entry with amount');
                setSaving(false);
                return;
            }
        }

        try {
            let finalEntries: any[] = [];
            let totalAmount = 0;

            if (activeType === 'Payment') {
                const entryTotal = entries.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
                totalAmount = entryTotal;
                finalEntries = entries.map(e => ({
                    account_id: e.account_id,
                    debit_amount: parseFloat(e.amount),
                    credit_amount: 0,
                    narration: e.narration || formData.narration
                }));
                finalEntries.push({
                    account_id: cashBankAccountId,
                    debit_amount: 0,
                    credit_amount: entryTotal,
                    narration: `Payment via ${paymentReceiptType} - ${formData.narration}`
                });
            } else if (activeType === 'Receipt') {
                const entryTotal = entries.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
                totalAmount = entryTotal;
                finalEntries.push({
                    account_id: cashBankAccountId,
                    debit_amount: entryTotal,
                    credit_amount: 0,
                    narration: `Receipt via ${paymentReceiptType} - ${formData.narration}`
                });
                finalEntries = [...finalEntries, ...entries.map(e => ({
                    account_id: e.account_id,
                    debit_amount: 0,
                    credit_amount: parseFloat(e.amount),
                    narration: e.narration || formData.narration
                }))];
            } else {
                finalEntries = entries.map(e => ({
                    account_id: e.account_id,
                    debit_amount: e.type === 'debit' ? parseFloat(e.amount) : 0,
                    credit_amount: e.type === 'credit' ? parseFloat(e.amount) : 0,
                    narration: e.narration || formData.narration
                }));
                totalAmount = finalEntries.reduce((sum, e) => sum + Math.max(e.debit_amount, e.credit_amount), 0) / 2;
            }

            let voucherId = editVoucherId;

            if (editVoucherId) {
                const { error: vError } = await supabase
                    .from('vouchers')
                    .update({
                        voucher_number: formData.voucher_number,
                        voucher_date: formData.voucher_date,
                        reference_number: formData.reference_number,
                        narration: formData.narration,
                        total_amount: totalAmount,
                        status: formData.status,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editVoucherId);
                if (vError) throw vError;
                const { error: dError } = await supabase.from('voucher_entries').delete().eq('voucher_id', editVoucherId);
                if (dError) throw dError;
            } else {
                const voucherData = {
                    user_id: user!.id,
                    voucher_type_id: typeObj.id,
                    voucher_number: formData.voucher_number,
                    voucher_date: formData.voucher_date,
                    reference_number: formData.reference_number,
                    narration: formData.narration,
                    total_amount: totalAmount,
                    status: formData.status,
                    created_by: user!.id
                };
                const { data: voucher, error: vError } = await supabase.from('vouchers').insert(voucherData).select().single();
                if (vError) throw vError;
                voucherId = voucher.id;
            }

            const entriesInsert = finalEntries.map(e => ({ ...e, voucher_id: voucherId }));
            const { error: eError } = await supabase.from('voucher_entries').insert(entriesInsert);
            if (eError) throw eError;

            toast.success(editVoucherId ? 'Voucher updated' : 'Voucher created');
            onNavigate('vouchers');

        } catch (error: any) {
            console.error('Save error:', error);
            toast.error(error.message || 'Failed to save voucher');
        } finally {
            setSaving(false);
        }
    };

    const renderTypeSelector = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            {[
                { name: 'Payment', icon: DollarSign, color: 'text-red-600', bg: 'bg-red-50', border: 'hover:border-red-200', desc: 'Record expenses & payments' },
                { name: 'Receipt', icon: Receipt, color: 'text-green-600', bg: 'bg-green-50', border: 'hover:border-green-200', desc: 'Record income & receipts' },
                { name: 'Contra', icon: ArrowRightLeft, color: 'text-purple-600', bg: 'bg-purple-50', border: 'hover:border-purple-200', desc: 'Cash deposits & withdrawals' },
                { name: 'Journal', icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50', border: 'hover:border-blue-200', desc: 'Adjustments & transfers' },
            ].map(t => (
                <button
                    key={t.name}
                    onClick={() => {
                        setActiveType(t.name);
                        setEntries(t.name === 'Journal' || t.name === 'Contra'
                            ? [{ account_id: '', amount: '', type: 'debit', narration: '' }, { account_id: '', amount: '', type: 'credit', narration: '' }]
                            : [{ account_id: '', amount: '', type: t.name === 'Payment' ? 'debit' : 'credit', narration: '' }]
                        );
                    }}
                    className={`p-6 bg-white rounded-xl shadow-sm border border-gray-100 ${t.border} hover:shadow-md transition-all flex flex-col items-center text-center gap-4 group`}
                >
                    <div className={`p-4 rounded-full ${t.bg} group-hover:scale-110 transition-transform duration-200`}>
                        <t.icon className={`w-8 h-8 ${t.color}`} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg">{t.name} Voucher</h3>
                        <p className="text-sm text-gray-500 mt-1">{t.desc}</p>
                    </div>
                </button>
            ))}
        </div>
    );

    const getTypeColor = () => {
        switch (activeType) {
            case 'Payment': return 'text-red-600 bg-red-50';
            case 'Receipt': return 'text-green-600 bg-green-50';
            case 'Contra': return 'text-purple-600 bg-purple-50';
            default: return 'text-blue-600 bg-blue-50';
        }
    };

    if (loading) return <div className="flex items-center justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

    if (!activeType) {
        return (
            <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-gray-50/50 pb-24">
                <div className="bg-white border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center gap-4 max-w-7xl mx-auto">
                        <button onClick={() => onNavigate('vouchers')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-xl font-bold text-gray-900">Create New Voucher</h1>
                    </div>
                </div>
                <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                    <div className="text-center md:text-left mb-2">
                        <h2 className="text-lg font-semibold text-gray-900">Select Voucher Type</h2>
                        <p className="text-gray-500 text-sm">Choose the type of financial transaction you want to record</p>
                    </div>
                    {renderTypeSelector()}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-gray-50/50 pb-24">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <button onClick={() => {
                            if (editVoucherId) onNavigate('vouchers');
                            else setActiveType('');
                        }} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${getTypeColor()}`}>
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">{editVoucherId ? 'Edit' : 'New'} {activeType} Voucher</h1>
                                <p className="text-xs text-gray-500">{formData.voucher_number} • {formData.voucher_date}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Main Content (Left) */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Primary Account Selection (For Payment/Receipt) */}
                        {(activeType === 'Payment' || activeType === 'Receipt') && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-blue-600" />
                                    {activeType === 'Payment' ? 'Paid From (Source)' : 'Deposited To (Target)'}
                                </h2>
                                <SearchableSelect
                                    label=""
                                    options={getCashBankAccounts()}
                                    value={cashBankAccountId}
                                    onChange={setCashBankAccountId}
                                    placeholder={activeType === 'Payment' ? 'Select Bank/Cash Account to Pay From' : 'Select Bank/Cash to Deposit Into'}
                                    required
                                />
                                <div className="mt-2 flex gap-2">
                                    <span className="text-xs text-gray-500">Transaction Mode:</span>
                                    <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
                                        <input type="radio" checked={paymentReceiptType === 'cash'} onChange={() => setPaymentReceiptType('cash')} /> Cash
                                    </label>
                                    <label className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
                                        <input type="radio" checked={paymentReceiptType === 'bank'} onChange={() => setPaymentReceiptType('bank')} /> Bank
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Entries Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[300px] flex flex-col">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-blue-600" />
                                    {activeType === 'Payment' ? 'Payment For (Expenses/Parties)' : activeType === 'Receipt' ? 'Received From (Income/Parties)' : 'Transaction Entries'}
                                </h2>
                                <button type="button" onClick={addEntry} className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1 px-3 py-1.5 bg-blue-50 rounded-lg transition-colors">
                                    <Plus className="w-4 h-4" /> Add Line
                                </button>
                            </div>

                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                                        <tr>
                                            <th className="px-4 py-3 w-[45%]">Account</th>
                                            {(activeType === 'Journal' || activeType === 'Contra') && <th className="px-4 py-3 w-[15%]">Type</th>}
                                            <th className="px-4 py-3 w-[25%]">Description</th>
                                            <th className="px-4 py-3 w-[15%] text-right">Amount</th>
                                            <th className="px-4 py-3 w-[5%]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {entries.map((entry, idx) => (
                                            <tr key={idx} className="group hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 align-top min-w-[200px]">
                                                    <SearchableSelect
                                                        options={selectOptions}
                                                        value={entry.account_id}
                                                        onChange={(val) => handleEntryChange(idx, 'account_id', val)}
                                                        placeholder="Select Account"
                                                        label=""
                                                    />
                                                </td>
                                                {(activeType === 'Journal' || activeType === 'Contra') && (
                                                    <td className="px-4 py-3 align-top">
                                                        <select value={entry.type} onChange={e => handleEntryChange(idx, 'type', e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500">
                                                            <option value="debit">Dr</option>
                                                            <option value="credit">Cr</option>
                                                        </select>
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 align-top">
                                                    <input
                                                        type="text"
                                                        value={entry.narration}
                                                        onChange={e => handleEntryChange(idx, 'narration', e.target.value)}
                                                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                        placeholder="Description..."
                                                    />
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <input
                                                        type="number" step="0.01"
                                                        value={entry.amount}
                                                        onChange={e => handleEntryChange(idx, 'amount', e.target.value)}
                                                        className="w-full p-2.5 border border-gray-300 rounded-lg text-right font-medium focus:ring-2 focus:ring-blue-500"
                                                        placeholder="0.00"
                                                        required
                                                    />
                                                </td>
                                                <td className="px-4 py-3 align-top text-center pt-3">
                                                    {entries.length > 1 && (
                                                        <button type="button" onClick={() => removeEntry(idx)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Totals Footer */}
                            <div className="bg-gray-50 border-t border-gray-200 p-6">
                                <div className="flex justify-end">
                                    <div className="w-full max-w-xs space-y-2">
                                        {activeType === 'Journal' || activeType === 'Contra' ? (
                                            <>
                                                <div className="flex justify-between text-sm text-gray-600">
                                                    <span>Total Debit</span>
                                                    <span>₹{calculateTotals().debit.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm text-gray-600">
                                                    <span>Total Credit</span>
                                                    <span>₹{calculateTotals().credit.toFixed(2)}</span>
                                                </div>
                                                <div className={`flex justify-between font-bold border-t border-gray-300 pt-2 ${Math.abs(calculateTotals().diff) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                                                    <span>Difference</span>
                                                    <span>₹{Math.abs(calculateTotals().diff).toFixed(2)}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex justify-between text-lg font-bold text-gray-900 border-t border-gray-300 pt-2">
                                                <span>Total Amount</span>
                                                <span className="text-blue-600">₹{calculateTotals().total.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Narration */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Voucher Narration</label>
                            <textarea
                                value={formData.narration}
                                onChange={e => setFormData({ ...formData, narration: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                rows={3}
                                placeholder="Describe this transaction..."
                            />
                        </div>
                    </div>

                    {/* Sidebar (Right) */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2">Voucher Settings</h3>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Voucher Number</label>
                                <div className="relative">
                                    <Hash className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                    <input type="text" value={formData.voucher_number} onChange={e => setFormData({ ...formData, voucher_number: e.target.value })} className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm font-mono" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                    <input type="date" value={formData.voucher_date} onChange={e => setFormData({ ...formData, voucher_date: e.target.value })} className="w-full pl-9 p-2 border border-gray-300 rounded-lg text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Reference Number</label>
                                <input type="text" value={formData.reference_number} onChange={e => setFormData({ ...formData, reference_number: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg text-sm" placeholder="Optional" />
                            </div>
                        </div>

                        {/* Status Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2 mb-3">Status</h3>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setFormData({ ...formData, status: 'draft' })} className={`flex-1 py-2 text-xs font-medium rounded-lg border ${formData.status === 'draft' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Draft</button>
                                <button type="button" onClick={() => setFormData({ ...formData, status: 'posted' })} className={`flex-1 py-2 text-xs font-medium rounded-lg border ${formData.status === 'posted' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-green-50'}`}>Posted</button>
                            </div>
                        </div>
                    </div>
                </div>
            </form>

            {/* Sticky Action Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-30">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <button
                        onClick={() => onNavigate('vouchers')}
                        className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md"
                    >
                        <Save className="w-4 h-4" /> {editVoucherId ? 'Update Voucher' : 'Save Voucher'}
                    </button>
                </div>
            </div>
        </div>
    );
}
