import { Hash, Eye, Users, Briefcase, ClipboardList, FileText } from 'lucide-react';

interface IDConfigType {
  type: string;
  label: string;
  icon: any;
  prefix: string;
  suffix: string;
  width: number;
  prefixZero: boolean;
  startingNumber: number;
  description: string;
}

interface UnifiedIDConfigProps {
  settings: any;
  onUpdateSettings: (updates: any) => void;
}

export default function UnifiedIDConfig({ settings, onUpdateSettings }: UnifiedIDConfigProps) {
  const idTypes: IDConfigType[] = [
    {
      type: 'invoice',
      label: 'Invoice',
      icon: FileText,
      prefix: settings.invoice_prefix || 'INV',
      suffix: settings.invoice_suffix || '',
      width: settings.invoice_number_width || 6,
      prefixZero: settings.invoice_number_prefix_zero !== false,
      startingNumber: settings.invoice_starting_number || 1,
      description: 'Invoice numbering for billing documents',
    },
    {
      type: 'receipt',
      label: 'Receipt',
      icon: FileText,
      prefix: settings.receipt_prefix || 'RCT',
      suffix: settings.receipt_suffix || '',
      width: settings.receipt_number_width || 6,
      prefixZero: settings.receipt_number_prefix_zero !== false,
      startingNumber: settings.receipt_starting_number || 1,
      description: 'Receipt voucher numbers for payments received',
    },
    {
      type: 'payment',
      label: 'Payment',
      icon: FileText,
      prefix: settings.payment_prefix || 'PAY',
      suffix: settings.payment_suffix || '',
      width: settings.payment_number_width || 6,
      prefixZero: settings.payment_number_prefix_zero !== false,
      startingNumber: settings.payment_starting_number || 1,
      description: 'Payment voucher numbers for payments made',
    },
    {
      type: 'journal',
      label: 'Journal',
      icon: FileText,
      prefix: settings.journal_prefix || 'JV',
      suffix: settings.journal_suffix || '',
      width: settings.journal_number_width || 6,
      prefixZero: settings.journal_number_prefix_zero !== false,
      startingNumber: settings.journal_starting_number || 1,
      description: 'Journal voucher numbers for accounting entries',
    },
    {
      type: 'contra',
      label: 'Contra',
      icon: FileText,
      prefix: settings.contra_prefix || 'CNT',
      suffix: settings.contra_suffix || '',
      width: settings.contra_number_width || 6,
      prefixZero: settings.contra_number_prefix_zero !== false,
      startingNumber: settings.contra_starting_number || 1,
      description: 'Contra voucher numbers for bank-to-bank transfers',
    },
    {
      type: 'credit_note',
      label: 'Credit Note',
      icon: FileText,
      prefix: settings.credit_note_prefix || 'CN',
      suffix: settings.credit_note_suffix || '',
      width: settings.credit_note_number_width || 6,
      prefixZero: settings.credit_note_number_prefix_zero !== false,
      startingNumber: settings.credit_note_starting_number || 1,
      description: 'Credit note numbers for customer refunds',
    },
    {
      type: 'debit_note',
      label: 'Debit Note',
      icon: FileText,
      prefix: settings.debit_note_prefix || 'DN',
      suffix: settings.debit_note_suffix || '',
      width: settings.debit_note_number_width || 6,
      prefixZero: settings.debit_note_number_prefix_zero !== false,
      startingNumber: settings.debit_note_starting_number || 1,
      description: 'Debit note numbers for supplier returns',
    },
    {
      type: 'customer_id',
      label: 'Customer ID',
      icon: Users,
      prefix: settings.customer_id_prefix || 'CUST',
      suffix: settings.customer_id_suffix || '',
      width: settings.customer_id_number_width || 4,
      prefixZero: settings.customer_id_prefix_zero !== false,
      startingNumber: settings.customer_id_starting_number || 1,
      description: 'Auto-generated customer identification numbers',
    },
    {
      type: 'employee_id',
      label: 'Employee ID',
      icon: Users,
      prefix: settings.employee_id_prefix || 'EMP',
      suffix: settings.employee_id_suffix || '',
      width: settings.employee_id_number_width || 4,
      prefixZero: settings.employee_id_prefix_zero !== false,
      startingNumber: settings.employee_id_starting_number || 1,
      description: 'Auto-generated employee identification numbers',
    },
    {
      type: 'service_code',
      label: 'Service Code',
      icon: Briefcase,
      prefix: settings.service_code_prefix || 'SRV',
      suffix: settings.service_code_suffix || '',
      width: settings.service_code_number_width || 4,
      prefixZero: settings.service_code_prefix_zero !== false,
      startingNumber: settings.service_code_starting_number || 1,
      description: 'Auto-generated service identification codes',
    },
    {
      type: 'work_id',
      label: 'Work ID',
      icon: ClipboardList,
      prefix: settings.work_id_prefix || 'WRK',
      suffix: settings.work_id_suffix || '',
      width: settings.work_id_number_width || 4,
      prefixZero: settings.work_id_prefix_zero !== false,
      startingNumber: settings.work_id_starting_number || 1,
      description: 'Auto-generated work instance identification numbers',
    },
  ];

  const handleConfigChange = (type: string, field: string, value: any) => {
    const fieldMap: Record<string, string> = {
      prefix: `${type}_prefix`,
      suffix: `${type}_suffix`,
      width: `${type}_number_width`,
      prefixZero: `${type}_number_prefix_zero`,
      startingNumber: `${type}_starting_number`,
    };

    onUpdateSettings({ [fieldMap[field]]: value });
  };

  const previewID = (config: IDConfigType) => {
    const number = config.prefixZero
      ? config.startingNumber.toString().padStart(config.width, '0')
      : config.startingNumber.toString();
    return `${config.prefix}${number}${config.suffix}`;
  };

  const renderSectionHeader = (title: string, description: string) => (
    <div className="mb-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4 border-2 border-blue-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-700">{description}</p>
    </div>
  );

  // Group configurations
  const voucherTypes = idTypes.filter((t) =>
    ['invoice', 'receipt', 'payment', 'journal', 'contra', 'credit_note', 'debit_note'].includes(t.type)
  );
  const entityIDTypes = idTypes.filter((t) =>
    ['customer_id', 'employee_id', 'service_code', 'work_id'].includes(t.type)
  );

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
        <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Hash size={24} className="text-blue-600" />
          Unified ID Configuration
        </h2>
        <p className="text-sm text-gray-700">
          Configure auto-generation settings for all document numbers, vouchers, and entity IDs in your system.
          These settings control the format, prefix, suffix, and starting number for each type.
        </p>
      </div>

      {renderSectionHeader(
        'Voucher & Document Numbers',
        'Configure numbering for invoices, receipts, payments, and other accounting vouchers'
      )}

      {voucherTypes.map((config) => {
        const Icon = config.icon;
        return (
          <div key={config.type} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Icon size={20} className="text-blue-600" />
                </div>
                <div>
                  <h4 className="text-md font-semibold text-gray-900">{config.label}</h4>
                  <p className="text-xs text-gray-600">{config.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                <Eye size={16} className="text-blue-600" />
                <span className="text-sm font-mono text-blue-800">{previewID(config)}</span>
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
                <span className="ml-2 font-mono">{previewID(config)}</span>
                <span className="mx-1">|</span>
                <span className="font-mono">
                  {config.prefix}
                  {config.prefixZero ? '0010' : '10'}
                  {config.suffix}
                </span>
                <span className="mx-1">|</span>
                <span className="font-mono">
                  {config.prefix}
                  {config.prefixZero ? '0100' : '100'}
                  {config.suffix}
                </span>
              </p>
            </div>
          </div>
        );
      })}

      {renderSectionHeader(
        'Entity ID Numbers',
        'Configure auto-generated IDs for customers, employees, services, and work instances'
      )}

      {entityIDTypes.map((config) => {
        const Icon = config.icon;
        return (
          <div
            key={config.type}
            className="bg-white rounded-xl p-6 border-2 border-green-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Icon size={20} className="text-green-600" />
                </div>
                <div>
                  <h4 className="text-md font-semibold text-gray-900">{config.label}</h4>
                  <p className="text-xs text-gray-600">{config.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                <Eye size={16} className="text-green-600" />
                <span className="text-sm font-mono text-green-800">{previewID(config)}</span>
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="EMP"
                  maxLength={10}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Suffix</label>
                <input
                  type="text"
                  value={config.suffix}
                  onChange={(e) => handleConfigChange(config.type, 'suffix', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                  onChange={(e) => handleConfigChange(config.type, 'width', parseInt(e.target.value) || 4)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
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
                <span className="ml-2 font-mono">{previewID(config)}</span>
                <span className="mx-1">|</span>
                <span className="font-mono">
                  {config.prefix}
                  {config.prefixZero ? '0010' : '10'}
                  {config.suffix}
                </span>
                <span className="mx-1">|</span>
                <span className="font-mono">
                  {config.prefix}
                  {config.prefixZero ? '0100' : '100'}
                  {config.suffix}
                </span>
              </p>
            </div>
          </div>
        );
      })}

      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-900 font-medium mb-2">Important Notes:</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
          <li>Prefix is required and appears at the start of every ID</li>
          <li>Suffix is optional and appears at the end if specified</li>
          <li>Number width determines how many digits to display (with leading zeros if enabled)</li>
          <li>Starting number is the first number that will be used for new entries</li>
          <li>Prefix Zero fills numbers with leading zeros (e.g., 0001 instead of 1)</li>
          <li>Changes take effect for new IDs only, existing IDs are not affected</li>
          <li>Customer IDs, Employee IDs, Service Codes, and Work IDs are auto-generated when creating new entries</li>
        </ul>
      </div>
    </div>
  );
}
