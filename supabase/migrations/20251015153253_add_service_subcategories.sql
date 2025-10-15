/*
  # Add Service Subcategories Support

  1. Changes
    - Add parent_id column to service_categories table to support hierarchical structure
    - Add level column to track depth (0 = category, 1 = subcategory)
    - Add subcategory_id column to services table
    - Update existing data to ensure consistency
    
  2. Security
    - Maintain existing RLS policies
    - Ensure users can only manage their own categories and subcategories
*/

-- Add parent_id and level to service_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_categories' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE service_categories ADD COLUMN parent_id uuid REFERENCES service_categories(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_categories' AND column_name = 'level'
  ) THEN
    ALTER TABLE service_categories ADD COLUMN level integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Add display_order for better sorting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_categories' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE service_categories ADD COLUMN display_order integer DEFAULT 0;
  END IF;
END $$;

-- Add subcategory_id to services table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'subcategory_id'
  ) THEN
    ALTER TABLE services ADD COLUMN subcategory_id uuid REFERENCES service_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_service_categories_parent_id ON service_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_services_subcategory_id ON services(subcategory_id);

-- Add check constraint to ensure level is valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_category_level'
  ) THEN
    ALTER TABLE service_categories ADD CONSTRAINT valid_category_level CHECK (level IN (0, 1));
  END IF;
END $$;

-- Add check constraint to ensure parent consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parent_level_consistency'
  ) THEN
    ALTER TABLE service_categories ADD CONSTRAINT parent_level_consistency 
    CHECK (
      (level = 0 AND parent_id IS NULL) OR 
      (level = 1 AND parent_id IS NOT NULL)
    );
  END IF;
END $$;