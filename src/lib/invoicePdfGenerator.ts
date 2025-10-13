import { formatDateDisplay } from './dateUtils';

interface CompanySettings {
  company_name: string;
  company_logo_url?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  tax_registration_number?: string;
  tax_label?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_swift_code?: string;
  bank_branch?: string;
  currency_symbol?: string;
}

interface Customer {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Invoice {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes?: string;
  customers: Customer;
}

export function generateInvoiceHTML(
  invoice: Invoice,
  items: InvoiceItem[],
  settings: CompanySettings
): string {
  const currencySymbol = settings.currency_symbol || '₹';
  const taxLabel = settings.tax_label || 'Tax';

  const companyAddress = [
    settings.address_line1,
    settings.address_line2,
    [settings.city, settings.state, settings.postal_code].filter(Boolean).join(', '),
    settings.country
  ].filter(Boolean).join('<br/>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', 'Arial', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #2d3748;
      background: #ffffff;
      padding: 20px;
    }

    .invoice-container {
      max-width: 210mm;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border: 2px solid #e2e8f0;
    }

    .invoice-header {
      display: table;
      width: 100%;
      margin-bottom: 35px;
      padding-bottom: 25px;
      border-bottom: 3px solid #0891b2;
    }

    .header-left {
      display: table-cell;
      width: 55%;
      vertical-align: top;
    }

    .header-right {
      display: table-cell;
      width: 45%;
      vertical-align: top;
      text-align: right;
    }

    .company-logo {
      max-width: 180px;
      max-height: 90px;
      margin-bottom: 12px;
      display: block;
    }

    .company-name {
      font-size: 22px;
      font-weight: bold;
      color: #0891b2;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .company-details {
      color: #64748b;
      font-size: 10px;
      line-height: 1.7;
    }

    .invoice-title-section {
      margin-bottom: 10px;
    }

    .invoice-title {
      font-size: 28px;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }

    .invoice-number {
      font-size: 14px;
      color: #475569;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .invoice-status {
      display: inline-block;
      padding: 5px 14px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-draft { background: #f1f5f9; color: #64748b; }
    .status-sent { background: #dbeafe; color: #1e40af; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-overdue { background: #fee2e2; color: #991b1b; }

    .parties-section {
      display: table;
      width: 100%;
      margin-bottom: 30px;
    }

    .party-column {
      display: table-cell;
      width: 48%;
      padding: 18px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }

    .party-title {
      font-size: 11px;
      font-weight: bold;
      color: #0891b2;
      text-transform: uppercase;
      margin-bottom: 10px;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #0891b2;
      padding-bottom: 5px;
    }

    .party-name {
      font-size: 13px;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 8px;
    }

    .party-details {
      color: #64748b;
      font-size: 10px;
      line-height: 1.8;
    }

    .detail-row {
      margin-bottom: 3px;
    }

    .detail-label {
      display: inline-block;
      width: 90px;
      font-weight: 600;
      color: #475569;
    }

    .items-section {
      margin: 30px 0;
    }

    .section-title {
      font-size: 13px;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #cbd5e1;
    }

    .items-table thead {
      background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
      color: white;
    }

    .items-table th {
      padding: 12px 10px;
      text-align: left;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-right: 1px solid rgba(255, 255, 255, 0.2);
    }

    .items-table th:last-child {
      border-right: none;
    }

    .items-table th.text-center { text-align: center; }
    .items-table th.text-right { text-align: right; }
    .items-table td.text-center { text-align: center; }
    .items-table td.text-right { text-align: right; }

    .items-table tbody tr {
      border-bottom: 1px solid #e2e8f0;
    }

    .items-table tbody tr:nth-child(odd) {
      background: #f8fafc;
    }

    .items-table tbody tr:hover {
      background: #f1f5f9;
    }

    .items-table td {
      padding: 10px;
      font-size: 10px;
      color: #475569;
      border-right: 1px solid #e2e8f0;
    }

    .items-table td:last-child {
      border-right: none;
    }

    .item-description {
      font-weight: 600;
      color: #0f172a;
    }

    .totals-section {
      display: table;
      width: 100%;
      margin: 25px 0;
    }

    .totals-left {
      display: table-cell;
      width: 55%;
      vertical-align: top;
    }

    .totals-right {
      display: table-cell;
      width: 45%;
      vertical-align: top;
    }

    .totals-box {
      border: 2px solid #e2e8f0;
      background: #f8fafc;
    }

    .total-row {
      display: table;
      width: 100%;
      padding: 10px 16px;
      border-bottom: 1px solid #e2e8f0;
    }

    .total-row:last-child {
      border-bottom: none;
    }

    .total-label {
      display: table-cell;
      color: #475569;
      font-weight: 600;
      font-size: 11px;
    }

    .total-value {
      display: table-cell;
      font-weight: 700;
      color: #0f172a;
      text-align: right;
      font-size: 11px;
    }

    .grand-total-row {
      background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
      color: white;
      padding: 14px 16px;
      font-size: 14px;
      font-weight: bold;
    }

    .grand-total-label {
      display: inline-block;
      width: 60%;
    }

    .grand-total-value {
      display: inline-block;
      width: 40%;
      text-align: right;
    }

    .bank-section {
      background: #f0fdfa;
      padding: 18px;
      border: 1px solid #99f6e4;
      border-left: 4px solid #14b8a6;
      margin: 25px 0;
    }

    .bank-title {
      font-size: 11px;
      font-weight: bold;
      color: #14b8a6;
      text-transform: uppercase;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }

    .bank-details-grid {
      display: table;
      width: 100%;
    }

    .bank-detail-row {
      display: table-row;
    }

    .bank-detail-cell {
      display: table-cell;
      padding: 4px 0;
      width: 50%;
    }

    .bank-detail-label {
      color: #0f766e;
      font-weight: 600;
      font-size: 10px;
      display: inline-block;
      width: 110px;
    }

    .bank-detail-value {
      color: #115e59;
      font-weight: 500;
      font-size: 10px;
    }

    .notes-section {
      margin: 25px 0;
      padding: 18px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-left: 4px solid #f59e0b;
    }

    .notes-title {
      font-size: 11px;
      font-weight: bold;
      color: #d97706;
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .notes-content {
      color: #92400e;
      font-size: 10px;
      line-height: 1.8;
      white-space: pre-wrap;
    }

    .invoice-footer {
      text-align: center;
      padding-top: 25px;
      margin-top: 30px;
      border-top: 2px solid #e2e8f0;
      color: #64748b;
      font-size: 9px;
    }

    .footer-highlight {
      color: #0891b2;
      font-weight: bold;
      font-size: 10px;
    }

    .signature-section {
      margin-top: 40px;
      display: table;
      width: 100%;
    }

    .signature-box {
      display: table-cell;
      width: 48%;
      text-align: center;
      padding: 15px;
      border-top: 2px solid #cbd5e1;
    }

    .signature-label {
      font-size: 10px;
      color: #475569;
      font-weight: 600;
      margin-top: 8px;
    }

    @media print {
      body { padding: 0; }
      .invoice-container {
        border: none;
        padding: 15mm;
      }
      @page {
        size: A4;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-header">
      <div class="header-left">
        ${settings.company_logo_url ? `<img src="${settings.company_logo_url}" alt="Logo" class="company-logo" />` : ''}
        <div class="company-name">${settings.company_name || 'Company Name'}</div>
        <div class="company-details">
          ${companyAddress ? `${companyAddress}<br/>` : ''}
          ${settings.phone ? `<strong>Phone:</strong> ${settings.phone}<br/>` : ''}
          ${settings.email ? `<strong>Email:</strong> ${settings.email}<br/>` : ''}
          ${settings.website ? `<strong>Website:</strong> ${settings.website}<br/>` : ''}
          ${settings.tax_registration_number ? `<strong>${taxLabel} No:</strong> ${settings.tax_registration_number}` : ''}
        </div>
      </div>
      <div class="header-right">
        <div class="invoice-title-section">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-number">${invoice.invoice_number}</div>
          <span class="invoice-status status-${invoice.status}">${invoice.status}</span>
        </div>
      </div>
    </div>

    <div class="parties-section">
      <div class="party-column" style="width: 48%; display: inline-block; vertical-align: top; margin-right: 4%;">
        <div class="party-title">Bill To</div>
        <div class="party-name">${invoice.customers.name}</div>
        <div class="party-details">
          ${invoice.customers.email ? `<div class="detail-row"><span class="detail-label">Email:</span> ${invoice.customers.email}</div>` : ''}
          ${invoice.customers.phone ? `<div class="detail-row"><span class="detail-label">Phone:</span> ${invoice.customers.phone}</div>` : ''}
          ${invoice.customers.address ? `<div class="detail-row"><span class="detail-label">Address:</span> ${invoice.customers.address}</div>` : ''}
        </div>
      </div>
      <div class="party-column" style="width: 48%; display: inline-block; vertical-align: top;">
        <div class="party-title">Invoice Details</div>
        <div class="party-details">
          <div class="detail-row">
            <span class="detail-label">Invoice Date:</span>
            <strong>${formatDateDisplay(invoice.invoice_date)}</strong>
          </div>
          <div class="detail-row">
            <span class="detail-label">Due Date:</span>
            <strong>${formatDateDisplay(invoice.due_date)}</strong>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <strong style="color: ${
              invoice.status === 'paid'
                ? '#065f46'
                : invoice.status === 'overdue'
                ? '#991b1b'
                : '#475569'
            };">${invoice.status.toUpperCase()}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="items-section">
      <div class="section-title">Particulars</div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 8%;">#</th>
            <th style="width: 47%;">Description</th>
            <th class="text-center" style="width: 15%;">Quantity</th>
            <th class="text-right" style="width: 15%;">Rate</th>
            <th class="text-right" style="width: 15%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item, index) => `
            <tr>
              <td class="text-center">${index + 1}</td>
              <td class="item-description">${item.description}</td>
              <td class="text-center">${item.quantity}</td>
              <td class="text-right">${currencySymbol}${item.unit_price.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</td>
              <td class="text-right">${currencySymbol}${item.amount.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="totals-section">
      <div class="totals-left"></div>
      <div class="totals-right">
        <div class="totals-box">
          <div class="total-row">
            <span class="total-label">Subtotal:</span>
            <span class="total-value">${currencySymbol}${invoice.subtotal.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</span>
          </div>
          <div class="total-row">
            <span class="total-label">${taxLabel}:</span>
            <span class="total-value">${currencySymbol}${invoice.tax_amount.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</span>
          </div>
        </div>
        <div class="grand-total-row">
          <span class="grand-total-label">Total Amount:</span>
          <span class="grand-total-value">${currencySymbol}${invoice.total_amount.toLocaleString(
            'en-IN',
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}</span>
        </div>
      </div>
    </div>

    ${
      settings.bank_name || settings.bank_account_number
        ? `
    <div class="bank-section">
      <div class="bank-title">Bank Details for Payment</div>
      <div class="bank-details-grid">
        ${
          settings.bank_name
            ? `<div class="bank-detail-row"><div class="bank-detail-cell"><span class="bank-detail-label">Bank Name:</span><span class="bank-detail-value">${settings.bank_name}</span></div></div>`
            : ''
        }
        ${
          settings.bank_account_number
            ? `<div class="bank-detail-row"><div class="bank-detail-cell"><span class="bank-detail-label">Account Number:</span><span class="bank-detail-value">${settings.bank_account_number}</span></div></div>`
            : ''
        }
        ${
          settings.bank_ifsc_code
            ? `<div class="bank-detail-row"><div class="bank-detail-cell"><span class="bank-detail-label">IFSC Code:</span><span class="bank-detail-value">${settings.bank_ifsc_code}</span></div></div>`
            : ''
        }
        ${
          settings.bank_swift_code
            ? `<div class="bank-detail-row"><div class="bank-detail-cell"><span class="bank-detail-label">SWIFT Code:</span><span class="bank-detail-value">${settings.bank_swift_code}</span></div></div>`
            : ''
        }
        ${
          settings.bank_branch
            ? `<div class="bank-detail-row"><div class="bank-detail-cell"><span class="bank-detail-label">Branch:</span><span class="bank-detail-value">${settings.bank_branch}</span></div></div>`
            : ''
        }
      </div>
    </div>
    `
        : ''
    }

    ${
      invoice.notes
        ? `
    <div class="notes-section">
      <div class="notes-title">Notes / Terms & Conditions</div>
      <div class="notes-content">${invoice.notes}</div>
    </div>
    `
        : ''
    }

    <div class="signature-section">
      <div class="signature-box">
        <div style="height: 50px;"></div>
        <div class="signature-label">Authorized Signature</div>
      </div>
      <div class="signature-box">
        <div style="height: 50px;"></div>
        <div class="signature-label">Customer Signature</div>
      </div>
    </div>

    <div class="invoice-footer">
      <p class="footer-highlight">Thank you for your business!</p>
      <p style="margin-top: 8px;">
        This is a computer-generated invoice. For queries, contact ${settings.email || settings.phone || 'us'}.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export function printInvoice(html: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print the invoice');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    setTimeout(() => {
      printWindow.close();
    }, 250);
  };
}

export async function downloadPDF(html: string, filename: string): Promise<void> {
  try {
    const html2pdf = (await import('html2pdf.js')).default;

    const element = document.createElement('div');
    element.innerHTML = html;

    const opt = {
      margin: 0,
      filename: filename.replace('.html', '.pdf'),
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(element).save();
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

export function previewInvoice(html: string): void {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    alert('Please allow popups to preview the invoice');
    return;
  }

  previewWindow.document.write(html);
  previewWindow.document.close();
}
