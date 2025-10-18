// src/components/VoucherNumberConfig.tsx
import { Hash, Eye } from 'lucide-react';
import { previewVoucherNumber, VoucherType } from '../lib/voucherNumberGenerator';

interface VoucherConfig {
  type: VoucherType;
  label: string;
  prefix: string;
  suffix: string;
  width: number;
  prefixZero: boolean;
  startingNumber: number;
}

interface VoucherNumberConfigProps {
  settings: any;
  onUpdateSettings: (updates: any) => void;
}

export default function VoucherNumberConfig({ settings, onUpdateSettings }: VoucherNumberConfigProps) {
  const voucherTypes: VoucherConfig[] = [
    {
      type: 'invoice',
      label: 'Invoice',
      prefix: settings.invoice_prefix || 'INV',
      suffix: settings.invoice_suffix || '',
      width: settings.invoice_number_width || 6,
      prefixZero: settings.invoice_number_prefix_zero !== false,
      startingNumber: settings.invoice_starting_number || 1,
    },
    {
      type: 'receipt',
      label: 'Receipt',
      prefix: settings.receipt_prefix || 'RCT',
      suffix: settings.receipt_suffix || '',
      width: settings.receipt_number_width || 6,
      prefixZero: settings.receipt_number_prefix_zero !== false,
      startingNumber: settings.receipt_starting_number || 1,
    },
    {
      type: 'payment',
      label: 'Payment',
      prefix: settings.payment_prefix || 'PAY',
      suffix: settings.payment_suffix || '',
      width: settings.payment_number_width || 6,
      prefixZero: settings.payment_number_prefix_zero !== false,
      startingNumber: settings.payment_starting_number || 1,
    },
    {
      type: 'journal',
      label: 'Journal',
      prefix: settings.journal_prefix || 'JV',
      suffix: settings.journal_suffix || '',
      width: settings.journal_number_width || 6,
      prefixZero: settings.journal_number_prefix_zero !== false,
      startingNumber: settings.journal_starting_number || 1,
    },
    {
      type: 'contra',
      label: 'Contra',
      prefix: settings.contra_prefix || 'CNT',
      suffix: settings.contra_suffix || '',
      width: settings.contra_number_width || 6,
      prefixZero: settings.contra_number_prefix_zero !== false,
      startingNumber: settings.contra_starting_number || 1,
    },
    {
      type: 'credit_note',
      label: 'Credit Note',
      prefix: settings.credit_note_prefix || 'CN',
      suffix: settings.credit_note_suffix || '',
      width: settings.credit_note_number_width || 6,
      prefixZero: settings.credit_note_number_prefix_zero !== false,
      startingNumber: settings.credit_note_starting_number || 1,
    },
    {
      type: 'debit_note',
      label: 'Debit Note',
      prefix: settings.debit_note_prefix || 'DN',
      suffix: settings.debit_note_suffix || '',
      width: settings.debit_note_number_width || 6,
      prefixZero: settings.debit_note_number_prefix_zero !== false,
      startingNumber: settings.debit_note_starting_number || 1,
    },
  ];

  const handleConfigChange = (type: VoucherType, field: string, value: any) => {
    const fieldMap: Record<string, string> = {
      prefix: `${type}_prefix`,
      suffix: `${type}_suffix`,
      width: `${type}_number_width`,
      prefixZero: `${type}_number_prefix_zero`,
      startingNumber: `${type}_starting_number`,
    };

    onUpdateSettings({ [fieldMap[field]]: value });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Hash size={20} className="text-blue-600" />
          Voucher Number Configuration
        </h3>
        <p className="text-sm text-gray-700">
          Configure how voucher and invoice numbers are generated. These settings control the format,
          prefix, suffix, and starting number for all document types.
        </p>
      </div>

      {voucherTypes.map((config) => (
        <div key={config.type} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold text-gray-900">{config.label}</h4>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <Eye size={16} className="text-blue-600" />
              <span className="text-sm font-mono text-blue-800">
                {previewVoucherNumber(config.type, settings, 1)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Prefix <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={config.prefix}
                onChange={(e) => handleConfigChange(config.type, 'prefix', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="INV"
                maxLength={10}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Suffix</label>
              <input
                type="text"
                value={config.suffix}
                onChange={(e) => handleConfigChange(config.type, 'suffix', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Optional"
                maxLength={10}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Number Width <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={config.width}
                onChange={(e) => handleConfigChange(config.type, 'width', parseInt(e.target.value) || 6)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-0.5">Digits: 1-12</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Starting Number <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={config.startingNumber}
                onChange={(e) =>
                  handleConfigChange(config.type, 'startingNumber', parseInt(e.target.value) || 1)
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prefix Zero</label>
              <div className="flex items-center h-10">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.prefixZero}
                    onChange={(e) => handleConfigChange(config.type, 'prefixZero', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-3 text-sm font-medium text-gray-700">
                    {config.prefixZero ? 'Yes' : 'No'}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              <strong>Preview Examples:</strong>
              <span className="ml-2 font-mono">{previewVoucherNumber(config.type, settings, 1)}</span>
              <span className="mx-1">|</span>
              <span className="font-mono">{previewVoucherNumber(config.type, settings, 10)}</span>
              <span className="mx-1">|</span>
              <span className="font-mono">{previewVoucherNumber(config.type, settings, 100)}</span>
            </p>
          </div>
        </div>
      ))}

      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-900 font-medium mb-2">Important Notes:</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
          <li>Prefix is required and appears at the start of every number</li>
          <li>Suffix is optional and appears at the end if specified</li>
          <li>Number width determines how many digits to display (with leading zeros if enabled)</li>
          <li>Starting number is the first number that will be used</li>
          <li>Prefix Zero fills numbers with leading zeros (e.g., 000001 instead of 1)</li>
          <li>Changes take effect for new vouchers only, existing vouchers are not affected</li>
        </ul>
      </div>
    </div>
  );
}
