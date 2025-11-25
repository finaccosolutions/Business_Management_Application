export type ReportType =
  | 'trial_balance'
  | 'balance_sheet'
  | 'profit_loss'
  | 'chart_of_accounts_ledgers'
  | 'chart_of_accounts_groups';

export interface ReportColumn {
  id: string;
  label: string;
  description: string;
}

export const reportColumnConfigs: Record<ReportType, ReportColumn[]> = {
  trial_balance: [
    { id: 'opening_balance', label: 'Opening Balance', description: 'Account opening balance' },
    { id: 'transactions_debit', label: 'Debit', description: 'Total debit transactions' },
    { id: 'transactions_credit', label: 'Credit', description: 'Total credit transactions' },
    { id: 'closing_balance', label: 'Closing Balance', description: 'Account closing balance' },
  ],
  balance_sheet: [
    { id: 'opening_balance', label: 'Opening Balance', description: 'Opening balance as of period start' },
    { id: 'closing_balance', label: 'Closing Balance', description: 'Balance as of period end' },
  ],
  profit_loss: [
    { id: 'opening_balance', label: 'Opening Balance', description: 'Opening balance' },
    { id: 'transactions_debit', label: 'Debit', description: 'Total debit transactions' },
    { id: 'transactions_credit', label: 'Credit', description: 'Total credit transactions' },
    { id: 'closing_balance', label: 'Closing Balance', description: 'Net amount (income - expense)' },
  ],
  chart_of_accounts_ledgers: [
    { id: 'code', label: 'Code', description: 'Account code' },
    { id: 'name', label: 'Account Name', description: 'Account name' },
    { id: 'group', label: 'Group', description: 'Account group' },
    { id: 'opening_balance', label: 'Opening Balance', description: 'Opening balance' },
    { id: 'closing_balance', label: 'Closing Balance', description: 'Current balance' },
  ],
  chart_of_accounts_groups: [
    { id: 'name', label: 'Group Name', description: 'Group name' },
    { id: 'description', label: 'Description', description: 'Group description' },
    { id: 'ledger_count', label: 'Ledger Count', description: 'Number of ledgers in group' },
    { id: 'closing_balance', label: 'Closing Balance', description: 'Group total balance' },
  ],
};

export const defaultColumnConfigs: Record<ReportType, string[]> = {
  trial_balance: ['opening_balance', 'transactions_debit', 'transactions_credit', 'closing_balance'],
  balance_sheet: ['opening_balance', 'closing_balance'],
  profit_loss: ['opening_balance', 'transactions_debit', 'transactions_credit', 'closing_balance'],
  chart_of_accounts_ledgers: ['code', 'name', 'group', 'opening_balance', 'closing_balance'],
  chart_of_accounts_groups: ['name', 'description', 'ledger_count', 'closing_balance'],
};

export const reportTypeLabels: Record<ReportType, string> = {
  trial_balance: 'Trial Balance',
  balance_sheet: 'Balance Sheet',
  profit_loss: 'Profit & Loss',
  chart_of_accounts_ledgers: 'Chart of Accounts - Ledgers',
  chart_of_accounts_groups: 'Chart of Accounts - Groups',
};
