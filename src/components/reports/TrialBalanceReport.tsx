import { useState } from 'react';
import { Download, Search, FileSpreadsheet, Settings } from 'lucide-react';
import { formatDateDisplay } from '../../lib/dateUtils';
import { exportToXLSX, exportToPDF } from '../../lib/exportUtils';
import ViewToggle, { ViewType } from './ViewToggle';
import ReportSettingsModal from '../ReportSettingsModal';
import { useReportSettings } from '../../hooks/useReportSettings';

interface TrialBalanceEntry {
  account_id: string;
  account_code: string;
  account_name: string;
  group_name: string;
  debit: number;
  credit: number;
}

interface TrialBalanceReportProps {
  data: TrialBalanceEntry[];
  startDate: string;
  endDate: string;
  onAccountClick: (accountId: string, startDate: string, endDate: string) => void;
}

export default function TrialBalanceReport({
  data,
  startDate,
  endDate,
  onAccountClick,
}: TrialBalanceReportProps) {
  const [viewType, setViewType] = useState<ViewType>('horizontal');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const { visibleColumns, updateSettings } = useReportSettings('trial_balance');

  const filteredData = data
    .filter(
      (entry) =>
        entry.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.account_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.group_name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter(entry => entry.debit > 0 || entry.credit > 0);

  const totalDebit = filteredData.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = filteredData.reduce((sum, e) => sum + e.credit, 0);

  const handleAccountClick = (accountId: string) => {
    // Store return path before navigating
    sessionStorage.setItem('ledgerReturnPath', '/reports');
    onAccountClick(accountId, startDate, endDate);
  };

  const renderHorizontalView = () => {
    const showDebit = visibleColumns.includes('transactions_debit');
    const showCredit = visibleColumns.includes('transactions_credit');

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b-2 border-blue-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Account Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Group
                </th>
                {showDebit && (
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Debit (₹)
                  </th>
                )}
                {showCredit && (
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Credit (₹)
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((entry, index) => (
                <tr
                  key={index}
                  onClick={() => handleAccountClick(entry.account_id)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-mono text-blue-600">{entry.account_code}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{entry.account_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{entry.group_name}</td>
                  {showDebit && (
                    <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                      {entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                  )}
                  {showCredit && (
                    <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                      {entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="bg-gradient-to-r from-gray-100 to-blue-100 font-bold border-t-2 border-gray-300">
                <td colSpan={3} className="px-6 py-4 text-sm text-gray-900 uppercase">
                  Total
                </td>
                {showDebit && (
                  <td className="px-6 py-4 text-sm text-right text-blue-600">
                    ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                )}
                {showCredit && (
                  <td className="px-6 py-4 text-sm text-right text-red-600">
                    ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTFormView = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="border-r-2 border-gray-300 pr-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 bg-blue-50 p-3 rounded-lg">
            Debit Side
          </h3>
          <div className="space-y-2">
            {filteredData
              .filter((e) => e.debit > 0)
              .map((entry, index) => (
                <div
                  key={index}
                  onClick={() => handleAccountClick(entry.account_id)}
                  className="flex justify-between items-center p-3 hover:bg-blue-50 rounded-lg cursor-pointer border border-gray-100"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{entry.account_name}</p>
                    <p className="text-xs text-gray-500">{entry.group_name}</p>
                  </div>
                  <span className="text-sm font-semibold text-blue-600">
                    ₹{entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            <div className="flex justify-between items-center p-4 bg-blue-100 rounded-lg font-bold border-2 border-blue-300">
              <span className="text-gray-900 uppercase">Total Debit</span>
              <span className="text-blue-700">
                ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div className="pl-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 bg-red-50 p-3 rounded-lg">
            Credit Side
          </h3>
          <div className="space-y-2">
            {filteredData
              .filter((e) => e.credit > 0)
              .map((entry, index) => (
                <div
                  key={index}
                  onClick={() => handleAccountClick(entry.account_id)}
                  className="flex justify-between items-center p-3 hover:bg-red-50 rounded-lg cursor-pointer border border-gray-100"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{entry.account_name}</p>
                    <p className="text-xs text-gray-500">{entry.group_name}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600">
                    ₹{entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            <div className="flex justify-between items-center p-4 bg-red-100 rounded-lg font-bold border-2 border-red-300">
              <span className="text-gray-900 uppercase">Total Credit</span>
              <span className="text-red-700">
                ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Trial Balance</h2>
          <p className="text-sm text-gray-600 mt-1">
            Period: {formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow-sm transition-colors"
            title="Configure report columns"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <ViewToggle
            currentView={viewType}
            onViewChange={setViewType}
            availableViews={['horizontal', 't-form']}
          />
          <button
            onClick={() => {
              const exportData = filteredData.map(entry => ({
                'Account Code': entry.account_code,
                'Account Name': entry.account_name,
                'Group': entry.group_name,
                'Debit': entry.debit,
                'Credit': entry.credit,
              }));
              exportToXLSX(exportData, `trial_balance_${startDate}_to_${endDate}`, 'Trial Balance');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={() => {
              const exportData = filteredData.map(entry => ({
                code: entry.account_code,
                name: entry.account_name,
                group: entry.group_name,
                debit: entry.debit,
                credit: entry.credit,
              }));
              const columns = [
                { header: 'Code', key: 'code' },
                { header: 'Account Name', key: 'name' },
                { header: 'Group', key: 'group' },
                { header: 'Debit (₹)', key: 'debit' },
                { header: 'Credit (₹)', key: 'credit' },
              ];
              exportToPDF(
                exportData,
                columns,
                `trial_balance_${startDate}_to_${endDate}`,
                'Trial Balance',
                `Period: ${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`
              );
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by account name, code, or group..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No transactions found for the selected period</p>
        </div>
      ) : viewType === 't-form' ? (
        renderTFormView()
      ) : (
        renderHorizontalView()
      )}

      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> Click on any account to view its detailed ledger transactions.
          The difference between total debit and credit should be zero for a balanced trial balance.
        </p>
        {Math.abs(totalDebit - totalCredit) > 0.01 && (
          <p className="text-sm text-red-600 mt-2 font-semibold">
            ⚠️ Warning: Trial Balance is not balanced. Difference: ₹
            {Math.abs(totalDebit - totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

      <ReportSettingsModal
        reportType="trial_balance"
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={updateSettings}
      />
    </div>
  );
}
