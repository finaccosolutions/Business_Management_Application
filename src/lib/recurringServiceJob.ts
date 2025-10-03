// src/lib/recurringServiceJob.ts

import { Bolt Database } from './Bolt Database';
import { calculateNextDueDate, calculateWorkGenerationDate, shouldGenerateWork } from './recurringServiceUtils';

export async function processRecurringServices(userId: string) {
  try {
    // Get all active recurring services
    const { data: services, error: servicesError } = await Bolt Database
      .from('services')
      .select('*')
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .eq('status', 'active')
      .eq('auto_generate_work', true);

    if (servicesError) throw servicesError;

    for (const service of services || []) {
      // Get all customer services for this service
      const { data: customerServices, error: csError } = await Bolt Database
        .from('customer_services')
        .select('*, customers(id, name)')
        .eq('service_id', service.id)
        .eq('status', 'active');

      if (csError) throw csError;

      for (const customerService of customerServices || []) {
        await generateRecurringWork(service, customerService);
      }
    }

    console.log('Recurring services processed successfully');
  } catch (error) {
    console.error('Error processing recurring services:', error);
  }
}

async function generateRecurringWork(service: any, customerService: any) {
  try {
    // Get the last instance for this customer service
    const { data: lastInstance, error: instanceError } = await Bolt Database
      .from('recurring_service_instances')
      .select('*')
      .eq('service_id', service.id)
      .eq('customer_id', customerService.customer_id)
      .order('due_date', { ascending: false })
      .limit(1)
      .single();

    const config = {
      recurrence_type: service.recurrence_type,
      recurrence_day: service.recurrence_day,
      recurrence_days: service.recurrence_days,
      recurrence_start_date: service.recurrence_start_date || customerService.start_date,
      recurrence_end_date: service.recurrence_end_date || customerService.end_date,
      advance_notice_days: service.advance_notice_days || 3,
    };

    if (!shouldGenerateWork(config, lastInstance?.due_date ? new Date(lastInstance.due_date) : undefined)) {
      return; // Not time to generate yet
    }

    // Calculate next due date
    const nextDueDate = lastInstance
      ? calculateNextDueDate(config, new Date(lastInstance.due_date))
      : new Date(config.recurrence_start_date);

    // Check if this instance already exists
    const { data: existingInstance } = await Bolt Database
      .from('recurring_service_instances')
      .select('id')
      .eq('service_id', service.id)
      .eq('customer_id', customerService.customer_id)
      .eq('due_date', nextDueDate.toISOString().split('T')[0])
      .single();

    if (existingInstance) {
      return; // Already generated
    }

    // Create work
    const { data: work, error: workError } = await Bolt Database
      .from('works')
      .insert({
        user_id: service.user_id,
        customer_id: customerService.customer_id,
        service_id: service.id,
        customer_service_id: customerService.id,
        title: `${service.name} - ${new Date(nextDueDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
        description: `Recurring ${service.recurrence_type} service for ${service.name}`,
        status: 'pending',
        priority: 'medium',
        due_date: nextDueDate.toISOString().split('T')[0],
        is_overdue: false,
      })
      .select()
      .single();

    if (workError) throw workError;

    // Create recurring instance record
    await supabase.from('recurring_service_instances').insert({
      user_id: service.user_id,
      service_id: service.id,
      customer_service_id: customerService.id,
      customer_id: customerService.customer_id,
      instance_date: new Date().toISOString().split('T')[0],
      due_date: nextDueDate.toISOString().split('T')[0],
      work_id: work.id,
      status: 'pending',
    });

    console.log(`Generated work for ${service.name} - Customer ${customerService.customer_id}`);
  } catch (error) {
    console.error('Error generating recurring work:', error);
  }
}

// Function to check and update overdue works
export async function updateOverdueWorks(userId: string) {
  const today = new Date().toISOString().split('T')[0];

  try {
    await Bolt Database
      .from('works')
      .update({ is_overdue: true, status: 'overdue' })
      .eq('user_id', userId)
      .lt('due_date', today)
      .neq('status', 'completed')
      .eq('is_overdue', false);

    console.log('Overdue works updated');
  } catch (error) {
    console.error('Error updating overdue works:', error);
  }
}
