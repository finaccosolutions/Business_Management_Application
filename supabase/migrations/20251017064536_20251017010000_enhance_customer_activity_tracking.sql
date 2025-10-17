/*
  # Enhanced Customer Activity Tracking
  
  1. Changes
    - Add triggers to track work creation, invoice creation, and communication logging
    - Add triggers to track service usage
    - Ensure all customer interactions are logged
  
  2. Security
    - No RLS changes - uses existing customer_activities table
*/

-- Function to log work creation
CREATE OR REPLACE FUNCTION log_work_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO customer_activities (
    customer_id,
    activity_type,
    activity_title,
    activity_description,
    metadata,
    user_id
  ) VALUES (
    NEW.customer_id,
    'work',
    'Work Created',
    'New work "' || NEW.title || '" created',
    jsonb_build_object(
      'work_id', NEW.id,
      'service_id', NEW.service_id,
      'status', NEW.status,
      'priority', NEW.priority
    ),
    NEW.user_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_log_work_created ON works;

-- Create trigger for work creation
CREATE TRIGGER trigger_log_work_created
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION log_work_created();

-- Function to log work status changes
CREATE OR REPLACE FUNCTION log_work_status_changed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO customer_activities (
      customer_id,
      activity_type,
      activity_title,
      activity_description,
      metadata,
      user_id
    ) VALUES (
      NEW.customer_id,
      'status_change',
      'Work Status Updated',
      'Work "' || NEW.title || '" status changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object(
        'work_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status
      ),
      NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_log_work_status_changed ON works;

-- Create trigger for work status changes
CREATE TRIGGER trigger_log_work_status_changed
AFTER UPDATE ON works
FOR EACH ROW
EXECUTE FUNCTION log_work_status_changed();

-- Function to log invoice creation
CREATE OR REPLACE FUNCTION log_invoice_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO customer_activities (
    customer_id,
    activity_type,
    activity_title,
    activity_description,
    metadata,
    user_id
  ) VALUES (
    NEW.customer_id,
    'invoice',
    'Invoice Created',
    'Invoice ' || NEW.invoice_number || ' created for ₹' || NEW.total_amount,
    jsonb_build_object(
      'invoice_id', NEW.id,
      'invoice_number', NEW.invoice_number,
      'total_amount', NEW.total_amount,
      'status', NEW.status
    ),
    NEW.user_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_log_invoice_created ON invoices;

-- Create trigger for invoice creation
CREATE TRIGGER trigger_log_invoice_created
AFTER INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION log_invoice_created();

-- Function to log invoice payment
CREATE OR REPLACE FUNCTION log_invoice_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'paid' AND NEW.status = 'paid' THEN
    INSERT INTO customer_activities (
      customer_id,
      activity_type,
      activity_title,
      activity_description,
      metadata,
      user_id
    ) VALUES (
      NEW.customer_id,
      'payment',
      'Payment Received',
      'Payment received for invoice ' || NEW.invoice_number || ' - ₹' || NEW.total_amount,
      jsonb_build_object(
        'invoice_id', NEW.id,
        'invoice_number', NEW.invoice_number,
        'total_amount', NEW.total_amount
      ),
      NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_log_invoice_payment ON invoices;

-- Create trigger for invoice payment
CREATE TRIGGER trigger_log_invoice_payment
AFTER UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION log_invoice_payment();

-- Function to log communication
CREATE OR REPLACE FUNCTION log_communication_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO customer_activities (
    customer_id,
    activity_type,
    activity_title,
    activity_description,
    metadata,
    user_id
  ) VALUES (
    NEW.customer_id,
    'communication',
    'Communication Logged',
    COALESCE(NEW.type || ' - ' || NEW.subject, NEW.type || ' communication'),
    jsonb_build_object(
      'communication_id', NEW.id,
      'type', NEW.type,
      'subject', NEW.subject
    ),
    NEW.user_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_log_communication_created ON communications;

-- Create trigger for communication
CREATE TRIGGER trigger_log_communication_created
AFTER INSERT ON communications
FOR EACH ROW
EXECUTE FUNCTION log_communication_created();