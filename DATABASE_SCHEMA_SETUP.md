# Database Schema Setup Instructions

## Important: Apply the Complete Schema Migration

Your database is currently empty. You need to apply the comprehensive schema migration to set up all tables properly.

### Migration File Location
`supabase/migrations/20251006_complete_schema.sql`

### How to Apply the Migration

#### Option 1: Using Supabase Dashboard
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the entire contents of `supabase/migrations/20251006_complete_schema.sql`
4. Paste into the SQL editor
5. Click "Run"

#### Option 2: Using Supabase CLI (if available)
```bash
supabase db push
```

## What This Migration Creates

### Core Tables
1. **profiles** - User profile information
2. **services** - Services offered by users
3. **leads** - Potential customers with status tracking
4. **lead_services** - Services that leads are interested in
5. **lead_followups** - Follow-up scheduling for leads
6. **customers** - Converted leads or direct customers
7. **staff** - Staff members who can be assigned to work
8. **customer_services** - Services assigned to customers
9. **works** - Individual work items/tasks
10. **invoices** - Invoice management
11. **invoice_items** - Line items for invoices
12. **reminders** - Notifications and reminders
13. **communications** - Customer and lead communications (supports both!)
14. **customer_notes** - Notes for customers and leads (supports both!)
15. **customer_documents** - Document storage for customers
16. **customer_activities** - Activity tracking for customers

### Key Features
- **customer_notes table** now properly supports both `customer_id` AND `lead_id`
- **communications table** supports both `customer_id` AND `lead_id`
- Comprehensive Row Level Security (RLS) on all tables
- Optimized indexes for better performance
- Proper foreign key relationships

### Security
- All tables have RLS enabled
- Users can only access their own data
- Restrictive policies on all operations

## Verify the Migration

After applying, verify the schema by running:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see all 16 tables listed above.

## Check customer_notes Structure

Verify the customer_notes table has the correct columns:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customer_notes'
ORDER BY ordinal_position;
```

Expected columns:
- id (uuid)
- user_id (uuid) - NOT NULL
- customer_id (uuid) - nullable
- lead_id (uuid) - nullable
- note (text) - NOT NULL
- created_at (timestamptz)

## Important Notes

1. **At least one reference required**: Each note must have either a `customer_id` OR a `lead_id` (enforced by CHECK constraint)
2. **Communications work the same way**: Same structure as notes - supports both customers and leads
3. **All data is user-isolated**: RLS ensures users only see their own data

## Troubleshooting

If you encounter any errors during migration:
1. Check that your Supabase project has the auth schema enabled
2. Ensure you have proper permissions to create tables
3. If tables already exist, the migration uses `IF NOT EXISTS` so it should be safe to run

## After Migration

Once the migration is applied:
1. You can start creating leads and adding notes to them
2. Communications for leads will work properly
3. The Reminders page will show comprehensive alerts across all aspects
4. Lead tiles are now responsive and fit properly on all screen sizes
