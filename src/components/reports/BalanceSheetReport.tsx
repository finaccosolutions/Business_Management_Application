import { useState } from 'react';
import { Download, Search, Building2, FileSpreadsheet } from 'lucide-react';
import { formatDateDisplay } from '../../lib/dateUtils';
import { exportToXLSX, exportToPDF } from '../../lib/exportUtils';
import ViewToggle, { ViewType } from './ViewToggle';

interface BalanceSheetAccount {
  account_id: string;
  account_name: string;
  amount: number;
}

interface BalanceSheetEntry {
  category: string;
  accounts: BalanceSheetAccount[];
  total: number;
  type: 'asset' | 'liability' | 'equity';
}

interface BalanceSheetReportProps {
  data: BalanceSheetEntry[];
  asOnDate: string;
  startDate?: string;
  onAccountClick: (accountId: string, asOnDate: string) => void;
}

export default function BalanceSheetReport({
  data,
  asOnDate,
  startDate,
  onAccountClick,
}: BalanceSheetReportProps) {
  const [viewType, setViewType] = useState<ViewType>('horizontal');
  const [searchTerm, setSearchTerm] = useState('');

  const assets = data.filter((entry) => entry.type === 'asset');
  const liabilitiesAndEquity = data.filter((entry) => entry.type === 'liability' || entry.type === 'equity');

  const totalAssets = assets.reduce((sum, e) => sum + e.total, 0);
  const totalLiabilitiesAndEquity = liabilitiesAndEquity.reduce((sum, e) => sum + e.total, 0);

  const filterAccounts = (accounts: BalanceSheetAccount[]) =>
    accounts.filter((acc) =>
      acc.account_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const handleAccountClick = (accountId: string) => {
    if (accountId === 'net_profit') return; // Don't navigate for calculated profit
    sessionStorage.setItem('ledgerReturnPath', '/reports');
    onAccountClick(accountId, asOnDate);
  };

  const renderVerticalView = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-6 space-y-8">
        <div>
          <h3 className="text-xl font-bold text-blue-700 mb-4 pb-2 border-b-2 border-blue-200">
            Assets
          </h3>
          {assets.map((entry, index) => (
            <div key={index} className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-3 text-lg">{entry.category}</h4>
              <div className="space-y-1">
                {filterAccounts(entry.accounts).map((account, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleAccountClick(account.account_id)}
                    className="flex justify-between items-center py-2 px-4 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="text-gray-700">{account.account_name}</span>
                    <span className="font-medium text-gray-900">
                      ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center py-3 px-4 mt-2 bg-blue-50 rounded-lg border-t-2 border-blue-200">
                <span className="font-semibold text-gray-800">Total {entry.category}</span>
                <span className="font-bold text-blue-700">
                  ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center py-4 px-4 mt-4 bg-gradient-to-r from-blue-100 to-blue-200 rounded-lg border-2 border-blue-300">
            <span className="font-bold text-gray-900 text-lg uppercase">Total Assets</span>
            <span className="font-bold text-blue-900 text-xl">
              ₹{totalAssets.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold text-red-700 mb-4 pb-2 border-b-2 border-red-200">
            Liabilities
          </h3>
          {liabilitiesAndEquity.map((entry, index) => (
            <div key={index} className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-3 text-lg">{entry.category}</h4>
              <div className="space-y-1">
                {filterAccounts(entry.accounts).map((account, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleAccountClick(account.account_id)}
                    className={`flex justify-between items-center py-2 px-4 hover:bg-red-50 rounded-lg transition-colors ${account.account_id === 'net_profit' ? '' : 'cursor-pointer'
                      }`}
                  >
                    <span className="text-gray-700">{account.account_name}</span>
                    <span className="font-medium text-gray-900">
                      ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center py-3 px-4 mt-2 bg-red-50 rounded-lg border-t-2 border-red-200">
                <span className="font-semibold text-gray-800">Total {entry.category}</span>
                <span className="font-bold text-red-700">
                  ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center py-4 px-4 mt-4 bg-gradient-to-r from-red-100 to-red-200 rounded-lg border-2 border-red-300">
            <span className="font-bold text-gray-900 text-lg uppercase">Total Liabilities</span>
            <span className="font-bold text-red-900 text-xl">
              ₹{totalLiabilitiesAndEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHorizontalView = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-red-50 to-blue-50 border-b-2 border-gray-300">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-bold text-red-800 uppercase tracking-wider border-r border-gray-300">
                Liabilities
              </th>
              <th className="px-6 py-4 text-right text-sm font-bold text-red-800 uppercase tracking-wider border-r border-gray-300">
                Amount (₹)
              </th>
              <th className="px-6 py-4 text-left text-sm font-bold text-blue-800 uppercase tracking-wider border-r border-gray-300">
                Assets
              </th>
              <th className="px-6 py-4 text-right text-sm font-bold text-blue-800 uppercase tracking-wider">
                Amount (₹)
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.from({
              length: Math.max(
                assets.reduce((sum, e) => sum + e.accounts.length + 2, 1),
                liabilitiesAndEquity.reduce((sum, e) => sum + e.accounts.length + 2, 1)
              )
            }).map((_, rowIndex) => {
              let assetRow = null;
              let liabilityRow = null;
              let assetIdx = 0;
              let liabilityIdx = 0;

              for (const entry of assets) {
                if (assetIdx === rowIndex) {
                  assetRow = { type: 'category', name: entry.category, amount: null };
                  break;
                }
                assetIdx++;
                for (const account of filterAccounts(entry.accounts)) {
                  if (assetIdx === rowIndex) {
                    assetRow = { type: 'account', name: account.account_name, amount: account.amount, id: account.account_id };
                    break;
                  }
                  assetIdx++;
                }
                if (assetRow) break;
                if (assetIdx === rowIndex) {
                  assetRow = { type: 'total', name: `Total ${entry.category}`, amount: entry.total };
                  break;
                }
                assetIdx++;
              }

              for (const entry of liabilitiesAndEquity) {
                if (liabilityIdx === rowIndex) {
                  liabilityRow = { type: 'category', name: entry.category, amount: null };
                  break;
                }
                liabilityIdx++;
                for (const account of filterAccounts(entry.accounts)) {
                  if (liabilityIdx === rowIndex) {
                    liabilityRow = { type: 'account', name: account.account_name, amount: account.amount, id: account.account_id };
                    break;
                  }
                  liabilityIdx++;
                }
                if (liabilityRow) break;
                if (liabilityIdx === rowIndex) {
                  liabilityRow = { type: 'total', name: `Total ${entry.category}`, amount: entry.total };
                  break;
                }
                liabilityIdx++;
              }

              return (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  <td
                    className={`px-6 py-3 text-sm border-r border-gray-200 ${liabilityRow?.type === 'category' ? 'font-bold text-gray-900 bg-red-50' :
                        liabilityRow?.type === 'total' ? 'font-semibold text-red-700 bg-red-50' :
                          liabilityRow?.type === 'account' ? 'text-gray-700 pl-10' : ''
                      } ${liabilityRow?.id === 'net_profit' ? '' : 'cursor-pointer hover:text-red-600'}`}
                    onClick={() => liabilityRow?.type === 'account' && liabilityRow.id && liabilityRow.id !== 'net_profit' && handleAccountClick(liabilityRow.id)}
                  >
                    {liabilityRow ? liabilityRow.name : ''}
                  </td>
                  <td className={`px-6 py-3 text-sm text-right border-r border-gray-200 ${liabilityRow?.type === 'total' ? 'font-bold text-red-700 bg-red-50' :
                      liabilityRow?.type === 'account' ? 'font-medium text-gray-900' : ''
                    }`}>
                    {liabilityRow?.amount !== null && liabilityRow?.amount !== undefined
                      ? `₹${liabilityRow.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : ''}
                  </td>
                  <td
                    className={`px-6 py-3 text-sm border-r border-gray-200 ${assetRow?.type === 'category' ? 'font-bold text-gray-900 bg-blue-50' :
                        assetRow?.type === 'total' ? 'font-semibold text-blue-700 bg-blue-50' :
                          assetRow?.type === 'account' ? 'text-gray-700 cursor-pointer hover:text-blue-600 pl-10' :
                            ''
                      }`}
                    onClick={() => assetRow?.type === 'account' && assetRow.id && handleAccountClick(assetRow.id)}
                  >
                    {assetRow ? assetRow.name : ''}
                  </td>
                  <td className={`px-6 py-3 text-sm text-right ${assetRow?.type === 'total' ? 'font-bold text-blue-700 bg-blue-50' :
                      assetRow?.type === 'account' ? 'font-medium text-gray-900' : ''
                    }`}>
                    {assetRow?.amount !== null && assetRow?.amount !== undefined
                      ? `₹${assetRow.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : ''}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gradient-to-r from-red-100 to-blue-100 font-bold border-t-4 border-gray-400">
              <td className="px-6 py-4 text-sm text-gray-900 uppercase border-r border-gray-300">Total Liabilities</td>
              <td className="px-6 py-4 text-sm text-right text-red-700 text-lg border-r border-gray-300">
                ₹{totalLiabilitiesAndEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="px-6 py-4 text-sm text-gray-900 uppercase border-r border-gray-300">Total Assets</td>
              <td className="px-6 py-4 text-sm text-right text-blue-700 text-lg">
                ₹{totalAssets.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Balance Sheet</h2>
          <p className="text-sm text-gray-600 mt-1">
            As on {formatDateDisplay(asOnDate)}
            {startDate && ` (Period: ${formatDateDisplay(startDate)} to ${formatDateDisplay(asOnDate)})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ViewToggle
            currentView={viewType}
            onViewChange={setViewType}
            availableViews={['horizontal', 'vertical']}
          />
          <button
            onClick={() => {
              const exportData = data.flatMap(entry =>
                entry.accounts.map(acc => ({
                  'Category': entry.category,
                  'Account': acc.account_name,
                  'Amount': acc.amount,
                }))
              );
              exportToXLSX(exportData, `balance_sheet_${asOnDate}`, 'Balance Sheet');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={() => {
              const exportData = data.flatMap(entry =>
                entry.accounts.map(acc => ({
                  category: entry.category,
                  account: acc.account_name,
                  amount: acc.amount,
                }))
              );
              const columns = [
                { header: 'Category', key: 'category' },
                { header: 'Account', key: 'account' },
                { header: 'Amount (₹)', key: 'amount' },
              ];
              exportToPDF(
                exportData,
                columns,
                `balance_sheet_${asOnDate}`,
                'Balance Sheet',
                `As on ${formatDateDisplay(asOnDate)}`
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
            placeholder="Search by account name..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">No balance sheet data available</p>
        </div>
      ) : viewType === 'vertical' ? (
        renderVerticalView()
      ) : (
        renderHorizontalView()
      )}

      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> This Balance Sheet shows Liabilities on the left/top and Assets on the right/bottom.
          {startDate && ' Net Profit/Loss for the period is included in the Liabilities & Capital side.'}
          {' '}Click on any account to view its detailed ledger transactions.
        </p>
        {Math.abs(totalAssets - totalLiabilitiesAndEquity) > 0.01 && (
          <p className="text-sm text-red-600 mt-2 font-semibold">
            ⚠️ Warning: Balance Sheet is not balanced. Difference: ₹
            {Math.abs(totalAssets - totalLiabilitiesAndEquity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>
    </div>
  );
}
