import { supabase } from './supabase';

export type EntityType = 'customer_id' | 'employee_id' | 'service_code' | 'work_id';

export async function generateNextEntityId(
  userId: string,
  entityType: EntityType
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('generate_next_id', {
      p_user_id: userId,
      p_id_type: entityType
    });

    if (error) {
      console.error(`Error generating ${entityType}:`, error);
      return '';
    }

    return data || '';
  } catch (error) {
    console.error(`Error in generateNextEntityId for ${entityType}:`, error);
    return '';
  }
}
