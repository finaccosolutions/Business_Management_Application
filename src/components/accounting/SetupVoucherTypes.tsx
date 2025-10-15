import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { CheckCircle, X } from 'lucide-react';

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
      name: 'Item Invoice',
      code: 'ITMINV',
      description: 'For recording item-based billing transactions',
      display_order: 1,
    },
    {
      name: 'Invoice',
      code: 'INV',
      description: 'For recording service invoices and billing transactions',
      display_order: 2,
    },
    {
      name: 'Receipt Voucher',
      code: 'RV',
      description: 'For recording all cash and bank receipt transactions',
      display_order: 3,
    },
    {
      name: 'Payment Voucher',
      code: 'PV',
      description: 'For recording all cash and bank payment transactions',
      display_order: 4,
    },
    {
      name: 'Contra Voucher',
      code: 'CV',
      description: 'For recording internal fund transfers between cash and bank accounts',
      display_order: 5,
    },
    {
      name: 'Journal Voucher',
      code: 'JV',
      description: 'For recording general journal entries and adjustments',
      display_order: 6,
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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
          <h2 className="text-2xl font-bold text-white">Setup Default Voucher Types</h2>
          <button
            onClick={onCancel}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-700 mb-6">
            To get started with vouchers, we'll create the following default voucher types for you:
          </p>

          <div className="space-y-3 mb-6">
            {defaultVoucherTypes.map((type) => (
              <div key={type.code} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900">{type.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{type.description}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-600 mb-6">
            You can always add more custom voucher types later or modify these as needed.
          </p>

          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              disabled={loading}
            >
              Skip for Now
            </button>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Voucher Types'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
