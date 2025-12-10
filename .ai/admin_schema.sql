-- Super Admin Dashboard - Database Schema
-- Phase 1: Foundation Tables
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. SUPER ADMINS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin', 'support_admin', 'billing_admin')),
  permissions jsonb DEFAULT '["view_dashboard"]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  last_login timestamp with time zone,
  is_active boolean DEFAULT true,
  CONSTRAINT unique_user_admin UNIQUE (user_id)
);

ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all admins"
  ON super_admins FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active = true));

CREATE POLICY "Only super_admin can manage admins"
  ON super_admins FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM super_admins WHERE role = 'super_admin' AND is_active = true));

CREATE INDEX IF NOT EXISTS idx_super_admins_user_id ON super_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins(email);

-- ============================================
-- 2. ADMIN ACTIVITY LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES super_admins(id) ON DELETE SET NULL,
  admin_email text NOT NULL,
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all activity logs"
  ON admin_activity_logs FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active = true));

CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_activity_logs(created_at DESC);

-- ============================================
-- 3. EMAIL CAMPAIGNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  target_filter jsonb DEFAULT '{}'::jsonb,
  sent_count integer DEFAULT 0,
  created_by uuid REFERENCES super_admins(id) ON DELETE SET NULL,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed'))
);

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all campaigns"
  ON email_campaigns FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM super_admins WHERE is_active = true));

-- ============================================
-- 4. MODIFY SUBSCRIPTIONS TABLE
-- ============================================
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS manually_extended_until timestamp with time zone,
ADD COLUMN IF NOT EXISTS admin_notes text,
ADD COLUMN IF NOT EXISTS last_modified_by uuid REFERENCES super_admins(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_modified_at timestamp with time zone;

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION admin_extend_subscription(
  p_subscription_id uuid,
  p_months integer,
  p_reason text,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_expiry timestamp with time zone;
  v_new_expiry timestamp with time zone;
  v_user_id uuid;
BEGIN
  SELECT COALESCE(manually_extended_until, current_period_end), user_id
  INTO v_current_expiry, v_user_id
  FROM subscriptions WHERE id = p_subscription_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Subscription not found');
  END IF;
  
  v_new_expiry := v_current_expiry + (p_months || ' months')::interval;
  
  UPDATE subscriptions
  SET manually_extended_until = v_new_expiry,
      admin_notes = p_reason,
      last_modified_by = p_admin_id,
      last_modified_at = now()
  WHERE id = p_subscription_id;
  
  RETURN jsonb_build_object('success', true, 'new_expiry', v_new_expiry);
END;
$$;
