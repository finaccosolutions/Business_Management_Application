# Invoice and Voucher Automatic Status Management System

## Overview
The system now automatically manages invoice and voucher status changes with proper ledger posting and cleanup. All operations happen automatically in the database using triggers.

## Invoice Status Management

### 1. Draft → Sent/Other Status
**What happens:**
- Invoice is posted to ledger
- Debit: Customer Account (Accounts Receivable)
- Credit: Income Account (Revenue)

### 2. Any Status → Paid
**What happens:**
- Auto-creates a Receipt Voucher
- Voucher is immediately posted (status = 'posted')
- Uses default cash/bank ledger from company settings (`default_payment_receipt_type`)
- Maps customer account from `customer.account_id` or `invoice.customer_account_id`
- Creates ledger entries:
  - Debit: Cash/Bank Account (money received)
  - Credit: Customer Account (reducing receivable)

### 3. Paid → Any Other Status (except Draft)
**What happens:**
- Deletes the receipt voucher
- Deletes receipt voucher's ledger entries
- Invoice ledger entries remain intact

### 4. Any Status → Draft
**What happens:**
- Deletes invoice ledger entries
- Deletes ALL receipt vouchers for this invoice
- Deletes all receipt voucher ledger entries
- Complete cleanup - invoice back to initial state

### 5. Any Status → Cancelled
**What happens:**
- Deletes invoice ledger entries
- Deletes ALL receipt vouchers
- Deletes all related ledger entries
- Complete cleanup

## Voucher Status Management

### 1. Draft → Posted
**What happens:**
- All voucher entries are posted to ledger_transactions
- Each entry creates corresponding debit/credit in ledger

### 2. Posted/Other → Draft
**What happens:**
- Deletes all ledger entries for this voucher
- Voucher returns to draft state

### 3. Any Status → Cancelled
**What happens:**
- Deletes all ledger entries for this voucher
- Voucher is cancelled

## Key Features

### Duplicate Prevention
- System checks before posting to prevent duplicate ledger entries
- Each operation is idempotent

### Customer Account Mapping
- Receipt vouchers use `customer.account_id` (preferred)
- Falls back to `invoice.customer_account_id`
- Automatically updates `customer.account_id` if missing

### Cash/Bank Selection
- Uses `company_settings.default_payment_receipt_type` ('cash' or 'bank')
- Automatically selects correct ledger:
  - 'cash' → uses `default_cash_ledger_id`
  - 'bank' → uses `default_bank_ledger_id`

### Voucher Number Generation
- Auto-generates receipt voucher numbers
- Format: `{receipt_prefix}{padded_number}`
- Uses settings from `company_settings`:
  - `receipt_prefix` (default: 'RV-')
  - `receipt_number_width` (default: 5)
  - `receipt_number_prefix_zero` (default: true)

### Error Handling
- All functions have exception handlers
- Errors are logged but don't block the transaction
- System continues even if errors occur

## Database Tables Affected

1. **invoices**: Status changes trigger ledger posting and receipt creation
2. **vouchers**: Status changes trigger ledger posting
3. **voucher_entries**: Auto-created for receipt vouchers
4. **ledger_transactions**: Automatic posting and cleanup
5. **customers**: Account ID mapping
6. **company_settings**: Configuration for cash/bank and numbering
7. **chart_of_accounts**: Balance updates

## Configuration Requirements

To use this system, ensure these are configured in `company_settings`:

### Required for Receipt Vouchers:
- `default_payment_receipt_type`: 'cash' or 'bank'
- `default_cash_ledger_id`: UUID of cash account
- `default_bank_ledger_id`: UUID of bank account
- `receipt_prefix`: e.g., 'RV-'
- `receipt_number_width`: e.g., 5
- `receipt_starting_number`: e.g., 1

### Required for Invoice Posting:
- `default_income_ledger_id`: UUID of income/revenue account

### Required for Customer Mapping:
- Each customer should have `account_id` mapped to their ledger account
- System can use invoice's `customer_account_id` as fallback

## Example Workflow

### Scenario: Invoice Payment
1. Create invoice with status 'draft'
2. Change status to 'sent' → Invoice posted to ledger
3. Change status to 'paid' → Receipt voucher auto-created and posted
4. Change status to 'draft' → Everything deleted (invoice posting + receipt)

### Scenario: Voucher Posting
1. Create voucher with status 'draft'
2. Add voucher entries (debits and credits)
3. Change status to 'posted' → All entries posted to ledger
4. Change status to 'draft' → All ledger entries deleted

## Technical Implementation

### Triggers:
- `trigger_handle_invoice_status_change` on `invoices` table
- `trigger_handle_voucher_status_change` on `vouchers` table

### Functions:
- `handle_invoice_status_change()`: Manages invoice status transitions
- `handle_voucher_status_change()`: Manages voucher status transitions

### Migration File:
- `20251019150000_comprehensive_invoice_voucher_status_management.sql`

## Troubleshooting

### Receipt Not Created When Invoice Marked as Paid
Check:
1. Is `company_settings.default_payment_receipt_type` set?
2. Is cash/bank ledger configured?
3. Does customer have `account_id`?
4. Is there an active receipt voucher type?

### Ledger Entries Not Deleted When Status Changed to Draft
Check:
1. Are triggers enabled?
2. Check database logs for errors
3. Verify user_id matches

### Duplicate Ledger Entries
The system prevents duplicates automatically. If you see duplicates:
1. Check if there are multiple triggers
2. Verify migration was applied correctly
