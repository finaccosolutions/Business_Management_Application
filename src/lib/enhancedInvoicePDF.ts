import html2pdf from 'html2pdf.js';

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_rate?: number;
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
  };
}

interface CompanySettings {
  company_name?: string;
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
  bank_branch?: string;
  company_logo_url?: string;
}

export function generateEnhancedInvoiceHTML(
  invoice: Invoice,
  items: InvoiceItem[],
  companySettings: CompanySettings
): string {
  const isIndia = companySettings.country === 'India';
  const cgst = isIndia ? invoice.tax_amount / 2 : 0;
  const sgst = isIndia ? invoice.tax_amount / 2 : 0;

  const statusColors = {
    draft: '#6b7280',
    sent: '#3b82f6',
    paid: '#10b981',
    overdue: '#ef4444',
    cancelled: '#ef4444',
  };

  const statusColor = statusColors[invoice.status as keyof typeof statusColors] || '#6b7280';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${invoice.invoice_number}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 10pt;
          line-height: 1.6;
          color: #1f2937;
          background: white;
          padding: 20px;
        }

        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .invoice-header {
          background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
          color: white;
          padding: 30px 40px;
          position: relative;
        }

        .invoice-header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .company-info h1 {
          font-size: 26pt;
          font-weight: 800;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .company-details {
          font-size: 9pt;
          line-height: 1.5;
          opacity: 0.95;
        }

        .invoice-title-box {
          text-align: right;
        }

        .invoice-title {
          font-size: 32pt;
          font-weight: 800;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .invoice-number {
          font-size: 13pt;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.2);
          padding: 6px 16px;
          border-radius: 20px;
          display: inline-block;
        }

        .status-badge {
          position: absolute;
          top: 30px;
          right: 40px;
          background: ${statusColor};
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 10pt;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }

        .invoice-body {
          padding: 40px;
        }

        .info-section {
          display: flex;
          justify-between;
          margin-bottom: 35px;
          gap: 40px;
        }

        .info-block {
          flex: 1;
        }

        .info-block h3 {
          font-size: 10pt;
          font-weight: 700;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          border-bottom: 2px solid #0ea5e9;
          padding-bottom: 6px;
        }

        .info-block p {
          font-size: 10pt;
          line-height: 1.7;
          color: #374151;
        }

        .info-block strong {
          color: #111827;
          font-weight: 600;
        }

        .dates-section {
          display: flex;
          gap: 30px;
          background: #f9fafb;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 35px;
          border-left: 4px solid #0ea5e9;
        }

        .date-item {
          flex: 1;
        }

        .date-label {
          font-size: 9pt;
          color: #6b7280;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .date-value {
          font-size: 11pt;
          color: #111827;
          font-weight: 700;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          overflow: hidden;
        }

        .items-table thead {
          background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
          color: white;
        }

        .items-table th {
          padding: 14px 12px;
          text-align: left;
          font-weight: 700;
          font-size: 9pt;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .items-table th:last-child,
        .items-table td:last-child {
          text-align: right;
        }

        .items-table tbody tr {
          border-bottom: 1px solid #e5e7eb;
        }

        .items-table tbody tr:last-child {
          border-bottom: none;
        }

        .items-table tbody tr:hover {
          background: #f9fafb;
        }

        .items-table td {
          padding: 14px 12px;
          font-size: 10pt;
          color: #374151;
        }

        .items-table td.description {
          font-weight: 500;
          color: #111827;
        }

        .items-table td.amount {
          font-weight: 700;
          color: #0ea5e9;
        }

        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 35px;
        }

        .totals-table {
          width: 350px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .totals-row:last-child {
          border-bottom: none;
        }

        .totals-row.subtotal {
          background: #f9fafb;
        }

        .totals-row.tax {
          background: #fef3c7;
        }

        .totals-row.total {
          background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
          color: white;
          font-weight: 800;
          font-size: 14pt;
        }

        .totals-label {
          font-weight: 600;
          font-size: 10pt;
        }

        .totals-value {
          font-weight: 700;
          font-size: 11pt;
        }

        .totals-row.total .totals-label,
        .totals-row.total .totals-value {
          font-size: 14pt;
        }

        .notes-section {
          background: #fffbeb;
          border-left: 4px solid #f59e0b;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }

        .notes-section h3 {
          font-size: 10pt;
          font-weight: 700;
          color: #92400e;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .notes-section p {
          font-size: 9pt;
          color: #78350f;
          line-height: 1.6;
          white-space: pre-line;
        }

        .bank-details {
          background: #f0f9ff;
          border: 2px solid #0ea5e9;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 30px;
        }

        .bank-details h3 {
          font-size: 11pt;
          font-weight: 700;
          color: #0c4a6e;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .bank-details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .bank-detail-item {
          font-size: 9pt;
        }

        .bank-detail-label {
          color: #475569;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .bank-detail-value {
          color: #0f172a;
          font-weight: 700;
        }

        .invoice-footer {
          border-top: 2px solid #e5e7eb;
          padding: 25px 40px;
          background: #f9fafb;
          text-align: center;
          font-size: 9pt;
          color: #6b7280;
        }

        .invoice-footer strong {
          color: #111827;
          font-weight: 700;
        }

        .tax-breakdown {
          background: #fef3c7;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 8pt;
          color: #78350f;
          font-weight: 600;
        }

        @media print {
          body {
            padding: 0;
          }
          .invoice-container {
            border: none;
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <div class="invoice-header-content">
            <div class="company-info">
              <h1>${companySettings.company_name || 'Your Company'}</h1>
              <div class="company-details">
                ${companySettings.address_line1 ? `${companySettings.address_line1}<br>` : ''}
                ${companySettings.address_line2 ? `${companySettings.address_line2}<br>` : ''}
                ${companySettings.city || ''} ${companySettings.state || ''} ${companySettings.postal_code || ''}<br>
                ${companySettings.phone ? `Phone: ${companySettings.phone}<br>` : ''}
                ${companySettings.email ? `Email: ${companySettings.email}<br>` : ''}
                ${companySettings.tax_registration_number ? `${companySettings.tax_label || 'GSTIN'}: ${companySettings.tax_registration_number}` : ''}
              </div>
            </div>
            <div class="invoice-title-box">
              <div class="invoice-title">INVOICE</div>
            </div>
          </div>
          <div class="status-badge">${invoice.status.toUpperCase()}</div>
        </div>

        <div class="invoice-body">
          <div class="dates-section">
            <div class="date-item">
              <div class="date-label">Invoice Number</div>
              <div class="date-value">${invoice.invoice_number}</div>
            </div>
            <div class="date-item">
              <div class="date-label">Invoice Date</div>
              <div class="date-value">${new Date(invoice.invoice_date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}</div>
            </div>
            <div class="date-item">
              <div class="date-label">Due Date</div>
              <div class="date-value">${new Date(invoice.due_date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}</div>
            </div>
          </div>

          <div class="info-section">
            <div class="info-block">
              <h3>Bill To</h3>
              <p>
                <strong style="font-size: 12pt;">${invoice.customers.name}</strong><br>
                ${invoice.customers.address ? `${invoice.customers.address}<br>` : ''}
                ${invoice.customers.phone ? `Phone: ${invoice.customers.phone}<br>` : ''}
                ${invoice.customers.email ? `Email: ${invoice.customers.email}<br>` : ''}
                ${invoice.customers.gstin ? `<strong>GSTIN:</strong> ${invoice.customers.gstin}` : ''}
              </p>
            </div>
            <div class="info-block">
              <h3>From</h3>
              <p>
                <strong style="font-size: 12pt;">${companySettings.company_name || 'Your Company'}</strong><br>
                ${companySettings.address_line1 || ''}<br>
                ${companySettings.city || ''}, ${companySettings.state || ''} ${companySettings.postal_code || ''}<br>
                ${companySettings.phone ? `Phone: ${companySettings.phone}<br>` : ''}
                ${companySettings.email ? `Email: ${companySettings.email}` : ''}
              </p>
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 10%;">#</th>
                <th style="width: 45%;">Description</th>
                <th style="width: 10%; text-align: center;">Qty</th>
                <th style="width: 15%; text-align: right;">Rate</th>
                <th style="width: 20%; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, index) => `
                <tr>
                  <td style="text-align: center; font-weight: 600;">${index + 1}</td>
                  <td class="description">${item.description}</td>
                  <td style="text-align: center; font-weight: 600;">${item.quantity}</td>
                  <td style="text-align: right;">₹${item.unit_price.toFixed(2)}</td>
                  <td class="amount">₹${item.amount.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals-section">
            <div class="totals-table">
              <div class="totals-row subtotal">
                <div class="totals-label">Subtotal</div>
                <div class="totals-value">₹${invoice.subtotal.toFixed(2)}</div>
              </div>
              ${isIndia ? `
                <div class="totals-row tax">
                  <div class="totals-label">
                    CGST @ ${((cgst / invoice.subtotal) * 100).toFixed(2)}%
                    <span class="tax-breakdown">₹${cgst.toFixed(2)}</span>
                  </div>
                  <div class="totals-value">₹${cgst.toFixed(2)}</div>
                </div>
                <div class="totals-row tax">
                  <div class="totals-label">
                    SGST @ ${((sgst / invoice.subtotal) * 100).toFixed(2)}%
                    <span class="tax-breakdown">₹${sgst.toFixed(2)}</span>
                  </div>
                  <div class="totals-value">₹${sgst.toFixed(2)}</div>
                </div>
              ` : `
                <div class="totals-row tax">
                  <div class="totals-label">Tax</div>
                  <div class="totals-value">₹${invoice.tax_amount.toFixed(2)}</div>
                </div>
              `}
              <div class="totals-row total">
                <div class="totals-label">INVOICE AMOUNT</div>
                <div class="totals-value">₹${invoice.total_amount.toFixed(2)}</div>
              </div>
            </div>
          </div>

          ${invoice.notes ? `
            <div class="notes-section">
              <h3>Notes / Terms & Conditions</h3>
              <p>${invoice.notes}</p>
            </div>
          ` : ''}

          ${companySettings.bank_name ? `
            <div class="bank-details">
              <h3>Bank Details for Payment</h3>
              <div class="bank-details-grid">
                ${companySettings.bank_name ? `
                  <div class="bank-detail-item">
                    <div class="bank-detail-label">Bank Name</div>
                    <div class="bank-detail-value">${companySettings.bank_name}</div>
                  </div>
                ` : ''}
                ${companySettings.bank_account_number ? `
                  <div class="bank-detail-item">
                    <div class="bank-detail-label">Account Number</div>
                    <div class="bank-detail-value">${companySettings.bank_account_number}</div>
                  </div>
                ` : ''}
                ${companySettings.bank_ifsc_code ? `
                  <div class="bank-detail-item">
                    <div class="bank-detail-label">IFSC Code</div>
                    <div class="bank-detail-value">${companySettings.bank_ifsc_code}</div>
                  </div>
                ` : ''}
                ${companySettings.bank_branch ? `
                  <div class="bank-detail-item">
                    <div class="bank-detail-label">Branch</div>
                    <div class="bank-detail-value">${companySettings.bank_branch}</div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="invoice-footer">
          <p>
            <strong>Thank you for your business!</strong><br>
            This is a computer-generated invoice and requires no signature.
            ${companySettings.website ? `<br>Visit us at: ${companySettings.website}` : ''}
          </p>
        </div>
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
