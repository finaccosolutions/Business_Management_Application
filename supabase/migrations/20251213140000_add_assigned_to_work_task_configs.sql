-- Add assigned_to column to work_task_configs table
ALTER TABLE work_task_configs 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES staff_members(id);
