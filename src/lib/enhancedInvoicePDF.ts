import html2pdf from 'html2pdf.js';
import { formatDateDisplay } from './dateUtils';

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_rate?: number;
  hsn_sac?: string;
}

interface Invoice {
  id?: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes?: string;
  customers: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    gstin?: string;
    city?: string;
    state?: string;
    state_code?: string;
    postal_code?: string;
  };
}

interface CompanySettings {
  company_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  state_code?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  tax_registration_number?: string;
  tax_label?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_branch?: string;
  company_logo_url?: string;
  invoice_split_gst?: boolean;
  invoice_show_payment_terms?: boolean;
  invoice_show_supplier_section?: boolean;
  invoice_show_buyer_section?: boolean;
  invoice_supplier_position?: string;
  invoice_buyer_position?: string;
  invoice_number_position?: string;
  invoice_logo_position?: string;
  invoice_show_bank_details?: boolean;
  invoice_show_notes?: boolean;
  invoice_show_company_details?: boolean;
  invoice_show_logo?: boolean;
  invoice_show_tax_number?: boolean;
  invoice_header_color?: string;
  invoice_accent_color?: string;
  invoice_text_color?: string;
  invoice_font_family?: string;
  invoice_font_size?: string;
  invoice_logo_size?: string;
  invoice_notes?: string;
  invoice_terms?: string;
  invoice_footer_text?: string;
  invoice_watermark_text?: string;
  invoice_include_item_numbers?: boolean;
  invoice_show_item_tax?: boolean;
  currency_symbol?: string;
}

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  if (num === 0) return 'Zero';

  let words = '';

  if (num >= 10000000) {
    words += numberToWords(Math.floor(num / 10000000)) + ' Crore ';
    num %= 10000000;
  }

  if (num >= 100000) {
    words += numberToWords(Math.floor(num / 100000)) + ' Lakh ';
    num %= 100000;
  }

  if (num >= 1000) {
    words += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
    num %= 1000;
  }

  if (num >= 100) {
    words += ones[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }

  if (num >= 20) {
    words += tens[Math.floor(num / 10)] + ' ';
    num %= 10;
  }

  if (num >= 10 && num < 20) {
    words += teens[num - 10] + ' ';
    num = 0;
  }

  if (num > 0) {
    words += ones[num] + ' ';
  }

  return words.trim();
}

export function generateEnhancedInvoiceHTML(
  invoice: Invoice,
  items: InvoiceItem[],
  companySettings: CompanySettings
): string {
  const isIndia = companySettings.country === 'India' || companySettings.country === 'IN';
  const splitGST = companySettings.invoice_split_gst !== false && isIndia;
  const showPaymentTerms = companySettings.invoice_show_payment_terms === true;
  const showBankDetails = companySettings.invoice_show_bank_details !== false;
  const showNotes = companySettings.invoice_show_notes !== false;
  const showBuyerSection = companySettings.invoice_show_buyer_section !== false;
  const showSupplierSection = companySettings.invoice_show_supplier_section !== false;
  const showLogo = companySettings.invoice_show_logo !== false;
  const showCompanyDetails = companySettings.invoice_show_company_details !== false;
  const showTaxNumber = companySettings.invoice_show_tax_number !== false;
  const showItemNumbers = companySettings.invoice_include_item_numbers !== false;
  const showItemTax = companySettings.invoice_show_item_tax !== false;
  const numberPosition = companySettings.invoice_number_position || 'right';
  const logoPosition = companySettings.invoice_logo_position || 'left';
  const logoSize = companySettings.invoice_logo_size || 'medium';
  const headerColor = companySettings.invoice_header_color || '#1e40af';
  const accentColor = companySettings.invoice_accent_color || '#0ea5e9';
  const textColor = companySettings.invoice_text_color || '#000';
  const fontFamily = companySettings.invoice_font_family || 'Inter';
  const fontSize = companySettings.invoice_font_size === 'small' ? '9pt' :
                   companySettings.invoice_font_size === 'large' ? '11pt' : '10pt';
  const logoSizePx = logoSize === 'small' ? '80px' : logoSize === 'large' ? '160px' : '120px';

  const supplierState = companySettings.state || '';
  const customerState = invoice.customers.state || '';
  const isSameState = supplierState.toLowerCase() === customerState.toLowerCase();

  const taxRate = invoice.subtotal > 0 ? (invoice.tax_amount / invoice.subtotal) * 100 : 0;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (splitGST) {
    if (isSameState) {
      cgst = invoice.tax_amount / 2;
      sgst = invoice.tax_amount / 2;
    } else {
      igst = invoice.tax_amount;
    }
  }

  const statusColors = {
    draft: '#6b7280',
    sent: '#3b82f6',
    paid: '#10b981',
    overdue: '#ef4444',
    cancelled: '#ef4444',
  };

  const statusColor = statusColors[invoice.status as keyof typeof statusColors] || '#6b7280';
  const currencySymbol = companySettings.currency_symbol || '₹';

  const totalInWords = numberToWords(Math.floor(invoice.total_amount)) + ' Rupees Only';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${invoice.invoice_number}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: '${fontFamily}', Arial, sans-serif;
          font-size: ${fontSize};
          line-height: 1.4;
          color: ${textColor};
          background: white;
          padding: 10px;
        }

        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border: 2px solid #000;
        }

        .invoice-header {
          text-align: center;
          padding: 15px;
          border-bottom: 2px solid #000;
        }

        .invoice-title {
          font-size: 20pt;
          font-weight: 700;
          margin-bottom: 5px;
        }

        .party-section {
          display: table;
          width: 100%;
          border-bottom: 2px solid #000;
        }

        .party-box {
          display: table-cell;
          width: 50%;
          padding: 12px;
          vertical-align: top;
          border-right: 1px solid #000;
        }

        .party-box:last-child {
          border-right: none;
        }

        .party-label {
          font-size: 9pt;
          font-weight: 700;
          margin-bottom: 5px;
          text-transform: uppercase;
        }

        .party-name {
          font-weight: 700;
          font-size: 11pt;
          margin-bottom: 3px;
        }

        .party-details {
          font-size: 9pt;
          line-height: 1.5;
        }

        .invoice-meta {
          display: table;
          width: 100%;
          border-bottom: 2px solid #000;
        }

        .meta-cell {
          display: table-cell;
          padding: 8px 12px;
          border-right: 1px solid #000;
          font-size: 9pt;
        }

        .meta-cell:last-child {
          border-right: none;
        }

        .meta-label {
          font-weight: 600;
          margin-bottom: 2px;
        }

        .meta-value {
          font-weight: 700;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
        }

        .items-table th {
          background: #f3f4f6;
          border: 1px solid #000;
          padding: 8px 6px;
          text-align: center;
          font-weight: 700;
          font-size: 9pt;
          text-transform: uppercase;
        }

        .items-table td {
          border: 1px solid #000;
          padding: 8px 6px;
          font-size: 9pt;
          vertical-align: top;
        }

        .items-table td.center {
          text-align: center;
        }

        .items-table td.right {
          text-align: right;
        }

        .totals-section {
          display: table;
          width: 100%;
        }

        .totals-left {
          display: table-cell;
          width: 50%;
          padding: 12px;
          border-right: 1px solid #000;
          border-bottom: 2px solid #000;
          vertical-align: top;
        }

        .totals-right {
          display: table-cell;
          width: 50%;
          border-bottom: 2px solid #000;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 12px;
          border-bottom: 1px solid #000;
          font-size: 9pt;
        }

        .total-row:last-child {
          border-bottom: none;
        }

        .total-row.highlight {
          background: #f3f4f6;
          font-weight: 700;
          font-size: 10pt;
        }

        .amount-in-words {
          padding: 12px;
          border-bottom: 2px solid #000;
          font-size: 9pt;
        }

        .amount-words-label {
          font-weight: 600;
          margin-bottom: 3px;
        }

        .amount-words-value {
          font-weight: 700;
        }

        .bank-details {
          padding: 12px;
          border-bottom: 2px solid #000;
          font-size: 9pt;
        }

        .bank-details-title {
          font-weight: 700;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .bank-details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .bank-detail-item {
          display: flex;
          gap: 5px;
        }

        .bank-detail-label {
          font-weight: 600;
        }

        .footer-section {
          display: table;
          width: 100%;
        }

        .footer-left {
          display: table-cell;
          width: 60%;
          padding: 12px;
          border-right: 1px solid #000;
          vertical-align: top;
        }

        .footer-right {
          display: table-cell;
          width: 40%;
          padding: 12px;
          text-align: right;
          vertical-align: bottom;
        }

        .signature-line {
          margin-top: 40px;
          padding-top: 8px;
          border-top: 1px solid #000;
          font-weight: 600;
        }

        @media print {
          body { padding: 0; }
          .invoice-container { border: 2px solid #000; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header" style="background-color: ${headerColor}; color: white; display: flex; align-items: center; justify-content: ${logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'flex-end' : 'flex-start'}; gap: 15px;">
          ${showLogo && companySettings.company_logo_url ? `
            <img src="${companySettings.company_logo_url}" alt="Company Logo" style="max-width: ${logoSizePx}; max-height: ${logoSizePx}; object-fit: contain; background: white; padding: 8px; border-radius: 8px;" />
          ` : ''}
          ${showCompanyDetails ? `
            <div style="text-align: ${logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'right' : 'left'};">
              <div style="font-size: 18pt; font-weight: 700; margin-bottom: 5px;">${companySettings.company_name || ''}</div>
              ${companySettings.mobile ? `<div style="font-size: 9pt;">Mobile: ${companySettings.mobile}</div>` : ''}
              ${companySettings.email ? `<div style="font-size: 9pt;">Email: ${companySettings.email}</div>` : ''}
              ${companySettings.phone ? `<div style="font-size: 9pt;">Phone: ${companySettings.phone}</div>` : ''}
            </div>
          ` : `
            <div class="invoice-title">Invoice</div>
          `}
        </div>

        ${showBuyerSection || showSupplierSection ? `
        <div class="party-section">
          ${showSupplierSection ? `
          <div class="party-box">
            <div class="party-label">Supplier (From):</div>
            <div class="party-name">${companySettings.company_name || ''}</div>
            <div class="party-details">
              ${companySettings.address_line1 ? `${companySettings.address_line1}<br>` : ''}
              ${companySettings.address_line2 ? `${companySettings.address_line2}<br>` : ''}
              ${companySettings.city ? `${companySettings.city}${companySettings.state ? ', ' + companySettings.state : ''}${companySettings.postal_code ? ' - ' + companySettings.postal_code : ''}<br>` : ''}
              ${companySettings.state ? `State Name: ${companySettings.state}, Code: ${companySettings.state_code || ''}<br>` : ''}
              ${companySettings.mobile ? `Mobile: ${companySettings.mobile}<br>` : ''}
              ${companySettings.phone ? `Phone: ${companySettings.phone}<br>` : ''}
              ${companySettings.email ? `Email: ${companySettings.email}<br>` : ''}
              ${showTaxNumber && companySettings.tax_registration_number ? `<strong>${companySettings.tax_label || 'GSTIN'}:</strong> ${companySettings.tax_registration_number}` : ''}
            </div>
          </div>
          ` : ''}
          ${showBuyerSection ? `
          <div class="party-box">
            <div class="party-label">Party (Buyer):</div>
            <div class="party-name">${invoice.customers.name}</div>
            <div class="party-details">
              ${invoice.customers.address ? `${invoice.customers.address}<br>` : ''}
              ${invoice.customers.city ? `${invoice.customers.city}${invoice.customers.state ? ', ' + invoice.customers.state : ''}${invoice.customers.postal_code ? ' - ' + invoice.customers.postal_code : ''}<br>` : ''}
              ${invoice.customers.state ? `State Name: ${invoice.customers.state}, Code: ${invoice.customers.state_code || ''}<br>` : ''}
              ${invoice.customers.phone ? `Phone: ${invoice.customers.phone}<br>` : ''}
              ${invoice.customers.gstin ? `<strong>GSTIN:</strong> ${invoice.customers.gstin}` : ''}
            </div>
          </div>
          ` : ''}
          ${!showSupplierSection && showBuyerSection ? `
          <div class="party-box">
            <div class="meta-label">Date</div>
            <div class="meta-value">${formatDateDisplay(invoice.invoice_date)}</div>
            <div class="meta-label" style="margin-top: 8px;">Invoice No.</div>
            <div class="meta-value">${invoice.invoice_number}</div>
          </div>
          ` : ''}
        </div>
        ` : `
        <div class="party-section">
          <div class="party-box" style="width: 100%; border-right: none;">
            <div style="display: flex; justify-content: space-between;">
              <div>
                <div class="meta-label">Date</div>
                <div class="meta-value">${formatDateDisplay(invoice.invoice_date)}</div>
              </div>
              <div style="text-align: right;">
                <div class="meta-label">Invoice No.</div>
                <div class="meta-value">${invoice.invoice_number}</div>
              </div>
            </div>
          </div>
        </div>
        `}

        ${showSupplierSection && showBuyerSection ? `
        <div class="invoice-meta">
          <div class="meta-cell" style="width: 33.33%;">
            <div class="meta-label">Date</div>
            <div class="meta-value">${formatDateDisplay(invoice.invoice_date)}</div>
          </div>
          <div class="meta-cell" style="width: 33.33%;">
            <div class="meta-label">Invoice No.</div>
            <div class="meta-value">${invoice.invoice_number}</div>
          </div>
          <div class="meta-cell" style="width: 33.33%;">
            <div class="meta-label">Due Date</div>
            <div class="meta-value">${formatDateDisplay(invoice.due_date)}</div>
          </div>
        </div>
        ` : ''}

        <table class="items-table">
          <thead>
            <tr>
              ${showItemNumbers ? '<th style="width: 8%;">Sl.<br>No.</th>' : ''}
              <th style="width: ${showItemNumbers ? '37%' : '45%'};">Particulars</th>
              <th style="width: 12%;">HSN/SAC</th>
              <th style="width: 8%;">Qty</th>
              <th style="width: 10%;">Rate</th>
              <th style="width: 12%;">Taxable<br>Value</th>
              ${showItemTax ? (splitGST ? `
                <th style="width: 7%;">GST<br>Amount</th>
              ` : `
                <th style="width: 7%;">Tax<br>Amount</th>
              `) : ''}
              <th style="width: 13%;">Total Amount<br>(in ${currencySymbol})</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, index) => {
              const itemTaxRate = item.tax_rate || taxRate;
              const itemTax = (item.amount * itemTaxRate / 100);
              const itemTotal = item.amount + itemTax;
              return `
                <tr>
                  ${showItemNumbers ? `<td class="center">${index + 1}</td>` : ''}
                  <td>${item.description}</td>
                  <td class="center">${item.hsn_sac || '-'}</td>
                  <td class="center">${item.quantity}</td>
                  <td class="right">${item.unit_price.toFixed(2)}</td>
                  <td class="right">${item.amount.toFixed(2)}</td>
                  ${showItemTax ? `<td class="right">${itemTax > 0 ? itemTax.toFixed(2) : '-'}</td>` : ''}
                  <td class="right">${itemTotal.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
            <tr>
              <td colspan="${showItemNumbers ? '5' : '4'}" class="right" style="font-weight: 700;">Total</td>
              <td class="right" style="font-weight: 700;">${invoice.subtotal.toFixed(2)}</td>
              ${showItemTax ? `<td class="right" style="font-weight: 700;">${invoice.tax_amount > 0 ? invoice.tax_amount.toFixed(2) : '-'}</td>` : ''}
              <td class="right" style="font-weight: 700;">${invoice.total_amount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="totals-section">
          <div class="totals-left">
            <div class="amount-words-label">Taxable Amount</div>
            <div class="amount-words-value">${invoice.subtotal.toFixed(2)}</div>
          </div>
          <div class="totals-right">
            ${splitGST ? (
              isSameState ? `
                <div class="total-row">
                  <span>Add: CGST @ ${(taxRate / 2).toFixed(2)}%</span>
                  <span>${cgst.toFixed(2)}</span>
                </div>
                <div class="total-row">
                  <span>Add: SGST @ ${(taxRate / 2).toFixed(2)}%</span>
                  <span>${sgst.toFixed(2)}</span>
                </div>
              ` : `
                <div class="total-row">
                  <span>Add: IGST @ ${taxRate.toFixed(2)}%</span>
                  <span>${igst.toFixed(2)}</span>
                </div>
              `
            ) : `
              <div class="total-row">
                <span>Add: ${companySettings.tax_label || 'Tax'} @ ${taxRate.toFixed(2)}%</span>
                <span>${invoice.tax_amount.toFixed(2)}</span>
              </div>
            `}
            <div class="total-row highlight">
              <span>Invoice Value</span>
              <span>${currencySymbol}${invoice.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div class="amount-in-words">
          <div class="amount-words-label">Amount in Words</div>
          <div class="amount-words-value">${totalInWords}</div>
        </div>

        ${showNotes && (invoice.notes || companySettings.invoice_notes) ? `
          <div class="amount-in-words" style="border-bottom: 1px solid #000;">
            <div class="amount-words-label">Notes:</div>
            <div style="font-size: 9pt; line-height: 1.5;">${invoice.notes || companySettings.invoice_notes || ''}</div>
          </div>
        ` : ''}

        ${showPaymentTerms && companySettings.invoice_terms ? `
          <div class="amount-in-words" style="border-bottom: 1px solid #000;">
            <div class="amount-words-label">Terms & Conditions:</div>
            <div style="font-size: 9pt; line-height: 1.5;">${companySettings.invoice_terms}</div>
          </div>
        ` : ''}

        ${showBankDetails && companySettings.bank_name ? `
          <div class="bank-details">
            <div class="bank-details-title">Bank Details${companySettings.company_name ? ` For ${companySettings.company_name}` : ''}</div>
            <div class="bank-details-grid">
              ${companySettings.bank_name ? `
                <div class="bank-detail-item">
                  <span class="bank-detail-label">Bank Name:</span>
                  <span>${companySettings.bank_name}</span>
                </div>
              ` : ''}
              ${companySettings.bank_account_number ? `
                <div class="bank-detail-item">
                  <span class="bank-detail-label">Bank Account Number:</span>
                  <span>${companySettings.bank_account_number}</span>
                </div>
              ` : ''}
              ${companySettings.bank_ifsc_code ? `
                <div class="bank-detail-item">
                  <span class="bank-detail-label">Bank IFSC Code:</span>
                  <span>${companySettings.bank_ifsc_code}</span>
                </div>
              ` : ''}
              ${companySettings.company_name ? `
                <div class="bank-detail-item">
                  <span class="bank-detail-label">Account Holder's Name:</span>
                  <span>${companySettings.company_name}</span>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <div class="footer-section">
          <div class="footer-left">
            ${companySettings.company_name ? `
              <div style="font-weight: 600; margin-bottom: 5px;">For ${companySettings.company_name}</div>
            ` : ''}
            ${companySettings.mobile ? `
              <div style="font-size: 8pt;">${companySettings.mobile}</div>
            ` : ''}
            ${companySettings.email ? `
              <div style="font-size: 8pt;">${companySettings.email}</div>
            ` : ''}
            ${companySettings.website ? `
              <div style="font-size: 8pt;">${companySettings.website}</div>
            ` : ''}
          </div>
          <div class="footer-right">
            <div class="signature-line">Authorised Signatory</div>
          </div>
        </div>

        ${companySettings.invoice_footer_text ? `
          <div style="text-align: center; padding: 8px; border-top: 1px solid #000; font-size: 8pt; color: #666;">
            ${companySettings.invoice_footer_text}
          </div>
        ` : ''}

        ${companySettings.invoice_watermark_text ? `
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 72pt; font-weight: 700; color: ${accentColor}; opacity: 0.1; pointer-events: none; white-space: nowrap;">
            ${companySettings.invoice_watermark_text}
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

export function previewEnhancedInvoice(html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export function printEnhancedInvoice(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  }
}

export async function downloadEnhancedPDF(html: string, filename: string): Promise<void> {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '210mm';
  wrapper.style.zIndex = '-1';
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  await new Promise(resolve => setTimeout(resolve, 300));

  const element = wrapper.querySelector('.invoice-container') as HTMLElement;
  if (!element) {
    document.body.removeChild(wrapper);
    throw new Error('Invoice container not found');
  }

  const options = {
    margin: [5, 5, 5, 5],
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      scrollY: 0,
      scrollX: 0,
      windowWidth: 800,
      windowHeight: element.scrollHeight
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  };

  try {
    await html2pdf().set(options).from(element).save();
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  } finally {
    document.body.removeChild(wrapper);
  }
}
