import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { CheckCircle, X, ShieldCheck } from 'lucide-react';

interface SetupVoucherTypesProps {
  onComplete: () => void;
  onCancel: () => void;
}

export default function SetupVoucherTypes({ onComplete, onCancel }: SetupVoucherTypesProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const defaultVoucherTypes = [
    {
      name: 'Invoice',
      code: 'INV',
      description: 'Service invoices and billing',
      display_order: 1,
    },
    {
      name: 'Receipt Voucher',
      code: 'RV',
      description: 'Cash and bank receipts',
      display_order: 2,
    },
    {
      name: 'Payment Voucher',
      code: 'PV',
      description: 'Cash and bank payments',
      display_order: 3,
    },
    {
      name: 'Contra Voucher',
      code: 'CV',
      description: 'Internal fund transfers',
      display_order: 4,
    },
    {
      name: 'Journal Voucher',
      code: 'JV',
      description: 'Adjustments and general entries',
      display_order: 5,
    },
  ];

  const handleSetup = async () => {
    setLoading(true);
    try {
      const voucherTypesData = defaultVoucherTypes.map((type) => ({
        user_id: user!.id,
        name: type.name,
        code: type.code,
        description: type.description,
        display_order: type.display_order,
        is_active: true,
      }));

      const { error } = await supabase.from('voucher_types').insert(voucherTypesData);

      if (error) throw error;

      toast.success('Default voucher types created successfully!');
      onComplete();
    } catch (error: any) {
      console.error('Error creating voucher types:', error);
      toast.error(error.message || 'Failed to create voucher types');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Setup Accounting</h2>
              <p className="text-sm text-gray-500">Initialize default voucher types</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-600 mb-6 text-sm">
            To start using the accounting module, we need to create these standard voucher types for your organization:
          </p>

          <div className="space-y-3 mb-8">
            {defaultVoucherTypes.map((type) => (
              <div key={type.code} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors shadow-sm">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{type.name}</h3>
                  <p className="text-xs text-gray-500">{type.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={loading}
            >
              Skip
            </button>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-md shadow-blue-200 disabled:opacity-50"
            >
              {loading ? 'Setting up...' : 'Initialize Accounting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
