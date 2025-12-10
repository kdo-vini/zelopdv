-- Re-enable RLS for Security
-- Execute after updating admin dashboard to use Service Role Key

-- 1. Re-enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own subscriptions
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own subscription (for Stripe webhook)
CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. Re-enable RLS on empresa_perfil
ALTER TABLE empresa_perfil ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON empresa_perfil FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON empresa_perfil FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON empresa_perfil FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. Keep super_admins without RLS (already disabled)
-- This is OK because only admins access this table

-- 4. Verify RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'empresa_perfil', 'super_admins')
ORDER BY tablename;
