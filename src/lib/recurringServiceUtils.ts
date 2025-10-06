// src/lib/recurringServiceUtils.ts

export interface RecurringServiceConfig {
  recurrence_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';
  recurrence_day?: number; // Day of month for monthly/yearly
  recurrence_days?: number[]; // Days of week for weekly (0=Sunday, 6=Saturday)
  recurrence_start_date: string;
  recurrence_end_date?: string;
  advance_notice_days: number;
}

export function calculateNextDueDate(
  config: RecurringServiceConfig,
  fromDate: Date = new Date()
): Date {
  const dueDate = new Date(fromDate);

  switch (config.recurrence_type) {
    case 'daily':
      dueDate.setDate(dueDate.getDate() + 1);
      break;

    case 'weekly':
      // Move to next week
      dueDate.setDate(dueDate.getDate() + 7);
      break;

    case 'monthly':
      // Set to specific day of next month
      dueDate.setMonth(dueDate.getMonth() + 1);
      if (config.recurrence_day) {
        // Handle months with fewer days
        const maxDays = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
        dueDate.setDate(Math.min(config.recurrence_day, maxDays));
      }
      break;

    case 'quarterly':
      dueDate.setMonth(dueDate.getMonth() + 3);
      if (config.recurrence_day) {
        const maxDays = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
        dueDate.setDate(Math.min(config.recurrence_day, maxDays));
      }
      break;

    case 'half-yearly':
      dueDate.setMonth(dueDate.getMonth() + 6);
      if (config.recurrence_day) {
        const maxDays = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
        dueDate.setDate(Math.min(config.recurrence_day, maxDays));
      }
      break;

    case 'yearly':
      dueDate.setFullYear(dueDate.getFullYear() + 1);
      if (config.recurrence_day) {
        const maxDays = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
        dueDate.setDate(Math.min(config.recurrence_day, maxDays));
      }
      break;
  }

  return dueDate;
}

export function calculateWorkGenerationDate(dueDate: Date, advanceNoticeDays: number): Date {
  const generationDate = new Date(dueDate);
  generationDate.setDate(generationDate.getDate() - advanceNoticeDays);
  return generationDate;
}

export function isWorkOverdue(dueDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function shouldGenerateWork(
  config: RecurringServiceConfig,
  lastInstanceDate?: Date
): boolean {
  const today = new Date();
  const startDate = new Date(config.recurrence_start_date);

  // Check if we've started
  if (today < startDate) return false;

  // Check if we've ended
  if (config.recurrence_end_date) {
    const endDate = new Date(config.recurrence_end_date);
    if (today > endDate) return false;
  }

  // Calculate next due date
  const nextDueDate = lastInstanceDate 
    ? calculateNextDueDate(config, lastInstanceDate)
    : startDate;

  // Calculate when to generate work
  const generateDate = calculateWorkGenerationDate(nextDueDate, config.advance_notice_days);

  return today >= generateDate;
}

// Generate all due dates for a date range
export function generateDueDatesInRange(
  config: RecurringServiceConfig,
  startDate: Date,
  endDate: Date
): Date[] {
  const dates: Date[] = [];
  let currentDate = new Date(config.recurrence_start_date);

  while (currentDate <= endDate) {
    if (currentDate >= startDate) {
      dates.push(new Date(currentDate));
    }
    currentDate = calculateNextDueDate(config, currentDate);

    // Prevent infinite loop
    if (dates.length > 1000) break;
  }

  return dates;
}

// Sync works with updated service due date configuration
export async function syncWorkDueDates(
  serviceId: string,
  config: RecurringServiceConfig,
  supabase: any
): Promise<void> {
  try {
    const { data: works, error: fetchError } = await supabase
      .from('works')
      .select('id, due_date, status')
      .eq('service_id', serviceId)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    if (fetchError) throw fetchError;
    if (!works || works.length === 0) return;

    const startDate = new Date(config.recurrence_start_date);
    let currentDueDate = startDate;

    for (const work of works) {
      const { error: updateError } = await supabase
        .from('works')
        .update({ due_date: currentDueDate.toISOString() })
        .eq('id', work.id);

      if (updateError) {
        console.error('Error updating work due date:', updateError);
      }

      currentDueDate = calculateNextDueDate(config, currentDueDate);
    }
  } catch (error) {
    console.error('Error syncing work due dates:', error);
    throw error;
  }
}
