-- 1. Ensure voucher_types table exists (Idempotent)
CREATE TABLE IF NOT EXISTS public.voucher_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT voucher_types_user_id_code_key UNIQUE (user_id, code)
);

-- Enable RLS
ALTER TABLE public.voucher_types ENABLE ROW LEVEL SECURITY;

-- 2. Clean up broken triggers related to vouchers
-- This block dynamically finds and drops any triggers that use functions with "voucher" in their name.
-- This addresses the "relation 'voucher_types' does not exist" error caused by a ghost migration/trigger.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            trg.tgname, 
            ns_tab.nspname as table_schema,
            tab.relname as table_name,
            proc.proname as function_name
        FROM pg_trigger trg
        JOIN pg_class tab ON trg.tgrelid = tab.oid
        JOIN pg_namespace ns_tab ON tab.relnamespace = ns_tab.oid
        JOIN pg_proc proc ON trg.tgfoid = proc.oid
        WHERE proc.proname ILIKE '%voucher%'
    )
    LOOP
        RAISE NOTICE 'Dropping trigger % on %.% (Function: %)', r.tgname, r.table_schema, r.table_name, r.function_name;
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I CASCADE', r.tgname, r.table_schema, r.table_name);
    END LOOP;
END $$;

-- 3. Clean up the functions themselves
DROP FUNCTION IF EXISTS public.create_default_voucher_types() CASCADE;
DROP FUNCTION IF EXISTS public.setup_default_vouchers() CASCADE;
-- Add other likely names if needed, but the cascade from trigger drop usually helps, 
-- or we can just leave the unused function as it won't crash signup if not triggered.

-- 4. Re-apply RLS Policies (Idempotent)
DROP POLICY IF EXISTS "Users can view their own voucher types" ON public.voucher_types;
CREATE POLICY "Users can view their own voucher types"
    ON public.voucher_types FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own voucher types" ON public.voucher_types;
CREATE POLICY "Users can insert their own voucher types"
    ON public.voucher_types FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own voucher types" ON public.voucher_types;
CREATE POLICY "Users can update their own voucher types"
    ON public.voucher_types FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own voucher types" ON public.voucher_types;
CREATE POLICY "Users can delete their own voucher types"
    ON public.voucher_types FOR DELETE
    USING (auth.uid() = user_id);
