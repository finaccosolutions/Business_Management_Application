# Nested Sub-Groups Feature - Chart of Accounts

## Overview
Enhanced the Chart of Accounts module to support **unlimited nested sub-groups** at any level, allowing users to create complex hierarchical account structures.

## Database Schema
The existing `account_groups` table already supports unlimited nesting through the `parent_group_id` column:

```sql
CREATE TABLE account_groups (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_group_id UUID REFERENCES account_groups(id), -- Self-referencing foreign key
  account_type TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

This self-referencing structure allows any group to be a parent of another group, supporting infinite nesting levels.

## Key Features Implemented

### 1. **Unlimited Nesting Levels**
- Groups can have sub-groups
- Sub-groups can have their own sub-groups
- No limit on the depth of nesting

### 2. **Visual Hierarchy Indication**
- Indented display in table and card views
- Border indicators for nested levels
- Chevron icons to expand/collapse nested structures

### 3. **Contextual Actions**
When you click on any group (parent or sub-group), you can:
- **Add Subgroup** - Create a sub-group under the current group
- **Add Ledger** - Create a ledger account under the current group
- View all ledgers and sub-groups within that group

### 4. **Intelligent Parent Selection**
When creating or editing a group, the parent group dropdown:
- Shows only groups of the same account type
- Displays visual hierarchy with indentation (└─)
- Prevents circular references (can't set a group as its own descendant)
- Filters out the current group and its descendants when editing

### 5. **Recursive Display**
All three view modes support nested structures:
- **Table View** - Shows hierarchical structure with expandable rows
- **Card View** - Displays nested groups with visual borders and indentation
- **Tree View** - Full hierarchical tree visualization (already supported)

## How It Works

### Creating Sub-Groups

1. Navigate to **Chart of Accounts > Groups** tab
2. Click on any parent group to expand it
3. Click **"Add Subgroup"** button
4. The modal opens with the parent group pre-selected
5. Enter sub-group details and save

### Creating Further Nested Sub-Groups

1. Expand a parent group to see its sub-groups
2. Click on any sub-group to expand it
3. Click **"Add Subgroup"** button within that sub-group
4. Create another level of sub-group
5. Repeat for unlimited levels

### Adding Ledgers at Any Level

1. Expand any group or sub-group
2. Click **"Add Ledger"** button
3. The ledger is created under that specific group
4. Ledgers can be created at any level of the hierarchy

## Example Hierarchy Structure

```
Assets (Top Level)
├── Current Assets (Sub-group Level 1)
│   ├── Cash in Hand (Sub-group Level 2)
│   │   ├── Petty Cash (Sub-group Level 3)
│   │   │   └── Ledger: Office Petty Cash
│   │   └── Ledger: Main Cash Counter
│   ├── Bank Account (Sub-group Level 2)
│   │   ├── HDFC Bank (Sub-group Level 3)
│   │   │   └── Ledger: HDFC Current Account
│   │   └── Ledger: ICICI Savings Account
│   └── Accounts Receivable (Sub-group Level 2)
│       └── Ledger: Customer XYZ
└── Fixed Assets (Sub-group Level 1)
    ├── Furniture & Fixtures (Sub-group Level 2)
    └── Computer Equipment (Sub-group Level 2)
```

## Technical Implementation Details

### Recursive Functions

1. **`buildHierarchy()`** - Recursively builds the group hierarchy with level information
2. **Nested Rendering** - Each sub-group can contain more sub-groups and ledgers
3. **Balance Calculation** - Aggregates balances from all nested levels

### Parent Selection Logic

```javascript
// Prevents circular references
filter((group) => {
  // Can't select self as parent
  if (editingGroup && group.id === editingGroup.id) return false;

  // Can't select descendants as parent
  if (editingGroup) {
    let checkGroup = group;
    while (checkGroup.parent_group_id) {
      if (checkGroup.parent_group_id === editingGroup.id) return false;
      checkGroup = groups.find(g => g.id === checkGroup.parent_group_id);
      if (!checkGroup) break;
    }
  }

  // Only same account type
  return group.account_type === groupFormData.account_type;
})
```

### Expand/Collapse State Management

- Uses `Set<string>` to track expanded groups
- Persists across view changes
- Independent for each user interaction

## User Interface Updates

### Table View
- Expandable rows with sub-group sections
- Nested ledger display with visual separation
- Action buttons at each level (Add Subgroup, Add Ledger)

### Card View
- Nested cards with border-left indicators
- Collapsible sub-sections
- Color-coded hover effects (green for groups, blue for ledgers)

### Tree View
- Already supported unlimited nesting
- Shows full hierarchy with folder icons
- Calculates and displays aggregated balances

## Best Practices

1. **Organization**: Use sub-groups to organize related accounts logically
2. **Balance Tracking**: Balances automatically aggregate up the hierarchy
3. **Account Types**: Keep sub-groups within the same account type as their parent
4. **Naming**: Use clear, descriptive names for easy navigation
5. **Depth**: While unlimited, keep reasonable depth (3-5 levels) for usability

## Benefits

1. **Flexibility** - Create any organizational structure needed
2. **Scalability** - Grows with business complexity
3. **Clarity** - Better organization and grouping of accounts
4. **Reporting** - Easier to generate reports at different levels
5. **Standard Compliance** - Supports standard accounting hierarchies

## Database Capability Confirmation

✅ **Database fully supports unlimited nesting**
- Self-referencing foreign key in place
- No constraints on nesting depth
- Properly indexed for performance
- RLS policies handle all levels correctly
