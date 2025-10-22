/*
  # Drop Unused Staff Table

  1. Purpose
    - Remove the obsolete 'staff' table
    - The application uses 'staff_members' table instead

  2. Safety
    - Staff table has 0 records
    - Only staff_members is being used in the application
*/

-- Drop the unused staff table
DROP TABLE IF EXISTS staff CASCADE;
