// src/pages/StaffPermissions.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    ArrowLeft,
    Save,
    Shield,
    Briefcase,
    Users,
    Phone as PhoneIcon,
    BookOpen,
    Coins,
    PieChart,
    FileText,
    Lock,
    CheckCircle,
    AlertCircle,
    Calendar
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

// Configuration
const PERMISSION_CONFIG: Record<string, any> = {
    works: {
        label: "Works Management",
        description: "Manage tasks, projects, and work orders",
        icon: Briefcase,
        actions: [
            { key: 'create', label: 'Create New Works', description: 'Can start new jobs' },
            { key: 'edit', label: 'Edit Existing Works', description: 'Modify details of works' },
            { key: 'delete', label: 'Delete Works', description: 'Permanently remove works' },
            { key: 'view_all', label: 'View All Works (Team)', description: 'See works assigned to others' },
            { key: 'view_revenue', label: 'View Revenue & Pricing', description: 'See financial amounts' },
            { key: 'view_list', label: 'Works List Tab', description: 'Access standard list view' },
            { key: 'view_monitor', label: 'Monitor Tab', description: 'Access activity monitor' },
            { key: 'view_board', label: 'Board Tab', description: 'Access Kanban board' },
            { key: 'view_schedule', label: 'Schedule Tab', description: 'Access work calendar' },
        ]
    },
    customers: {
        label: "Customer Data",
        description: "Client database and contact info",
        icon: Users,
        actions: [
            { key: 'create', label: 'Add Customers', description: 'Register new clients' },
            { key: 'edit', label: 'Edit Customers', description: 'Update client details' },
            { key: 'delete', label: 'Delete Customers', description: 'Remove clients' },
            { key: 'view_contact', label: 'View Contact Info', description: 'See phone numbers/emails' },
            { key: 'export', label: 'Export Data', description: 'Download customer lists' },
        ]
    },
    services: {
        label: "Services",
        description: "Service catalog and pricing",
        icon: BookOpen,
        actions: [
            { key: 'create', label: 'Add Services', description: 'Create new service offerings' },
            { key: 'edit', label: 'Edit Services', description: 'Change service details' },
            { key: 'delete', label: 'Delete Services', description: 'Remove services' },
            { key: 'view_pricing', label: 'View Pricing', description: 'See standard rates' },
        ]
    },
    accounting: {
        label: "Accounting & Finance",
        description: "Vouchers, ledgers, and accounts",
        icon: Coins,
        actions: [
            { key: 'view_dashboard', label: 'Access Overview', description: 'View financial summaries' },
            { key: 'create_voucher', label: 'Create Vouchers', description: 'Entry of payments/receipts' },
            { key: 'edit_voucher', label: 'Edit Vouchers', description: 'Modify entries' },
            { key: 'delete_voucher', label: 'Delete Vouchers', description: 'Remove entries' },
            { key: 'view_reports', label: 'View Reports', description: 'Access P&L and Balance Sheet' },
        ]
    },
    leads: {
        label: "Lead Management",
        description: "Sales pipeline and prospects",
        icon: PhoneIcon,
        actions: [
            { key: 'create', label: 'Add Leads', description: 'Enter new prospects' },
            { key: 'edit', label: 'Edit Leads', description: 'Update lead status' },
            { key: 'delete', label: 'Delete Leads', description: 'Remove leads' },
            { key: 'convert', label: 'Convert to Customer', description: 'Promote lead to client' },
        ]
    },
    reports: {
        label: "Reports & Analytics",
        description: "Business intelligence and stats",
        icon: PieChart,
        actions: [
            { key: 'view_revenue', label: 'View Revenue Reports', description: 'See income charts' },
            { key: 'view_staff_performance', label: 'Staff Performance', description: 'See other staff metrics' },
            { key: 'export', label: 'Export Reports', description: 'Download PDF/Excel' },
        ]
    },
    invoices: {
        label: "Invoicing",
        description: "Client billing and invoices",
        icon: FileText,
        actions: [
            { key: 'create', label: 'Create Invoices', description: 'Generate bills' },
            { key: 'edit', label: 'Edit Invoices', description: 'Modify bills' },
            { key: 'delete', label: 'Delete Invoices', description: 'Void/Delete bills' },
            { key: 'view_all', label: 'View All Invoices', description: 'See full invoice history' },
        ]
    }
};

interface StaffPermissionsProps {
    staffId?: string;
    onBack?: () => void;
}

export default function StaffPermissions({ staffId: propId, onBack }: StaffPermissionsProps) {
    const { id: paramId } = useParams();
    const id = propId || paramId;
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [staff, setStaff] = useState<any>(null);
    const [allowedModules, setAllowedModules] = useState<string[]>([]);
    const [detailedPermissions, setDetailedPermissions] = useState<any>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (id) {
            fetchStaffDetails();
        } else {
            console.warn("No staff ID provided to StaffPermissions");
            setLoading(false);
        }
    }, [id]);

    const fetchStaffDetails = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('staff_members')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;

            setStaff(data);
            setAllowedModules(data.allowed_modules || []);
            setDetailedPermissions(data.detailed_permissions || {});
        } catch (err) {
            console.error("Error fetching staff details:", err);
            toast.error("Failed to load staff details");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!id) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('staff_members')
                .update({
                    allowed_modules: allowedModules,
                    detailed_permissions: detailedPermissions,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;
            toast.success("Permissions updated successfully");
            if (onBack) onBack(); // Go back on save success? Optional, but nice.
        } catch (err) {
            console.error(err);
            toast.error("Failed to save permissions");
        } finally {
            setSaving(false);
        }
    };

    const toggleModule = (moduleKey: string) => {
        setAllowedModules(prev =>
            prev.includes(moduleKey)
                ? prev.filter(m => m !== moduleKey)
                : [...prev, moduleKey]
        );
    };

    const toggleAction = (moduleKey: string, actionKey: string) => {
        setDetailedPermissions((prev: any) => {
            const modulePerms = prev[moduleKey] || {};
            const currentVal = modulePerms[actionKey] === true; // Default to undefined/false

            return {
                ...prev,
                [moduleKey]: {
                    ...modulePerms,
                    [actionKey]: !currentVal
                }
            };
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!id || !staff) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-20 flex flex-col items-center justify-center">
                <div className="text-center">
                    <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Staff Not Found</h2>
                    <p className="text-gray-500 mb-6">Could not load staff permissions. Please try again.</p>
                    <button
                        onClick={() => onBack ? onBack() : navigate('/admin')}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-20">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 sticky top-16 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => onBack ? onBack() : navigate('/admin')}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                            >
                                <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Shield size={24} className="text-indigo-600" />
                                    Permission Settings
                                </h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {staff?.name} ({staff?.role})
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* 1. Global Module Access */}
                <section>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <CheckCircle size={20} className="text-emerald-500" />
                        Allowed Modules
                    </h2>
                    <p className="text-sm text-gray-500 mb-4 -mt-2">Enable modules to give this staff member access. Disabling a module hides it from their sidebar.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {Object.entries(PERMISSION_CONFIG).map(([key, config]) => {
                            const isAllowed = allowedModules.includes(key);
                            const Icon = config.icon;
                            return (
                                <div
                                    key={key}
                                    onClick={() => toggleModule(key)}
                                    className={`relative cursor-pointer group p-4 rounded-xl border-2 transition-all duration-200 ${isAllowed
                                        ? 'bg-white dark:bg-slate-800 border-indigo-500 shadow-md transform scale-[1.01]'
                                        : 'bg-gray-50 dark:bg-slate-800/50 border-transparent hover:border-gray-200 opacity-60 hover:opacity-100'
                                        }`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className={`p-2 rounded-lg ${isAllowed ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'}`}>
                                            <Icon size={24} />
                                        </div>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${isAllowed ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
                                            }`}>
                                            {isAllowed && <CheckCircle size={14} className="text-white" />}
                                        </div>
                                    </div>
                                    <h3 className={`font-semibold ${isAllowed ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{config.label}</h3>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{config.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <div className="border-t border-gray-200 dark:border-slate-700 my-8"></div>

                {/* 2. Granular Permissions (Only show if module is allowed) */}
                <section className="space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Lock size={20} className="text-amber-500" />
                        Granular Restrictions
                    </h2>

                    <div className="grid grid-cols-1 gap-6">
                        {Object.entries(PERMISSION_CONFIG).map(([moduleKey, config]) => {
                            if (!allowedModules.includes(moduleKey)) return null; // Hide if not allowed

                            const Icon = config.icon;
                            return (
                                <div key={moduleKey} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                    <div className="px-6 py-4 bg-gray-50/50 dark:bg-slate-700/30 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3">
                                        <Icon size={20} className="text-indigo-600" />
                                        <h3 className="font-bold text-gray-900 dark:text-white">{config.label} Permissions</h3>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {config.actions.map((action: any) => {
                                                const isEnabled = detailedPermissions[moduleKey]?.[action.key] === true;
                                                return (
                                                    <label key={action.key} className="flex items-start gap-3 cursor-pointer group">
                                                        <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${isEnabled ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400 bg-white'
                                                            }`}>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={isEnabled}
                                                                onChange={() => toggleAction(moduleKey, action.key)}
                                                            />
                                                            {isEnabled && <CheckCircle size={14} className="text-white" />}
                                                        </div>
                                                        <div>
                                                            <span className={`block text-sm font-medium transition-colors ${isEnabled ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
                                                                {action.label}
                                                            </span>
                                                            <span className="text-xs text-gray-400 block mt-0.5">{action.description}</span>
                                                        </div>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}
