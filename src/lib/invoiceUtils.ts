// src/lib/invoiceUtils.ts

import { Bolt Database } from './Bolt Database';

export async function createInvoiceForCompletedWork(workId: string, userId: string) {
  try {
    // Get work details with service and customer info
    const { data: work, error: workError } = await Bolt Database
      .from('works')
      .select(`
        *,
        customers (id, name),
        services (id, name, default_price, is_recurring, recurrence_type),
        customer_services (id, price)
      `)
      .eq('id', workId)
      .single();

    if (workError) throw workError;
    if (work.billing_status === 'billed') {
      console.log('Work already billed');
      return;
    }

    // Determine price
    const price = work.customer_services?.price || work.services.default_price || 0;

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(userId);

    // Calculate dates
    const invoiceDate = new Date().toISOString().split('T')[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // Create invoice
    const { data: invoice, error: invoiceError } = await Bolt Database
      .from('invoices')
      .insert({
        user_id: userId,
        customer_id: work.customer_id,
        work_id: workId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDateStr,
        subtotal: price,
        tax_amount: 0,
        total_amount: price,
        status: 'draft',
        notes: work.services.is_recurring 
          ? `${work.services.recurrence_type} recurring service - ${work.services.name}`
          : null,
      })
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Update work billing status
    await Bolt Database
      .from('works')
      .update({ billing_status: 'billed' })
      .eq('id', workId);

    // Update recurring service instance
    await Bolt Database
      .from('recurring_service_instances')
      .update({ invoice_id: invoice.id, status: 'billed' })
      .eq('work_id', workId);

    console.log(`Invoice ${invoiceNumber} created for work ${workId}`);
    return invoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

async function generateInvoiceNumber(userId: string): Promise<string> {
  const { data, error } = await Bolt Database
    .from('invoices')
    .select('invoice_number')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is "no rows returned"
    throw error;
  }

  if (data) {
    // Extract number and increment
    const match = data.invoice_number.match(/INV-(\d+)/);
    if (match) {
      const nextNumber = parseInt(match[1]) + 1;
      return `INV-${nextNumber.toString().padStart(6, '0')}`;
    }
  }

  // First invoice
  return 'INV-000001';
}
