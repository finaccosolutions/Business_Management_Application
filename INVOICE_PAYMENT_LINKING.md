# Invoice-Receipt Linking System

## Overview
This system allows you to track payments against invoices, including partial payments, advance receipts, and pending receivables.

## Features Implemented

### 1. Link Receipts to Invoices
- **Partial Payments**: Link multiple receipts to a single invoice
- **Full Payments**: Mark invoices as fully paid when balance reaches zero
- **Payment Tracking**: View all receipts linked to each invoice

### 2. Advance Receipt Management
- **Record Advances**: Create receipt vouchers before invoices are generated
- **Allocate Later**: Link advance receipts to invoices when they're created
- **Track Unallocated**: View all unallocated advance receipts

### 3. Receivables Tracking
- **Outstanding Balance**: Track pending amounts per invoice
- **Payment Status**: See paid amount vs balance for each invoice
- **Aging Analysis**: Identify overdue invoices and days overdue

## How to Use

### Creating and Linking Receipts to Invoices

1. **Go to Invoices Page**
   - Navigate to the Invoices section from the sidebar

2. **Click "Payments" Button**
   - Each invoice has a green "Payments" button
   - Click it to open the payment linking modal

3. **Link a Receipt**
   - Select a receipt from the dropdown (shows only receipts with available balance)
   - Enter the amount to allocate (max is shown)
   - Add optional notes
   - Click "Allocate Payment"

4. **View Linked Payments**
   - All linked receipts are shown in the modal
   - Remove allocations if needed using the trash icon

### Recording Advance Receipts

1. **Go to Accounting > Vouchers**
   - Create a Receipt voucher as usual
   - Do NOT link it to an invoice initially

2. **The Receipt is Now Available**
   - The system tracks it as an unallocated advance receipt
   - It will appear in the dropdown when linking payments to invoices

3. **Link to Invoice Later**
   - When the invoice is generated, go to the invoice
   - Click "Payments" and select the advance receipt
   - Allocate the desired amount

### Viewing Receivables Report

1. **Go to Reports**
   - Navigate to Reports from the sidebar

2. **Select "Accounts Receivable"**
   - Under "Financial Reports" section
   - Click on "Accounts Receivable" report

3. **View Outstanding Invoices**
   - See all invoices with pending balance
   - Filter by customer or status (current/overdue)
   - Export to Excel for further analysis

4. **Key Metrics Shown**
   - Total Receivables
   - Current (not yet due)
   - Overdue amount
   - Collection percentage

## Database Changes

### New Table: `invoice_payments`
Links receipts to invoices, tracking partial payments and advances.

### New Columns
- **invoices**:
  - `paid_amount`: Total amount received
  - `balance_amount`: Remaining balance

- **vouchers**:
  - `allocated_amount`: Amount already allocated to invoices
  - `unallocated_amount`: Available for future allocation

### New Views
- **advance_receipts_view**: Shows all unallocated advance receipts
- **invoice_payment_summary_view**: Payment details per invoice

## Benefits

1. **Better Cash Flow Management**: Know exactly which invoices are pending and by how much

2. **Advance Tracking**: Record customer advances and allocate them properly later

3. **Payment Reconciliation**: Link each receipt to specific invoices for accurate tracking

4. **Aging Analysis**: Identify overdue invoices and take action

5. **Partial Payment Support**: Handle situations where customers pay in installments

## Important Notes

- Payment allocations update invoice balance automatically
- Receipts can be partially allocated across multiple invoices
- Once allocated, the amount is tracked separately from unallocated
- Receivables report shows real-time data based on payment allocations
- All payment data is user-specific and secured with Row Level Security
