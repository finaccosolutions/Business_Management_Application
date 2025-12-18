-- Add recurrence start columns to works and work_task_configs

DO $$ 
BEGIN 
    -- Works table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'works' AND column_name = 'financial_year_start_month') THEN
        ALTER TABLE works ADD COLUMN financial_year_start_month integer DEFAULT 4;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'works' AND column_name = 'weekly_start_day') THEN
        ALTER TABLE works ADD COLUMN weekly_start_day text DEFAULT 'monday';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'works' AND column_name = 'monthly_start_day') THEN
        ALTER TABLE works ADD COLUMN monthly_start_day integer;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'works' AND column_name = 'quarterly_start_day') THEN
        ALTER TABLE works ADD COLUMN quarterly_start_day integer;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'works' AND column_name = 'half_yearly_start_day') THEN
        ALTER TABLE works ADD COLUMN half_yearly_start_day integer;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'works' AND column_name = 'yearly_start_day') THEN
        ALTER TABLE works ADD COLUMN yearly_start_day integer;
    END IF;

    -- Work Task Configs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_task_configs' AND column_name = 'recurrence_start_day') THEN
        ALTER TABLE work_task_configs ADD COLUMN recurrence_start_day text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_task_configs' AND column_name = 'recurrence_start_month') THEN
        ALTER TABLE work_task_configs ADD COLUMN recurrence_start_month integer;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_task_configs' AND column_name = 'exact_due_date') THEN
        ALTER TABLE work_task_configs ADD COLUMN exact_due_date date;
    END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_task_configs' AND column_name = 'assigned_to') THEN
        ALTER TABLE work_task_configs ADD COLUMN assigned_to uuid REFERENCES staff_members(id);
    END IF;

END $$;
