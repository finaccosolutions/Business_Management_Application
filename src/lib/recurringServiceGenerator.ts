// src/lib/recurringServiceGenerator.ts
import { supabase } from './supabase';
import { calculateNextDueDate, RecurringServiceConfig } from './recurringServiceUtils';
import { formatMonthYear, formatDateDisplay } from './dateUtils';

interface RecurringService {
  id: string;
  user_id: string;
  name: string;
  is_recurring: boolean;
  recurrence_type: string;
  recurrence_day?: number;
  recurrence_days?: number[];
  recurrence_start_date: string;
  recurrence_end_date?: string;
  advance_notice_days: number;
  auto_generate_work: boolean;
  last_instance_generated_date?: string;
}

export async function generateRecurringWorks(userId: string) {
  try {
    // Fetch all active recurring services
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .eq('status', 'active')
      .eq('auto_generate_work', true);

    if (servicesError) throw servicesError;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const service of services || []) {
      await generateWorksForService(service, today);
    }

    return { success: true, message: 'Recurring works generated successfully' };
  } catch (error) {
    console.error('Error generating recurring works:', error);
    return { success: false, error };
  }
}

async function generateWorksForService(service: RecurringService, today: Date) {
  try {
    // Get all customer services for this service
    const { data: customerServices, error: csError } = await supabase
      .from('customer_services')
      .select('*, customers(id, name)')
      .eq('service_id', service.id)
      .eq('status', 'active');

    if (csError) throw csError;

    for (const cs of customerServices || []) {
      await generateInstancesForCustomerService(service, cs, today);
    }

    // Update last instance generated date
    await supabase
      .from('services')
      .update({ last_instance_generated_date: today.toISOString().split('T')[0] })
      .eq('id', service.id);

  } catch (error) {
    console.error(`Error generating works for service ${service.id}:`, error);
  }
}

async function generateInstancesForCustomerService(
  service: RecurringService,
  customerService: any,
  today: Date
) {
  const config: RecurringServiceConfig = {
    recurrence_type: service.recurrence_type as any,
    recurrence_day: service.recurrence_day,
    recurrence_days: service.recurrence_days,
    recurrence_start_date: service.recurrence_start_date,
    recurrence_end_date: service.recurrence_end_date,
    advance_notice_days: service.advance_notice_days
  };

  // Get the last generated instance for this customer service
  const { data: lastInstance } = await supabase
    .from('recurring_work_instances')
    .select('instance_date, due_date')
    .eq('service_id', service.id)
    .eq('customer_service_id', customerService.id)
    .order('due_date', { ascending: false })
    .limit(1)
    .single();

  let nextDueDate: Date;
  
  if (lastInstance) {
    // Calculate next due date from last instance
    nextDueDate = calculateNextDueDate(config, new Date(lastInstance.due_date));
  } else {
    // First instance - use start date
    const startDate = new Date(config.recurrence_start_date);
    if (config.recurrence_day && service.recurrence_type === 'monthly') {
      const currentMonth = new Date(today.getFullYear(), today.getMonth(), config.recurrence_day);
      nextDueDate = currentMonth >= startDate ? currentMonth : new Date(today.getFullYear(), today.getMonth() + 1, config.recurrence_day);
    } else {
      nextDueDate = startDate;
    }
  }

  // Check if end date has passed
  if (config.recurrence_end_date) {
    const endDate = new Date(config.recurrence_end_date);
    if (nextDueDate > endDate) {
      return; // Don't generate past end date
    }
  }

  // Calculate generation date (due date - advance notice days)
  const generationDate = new Date(nextDueDate);
  generationDate.setDate(generationDate.getDate() - config.advance_notice_days);

  // Only generate if generation date has arrived
  if (today < generationDate) {
    return;
  }

  // Check if instance already exists for this date
  const { data: existing } = await supabase
    .from('recurring_work_instances')
    .select('id')
    .eq('service_id', service.id)
    .eq('customer_service_id', customerService.id)
    .eq('due_date', nextDueDate.toISOString().split('T')[0])
    .single();

  if (existing) {
    return; // Already generated
  }

  // Create recurring work instance
  const instanceData = {
    user_id: service.user_id,
    service_id: service.id,
    customer_service_id: customerService.id,
    customer_id: customerService.customer_id,
    instance_date: today.toISOString().split('T')[0],
    due_date: nextDueDate.toISOString().split('T')[0],
    status: 'pending',
    billing_status: 'not_billed',
    billing_amount: customerService.price
  };

  const { data: instance, error: instanceError } = await supabase
    .from('recurring_work_instances')
    .insert(instanceData)
    .select()
    .single();

  if (instanceError) {
    console.error('Error creating recurring instance:', instanceError);
    return;
  }

  // Create the actual work item
  const workData = {
    user_id: service.user_id,
    customer_id: customerService.customer_id,
    service_id: service.id,
    title: `${service.name} - ${formatMonthYear(nextDueDate.toISOString().split('T')[0])}`,
    description: `Recurring work for ${customerService.customers.name}`,
    status: 'pending',
    priority: 'medium',
    due_date: nextDueDate.toISOString().split('T')[0],
    is_recurring_instance: true,
    parent_service_id: service.id,
    instance_date: today.toISOString().split('T')[0],
    billing_status: 'not_billed',
    billing_amount: customerService.price
  };

  const { data: work, error: workError } = await supabase
    .from('works')
    .insert(workData)
    .select()
    .single();

  if (workError) {
    console.error('Error creating work:', workError);
    return;
  }

  // Link work to instance
  await supabase
    .from('recurring_work_instances')
    .update({ work_id: work.id })
    .eq('id', instance.id);

  console.log(`Generated work ${work.id} for service ${service.name}, due ${formatDateDisplay(nextDueDate.toISOString().split('T')[0])}`);
}

// Function to check and update overdue works
export async function updateOverdueWorks(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Update works table
    await supabase
      .from('works')
      .update({ status: 'overdue' })
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress'])
      .lt('due_date', today)
      .neq('status', 'overdue');

    // Update recurring instances
    await supabase
      .from('recurring_work_instances')
      .update({ status: 'overdue' })
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress'])
      .lt('due_date', today)
      .neq('status', 'overdue');

    return { success: true };
  } catch (error) {
    console.error('Error updating overdue works:', error);
    return { success: false, error };
  }
}
