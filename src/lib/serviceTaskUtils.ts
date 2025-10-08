import { supabase } from './supabase';

export async function copyServiceTasksToWork(serviceId: string, workId: string): Promise<boolean> {
  try {
    const { data: serviceTasks, error: fetchError } = await supabase
      .from('service_tasks')
      .select('*')
      .eq('service_id', serviceId)
      .eq('is_active', true)
      .order('sort_order');

    if (fetchError) {
      console.error('Error fetching service tasks:', fetchError);
      return false;
    }

    if (!serviceTasks || serviceTasks.length === 0) {
      return true;
    }

    const workTasks = serviceTasks.map((task, index) => ({
      work_id: workId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      estimated_hours: task.estimated_hours,
      sort_order: index,
      status: 'pending',
      remarks: task.notes,
      actual_hours: 0,
    }));

    const { error: insertError } = await supabase
      .from('work_tasks')
      .insert(workTasks);

    if (insertError) {
      console.error('Error inserting work tasks:', insertError);
      return false;
    }

    console.log(`Successfully copied ${workTasks.length} tasks to work ${workId}`);
    return true;
  } catch (error) {
    console.error('Error in copyServiceTasksToWork:', error);
    return false;
  }
}
