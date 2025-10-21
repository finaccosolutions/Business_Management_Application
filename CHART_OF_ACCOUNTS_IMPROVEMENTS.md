# Chart of Accounts Improvements

## Summary of Changes

### 1. Inline Group Expansion (Accordion Style)
When clicking on any group name (in table view or card view), the group expands inline in the same page showing:
- Action buttons to add child groups or ledgers directly under the selected group
- List of child groups (sub-groups) if any exist
- List of all ledgers in that group with their balances
- All content expands/collapses accordion-style without opening a new window

### 2. Enhanced Group Management
- **Add Child Group**: Easily create a sub-group under any selected group. The parent group is automatically set.
- **Add Ledger**: Quickly add a ledger to a specific group. The group is pre-selected in the form.
- **Navigate Sub-Groups**: Click on child groups to expand them inline and view their contents.

### 3. Updated Default Account Groups Structure

#### Assets
- **Current Assets** (parent)
  - Cash in Hand
  - Bank Account
  - Accounts Receivable
- **Fixed Assets**

#### Liabilities
- **Current Liabilities** (parent)
  - Accounts Payable
  - Tax Liabilities
- **Non-Current Liabilities**

#### Income
- **Direct Income** (for core business revenue)
- **Indirect Income** (for non-core revenue)

#### Expenses
- **Direct Expenses** (expenses directly related to service delivery)
- **Indirect Expenses** (operating expenses not directly tied to service delivery)

#### Equity
- **Capital**
- **Retained Earnings**

## Benefits

1. **Better Navigation**: Users can easily explore the account hierarchy and see relationships between groups and ledgers without leaving the page.

2. **Improved Gross Profit Calculation**: The separation of Direct/Indirect Income and Direct/Indirect Expenses allows for proper gross profit calculation in P&L reports.

3. **Hierarchical Structure**: Cash in Hand, Bank Account, and Accounts Receivable are now properly organized under Current Assets for better financial reporting.

4. **User-Friendly**: Accordion-style expansion keeps users in context. Quick action buttons make it easy to add child groups or ledgers directly under the selected group.

5. **Professional Accounting Structure**: The new default groups follow standard accounting principles suitable for service businesses.

## Usage

1. **Expand/Collapse Groups**: Click on any group name to expand and see its contents inline
2. **Add Child Group**: In the expanded section, click "Add Child Group" to create a sub-group
3. **Add Ledger**: In the expanded section, click "Add Ledger" to add a ledger to that group
4. **Navigate Sub-Groups**: Click on child groups to expand them and view their contents
5. **Click Account**: Click on any ledger to view its transaction details

## Technical Details

- Updated migration: `20251021180000_update_default_account_groups_structure.sql`
- Modified: `ChartOfAccounts.tsx` to implement accordion-style inline expansion
- Uses expandedGroups state to track which groups are currently expanded
