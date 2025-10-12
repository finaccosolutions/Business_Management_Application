# Quick Start: Documents & Recurring Period Automation

## What's New?

### 1. Documents Tab in Work Details
- View and manage all documents for a work
- Mark documents as collected
- Upload and download document files
- Track required vs optional documents
- See collection and upload status at a glance

### 2. Automatic Recurring Period Management
- **First period auto-creates** when you create a recurring work
- **Next period auto-creates** when current period due date passes
- **Invoice auto-generates** when you mark a period as completed
- No more manual period creation!

## Quick Setup (3 Steps)

### Step 1: Run the Migration
1. Open your Supabase SQL Editor
2. Copy all contents from `APPLY_THIS_MIGRATION.sql`
3. Paste and run in SQL Editor
4. Wait for "Success" message

### Step 2: Set Up Service Documents (Optional)
1. Go to Services page
2. Edit a service
3. Add documents that should be collected for every work
4. Save the service

### Step 3: Set Up Periodic Job (Recommended)
Add this to your cron job or Supabase Edge Function:
```sql
SELECT create_next_recurring_period_if_needed();
```
Run it daily to auto-create next periods.

## How to Use

### Managing Documents

**To view documents:**
1. Open a work
2. Click "Documents" tab
3. See all documents with status

**To mark as collected:**
- Click the checkmark icon
- Document turns green

**To upload a file:**
- Click upload icon
- Select file (storage integration pending)

**To download:**
- Click download icon (if file exists)

### Managing Recurring Periods

**Creating recurring work:**
1. Create work as usual
2. Enable "Is Recurring"
3. Select pattern (monthly, quarterly, etc.)
4. Set recurrence day (e.g., 10 for 10th of month)
5. Set billing amount
6. Enable "Auto Bill" if you want automatic invoices
7. Save work

**What happens automatically:**
- ✅ First period is created
- ✅ Period gets due date on specified day
- ✅ When due date passes, next period auto-creates
- ✅ When you mark period "Completed" → Invoice auto-generates
- ✅ Process repeats forever until work is deactivated

**To complete a period:**
1. Go to "Recurring Periods" tab
2. Find the period
3. Change status to "Completed"
4. Invoice generates automatically (if auto_bill enabled)

## Example: Monthly Recurring Service

**Scenario:** You have a monthly accounting service due on the 10th of each month.

**Setup:**
1. Create service "Monthly Accounting"
2. Add documents: "Bank Statements", "Receipts", "Invoices"
3. Set default price: ₹5000
4. Enable recurring: Monthly, Day 10
5. Save service

**Create Work:**
1. Create work for customer
2. Select "Monthly Accounting" service
3. Enable "Is Recurring"
4. Set recurrence: Monthly, Day 10
5. Set billing amount: ₹5000
6. Enable "Auto Bill"
7. Save work

**What Happens:**
- **Oct 10**: First period "October 2024" created automatically
- **Work on period**: You mark documents as collected, do the work
- **Mark completed**: Change status to "Completed"
- **Invoice generated**: System creates invoice for ₹5000 + tax
- **Oct 11**: Next period "November 2024" auto-creates with due date Nov 10
- **Repeats**: Process continues every month

## Key Features

### Documents Tab
- ✅ See all documents in one place
- ✅ Required documents highlighted
- ✅ Collection tracking
- ✅ File upload support (UI ready)
- ✅ Download files
- ✅ Edit and delete

### Recurring Periods
- ✅ Auto-create first period
- ✅ Auto-create next periods
- ✅ Auto-generate invoices
- ✅ Track each period independently
- ✅ See period history
- ✅ Overdue warnings

## Troubleshooting

**Q: Periods not creating automatically?**
A: Make sure you run the migration and set up the periodic job (Step 3).

**Q: Invoices not generating?**
A: Check that "Auto Bill" is enabled on the work and billing amount is set.

**Q: Documents not showing?**
A: Documents copy from service documents. Add documents to the service first.

**Q: Where do I set recurrence day?**
A: In the work form, there's a "Recurrence Day" field when recurring is enabled.

## Tips

1. **Set up service documents first** - They auto-copy to every work
2. **Use recurrence day wisely** - Choose a consistent day like 1st or 10th
3. **Enable auto-bill** - Saves time generating invoices manually
4. **Check periods regularly** - Make sure periodic job is running
5. **Mark periods completed promptly** - Triggers invoice generation

## Need Help?

- Read full guide: `WORK_DOCUMENTS_AND_RECURRING_AUTOMATION_GUIDE.md`
- Check migration file: `APPLY_THIS_MIGRATION.sql`
- Review database schema in Supabase Dashboard
- Check browser console for any errors

---

**That's it!** Your documents and recurring periods are now fully automated.
