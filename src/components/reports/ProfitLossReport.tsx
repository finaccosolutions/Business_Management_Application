import { useState } from 'react';
import { Download, Search, TrendingUp, FileSpreadsheet } from 'lucide-react';
import { formatDateDisplay } from '../../lib/dateUtils';
import { exportToXLSX, exportToPDF } from '../../lib/exportUtils';
import ViewToggle, { ViewType } from './ViewToggle';

interface ProfitLossAccount {
  account_id: string;
  account_name: string;
  amount: number;
}

interface ProfitLossEntry {
  category: string;
  accounts: ProfitLossAccount[];
  total: number;
  type: 'income' | 'expense';
}

interface ProfitLossReportProps {
  data: ProfitLossEntry[];
  startDate: string;
  endDate: string;
  onAccountClick: (accountId: string, startDate: string, endDate: string) => void;
}

export default function ProfitLossReport({
  data,
  startDate,
  endDate,
  onAccountClick,
}: ProfitLossReportProps) {
  const [viewType, setViewType] = useState<ViewType>('horizontal');
  const [searchTerm, setSearchTerm] = useState('');

  const income = data.filter((entry) => entry.type === 'income');
  const expenses = data.filter((entry) => entry.type === 'expense');

  const totalIncome = income.reduce((sum, e) => sum + e.total, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
  const netProfitLoss = totalIncome - totalExpenses;

  const filterAccounts = (accounts: ProfitLossAccount[]) =>
    accounts.filter((acc) =>
      acc.account_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const handleAccountClick = (accountId: string) => {
    // Store return path before navigating
    sessionStorage.setItem('ledgerReturnPath', '/reports');
    onAccountClick(accountId, startDate, endDate);
  };

  const renderVerticalView = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="space-y-8">
        <div>
          <h3 className="text-xl font-bold text-green-700 mb-4 pb-2 border-b-2 border-green-200">
            Income
          </h3>
          {income.map((entry, index) => (
            <div key={index} className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-3 text-lg">{entry.category}</h4>
              <div className="space-y-1">
                {filterAccounts(entry.accounts).map((account, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleAccountClick(account.account_id)}
                    className="flex justify-between items-center py-2 px-4 hover:bg-green-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="text-gray-700">{account.account_name}</span>
                    <span className="font-medium text-gray-900">
                      ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center py-3 px-4 mt-2 bg-green-50 rounded-lg border-t-2 border-green-200">
                <span className="font-semibold text-gray-800">Total {entry.category}</span>
                <span className="font-bold text-green-700">
                  ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center py-4 px-4 mt-4 bg-gradient-to-r from-green-100 to-green-200 rounded-lg border-2 border-green-300">
            <span className="font-bold text-gray-900 text-lg uppercase">Total Income</span>
            <span className="font-bold text-green-900 text-xl">
              ₹{totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold text-red-700 mb-4 pb-2 border-b-2 border-red-200">
            Expenses
          </h3>
          {expenses.map((entry, index) => (
            <div key={index} className="mb-6">
              <h4 className="font-semibold text-gray-800 mb-3 text-lg">{entry.category}</h4>
              <div className="space-y-1">
                {filterAccounts(entry.accounts).map((account, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleAccountClick(account.account_id)}
                    className="flex justify-between items-center py-2 px-4 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
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
            <span className="font-bold text-gray-900 text-lg uppercase">Total Expenses</span>
            <span className="font-bold text-red-900 text-xl">
              ₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div
          className={`rounded-xl p-6 border-2 ${
            netProfitLoss >= 0
              ? 'bg-gradient-to-r from-green-100 to-green-200 border-green-400'
              : 'bg-gradient-to-r from-red-100 to-red-200 border-red-400'
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-900 text-xl uppercase">
              {netProfitLoss >= 0 ? 'Net Profit' : 'Net Loss'}
            </span>
            <span
              className={`font-bold text-3xl ${
                netProfitLoss >= 0 ? 'text-green-800' : 'text-red-800'
              }`}
            >
              ₹{Math.abs(netProfitLoss).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTFormView = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="border-r-2 border-gray-300 pr-6">
          <h3 className="text-xl font-bold text-red-700 mb-4 bg-red-50 p-3 rounded-lg">
            Expenses & Losses (Dr.)
          </h3>
          {expenses.map((entry, index) => (
            <div key={index} className="mb-4">
              <h4 className="font-semibold text-gray-800 mb-2 text-sm uppercase bg-gray-50 p-2 rounded">
                {entry.category}
              </h4>
              <div className="space-y-1 ml-2">
                {filterAccounts(entry.accounts).map((account, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleAccountClick(account.account_id)}
                    className="flex justify-between items-center py-2 px-3 hover:bg-red-50 rounded cursor-pointer text-sm"
                  >
                    <span className="text-gray-700">{account.account_name}</span>
                    <span className="font-medium text-gray-900">
                      ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center py-2 px-3 mt-1 bg-red-50 rounded border-t border-red-200 text-sm">
                <span className="font-semibold text-gray-800">{entry.category}</span>
                <span className="font-bold text-red-700">
                  ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
          {netProfitLoss > 0 && (
            <div className="flex justify-between items-center py-3 px-3 mt-4 bg-green-100 rounded-lg font-bold border-2 border-green-400">
              <span className="text-green-900">Net Profit</span>
              <span className="text-green-800">
                ₹{netProfitLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center py-3 px-3 mt-2 bg-gray-100 rounded-lg font-bold border-2 border-gray-300">
            <span className="text-gray-900">TOTAL</span>
            <span className="text-gray-800">
              ₹{(totalExpenses + (netProfitLoss > 0 ? netProfitLoss : 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="pl-6">
          <h3 className="text-xl font-bold text-green-700 mb-4 bg-green-50 p-3 rounded-lg">
            Income & Gains (Cr.)
          </h3>
          {income.map((entry, index) => (
            <div key={index} className="mb-4">
              <h4 className="font-semibold text-gray-800 mb-2 text-sm uppercase bg-gray-50 p-2 rounded">
                {entry.category}
              </h4>
              <div className="space-y-1 ml-2">
                {filterAccounts(entry.accounts).map((account, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleAccountClick(account.account_id)}
                    className="flex justify-between items-center py-2 px-3 hover:bg-green-50 rounded cursor-pointer text-sm"
                  >
                    <span className="text-gray-700">{account.account_name}</span>
                    <span className="font-medium text-gray-900">
                      ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center py-2 px-3 mt-1 bg-green-50 rounded border-t border-green-200 text-sm">
                <span className="font-semibold text-gray-800">{entry.category}</span>
                <span className="font-bold text-green-700">
                  ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
          {netProfitLoss < 0 && (
            <div className="flex justify-between items-center py-3 px-3 mt-4 bg-red-100 rounded-lg font-bold border-2 border-red-400">
              <span className="text-red-900">Net Loss</span>
              <span className="text-red-800">
                ₹{Math.abs(netProfitLoss).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center py-3 px-3 mt-2 bg-gray-100 rounded-lg font-bold border-2 border-gray-300">
            <span className="text-gray-900">TOTAL</span>
            <span className="text-gray-800">
              ₹{(totalIncome + (netProfitLoss < 0 ? Math.abs(netProfitLoss) : 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
          <thead className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b-2 border-blue-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Expenses
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Amount (₹)
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Income
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Amount (₹)
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.from({ length: Math.max(expenses.reduce((sum, e) => sum + e.accounts.length + 2, 1), income.reduce((sum, e) => sum + e.accounts.length + 2, 1)) }).map((_, rowIndex) => {
              let expenseRow = null;
              let incomeRow = null;
              let expenseIdx = 0;
              let incomeIdx = 0;

              for (const entry of expenses) {
                if (expenseIdx === rowIndex) {
                  expenseRow = { type: 'category', name: entry.category, amount: null };
                  break;
                }
                expenseIdx++;
                for (const account of filterAccounts(entry.accounts)) {
                  if (expenseIdx === rowIndex) {
                    expenseRow = { type: 'account', name: account.account_name, amount: account.amount, id: account.account_id };
                    break;
                  }
                  expenseIdx++;
                }
                if (expenseRow) break;
                if (expenseIdx === rowIndex) {
                  expenseRow = { type: 'total', name: `Total ${entry.category}`, amount: entry.total };
                  break;
                }
                expenseIdx++;
              }

              for (const entry of income) {
                if (incomeIdx === rowIndex) {
                  incomeRow = { type: 'category', name: entry.category, amount: null };
                  break;
                }
                incomeIdx++;
                for (const account of filterAccounts(entry.accounts)) {
                  if (incomeIdx === rowIndex) {
                    incomeRow = { type: 'account', name: account.account_name, amount: account.amount, id: account.account_id };
                    break;
                  }
                  incomeIdx++;
                }
                if (incomeRow) break;
                if (incomeIdx === rowIndex) {
                  incomeRow = { type: 'total', name: `Total ${entry.category}`, amount: entry.total };
                  break;
                }
                incomeIdx++;
              }

              return (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  <td
                    className={`px-6 py-3 text-sm ${
                      expenseRow?.type === 'category' ? 'font-bold text-gray-900 bg-red-50' :
                      expenseRow?.type === 'total' ? 'font-semibold text-red-700 bg-red-50' :
                      expenseRow?.type === 'account' ? 'text-gray-700 cursor-pointer hover:text-red-600' :
                      ''
                    }`}
                    onClick={() => expenseRow?.type === 'account' && expenseRow.id && handleAccountClick(expenseRow.id)}
                  >
                    {expenseRow ? expenseRow.name : ''}
                  </td>
                  <td className={`px-6 py-3 text-sm text-right ${
                    expenseRow?.type === 'total' ? 'font-bold text-red-700' : 'font-medium text-gray-900'
                  }`}>
                    {expenseRow?.amount !== null && expenseRow?.amount !== undefined
                      ? `₹${expenseRow.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : ''}
                  </td>
                  <td
                    className={`px-6 py-3 text-sm ${
                      incomeRow?.type === 'category' ? 'font-bold text-gray-900 bg-green-50' :
                      incomeRow?.type === 'total' ? 'font-semibold text-green-700 bg-green-50' :
                      incomeRow?.type === 'account' ? 'text-gray-700 cursor-pointer hover:text-green-600' :
                      ''
                    }`}
                    onClick={() => incomeRow?.type === 'account' && incomeRow.id && handleAccountClick(incomeRow.id)}
                  >
                    {incomeRow ? incomeRow.name : ''}
                  </td>
                  <td className={`px-6 py-3 text-sm text-right ${
                    incomeRow?.type === 'total' ? 'font-bold text-green-700' : 'font-medium text-gray-900'
                  }`}>
                    {incomeRow?.amount !== null && incomeRow?.amount !== undefined
                      ? `₹${incomeRow.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : ''}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gradient-to-r from-gray-100 to-blue-100 font-bold border-t-2 border-gray-300">
              <td className="px-6 py-4 text-sm text-gray-900 uppercase">Total Expenses</td>
              <td className="px-6 py-4 text-sm text-right text-red-600">
                ₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="px-6 py-4 text-sm text-gray-900 uppercase">Total Income</td>
              <td className="px-6 py-4 text-sm text-right text-green-600">
                ₹{totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
            </tr>
            <tr className={`font-bold border-t-2 border-gray-300 ${netProfitLoss >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <td colSpan={2} className="px-6 py-4 text-sm text-gray-900 uppercase text-center">
                {netProfitLoss >= 0 ? 'Net Profit' : 'Net Loss'}
              </td>
              <td colSpan={2} className={`px-6 py-4 text-sm text-right ${netProfitLoss >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                ₹{Math.abs(netProfitLoss).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h2>
          <p className="text-sm text-gray-600 mt-1">
            Period: {formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ViewToggle
            currentView={viewType}
            onViewChange={setViewType}
            availableViews={['horizontal', 'vertical', 't-form']}
          />
          <button
            onClick={() => {
              const exportData = data.flatMap(entry =>
                entry.accounts.map(acc => ({
                  'Type': entry.type === 'income' ? 'Income' : 'Expense',
                  'Category': entry.category,
                  'Account': acc.account_name,
                  'Amount': acc.amount,
                }))
              );
              exportToXLSX(exportData, `profit_loss_${startDate}_to_${endDate}`, 'Profit & Loss');
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
                  type: entry.type === 'income' ? 'Income' : 'Expense',
                  category: entry.category,
                  account: acc.account_name,
                  amount: acc.amount,
                }))
              );
              const columns = [
                { header: 'Type', key: 'type' },
                { header: 'Category', key: 'category' },
                { header: 'Account', key: 'account' },
                { header: 'Amount (₹)', key: 'amount' },
              ];
              exportToPDF(
                exportData,
                columns,
                `profit_loss_${startDate}_to_${endDate}`,
                'Profit & Loss Statement',
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
            placeholder="Search by account name..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">No profit & loss data available for the selected period</p>
        </div>
      ) : viewType === 'vertical' ? (
        renderVerticalView()
      ) : viewType === 't-form' ? (
        renderTFormView()
      ) : (
        renderHorizontalView()
      )}

      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> Click on any account to view its detailed ledger transactions.
          This statement shows the financial performance for the period from {formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}.
        </p>
      </div>
    </div>
  );
}
