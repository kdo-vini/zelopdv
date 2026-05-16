-- MVP: Cliente indica Cliente
-- 2026-05-16
--
-- The app uses empresa_perfil.user_id as the tenant/company owner id.
-- Referral tables therefore store *_empresa_id as auth.users(id) UUIDs.

-- ---------------------------------------------------------------------------
-- 1. Stable referral code on company profile
-- ---------------------------------------------------------------------------

ALTER TABLE public.empresa_perfil
  ADD COLUMN IF NOT EXISTS referral_code text;

COMMENT ON COLUMN public.empresa_perfil.referral_code IS
  'Stable public referral code for Cliente indica Cliente links.';

CREATE UNIQUE INDEX IF NOT EXISTS empresa_perfil_referral_code_unique
  ON public.empresa_perfil (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS empresa_perfil_referral_code_idx
  ON public.empresa_perfil (referral_code);

-- ---------------------------------------------------------------------------
-- 2. Referral tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_empresa_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_email text,
  referred_phone text,
  referred_documento text,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'clicked'
    CHECK (status IN (
      'clicked',
      'signed_up',
      'trial_started',
      'pending_payment',
      'paid_manual_confirmed',
      'reward_approved',
      'reward_applied',
      'rejected'
    )),
  source text,
  rejection_reason text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.referrals IS
  'Tracks referral clicks, signups, trial starts and manual payment confirmation.';

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS referrals_referral_code_idx
  ON public.referrals (referral_code);

CREATE INDEX IF NOT EXISTS referrals_referrer_empresa_id_idx
  ON public.referrals (referrer_empresa_id);

CREATE INDEX IF NOT EXISTS referrals_referred_empresa_id_idx
  ON public.referrals (referred_empresa_id);

CREATE INDEX IF NOT EXISTS referrals_status_idx
  ON public.referrals (status);

CREATE INDEX IF NOT EXISTS referrals_created_at_idx
  ON public.referrals (created_at DESC);

CREATE INDEX IF NOT EXISTS referrals_referrer_status_created_idx
  ON public.referrals (referrer_empresa_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_empresa_unique
  ON public.referrals (referred_empresa_id)
  WHERE referred_empresa_id IS NOT NULL AND status <> 'rejected';

-- ---------------------------------------------------------------------------
-- 3. Internal rewards
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type text NOT NULL DEFAULT 'credit'
    CHECK (reward_type IN ('credit', 'addon_days')),
  amount_cents integer,
  addon_key text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'cancelled')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT referral_rewards_referral_unique UNIQUE (referral_id),
  CONSTRAINT referral_rewards_credit_amount_check
    CHECK (
      (reward_type = 'credit' AND amount_cents IS NOT NULL AND amount_cents > 0)
      OR (reward_type = 'addon_days' AND addon_key IS NOT NULL)
    )
);

COMMENT ON TABLE public.referral_rewards IS
  'Internal credits/add-on rewards. Financial payout is intentionally not supported.';

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS referral_rewards_referral_id_idx
  ON public.referral_rewards (referral_id);

CREATE INDEX IF NOT EXISTS referral_rewards_empresa_id_idx
  ON public.referral_rewards (empresa_id);

CREATE INDEX IF NOT EXISTS referral_rewards_status_idx
  ON public.referral_rewards (status);

CREATE INDEX IF NOT EXISTS referral_rewards_created_at_idx
  ON public.referral_rewards (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Future internal trigger/event infrastructure
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_trigger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_key text NOT NULL CHECK (trigger_key IN (
    'first_cash_closing',
    'thirty_sales',
    'seven_days_used',
    'zelochat_used'
  )),
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT referral_trigger_events_empresa_trigger_unique UNIQUE (empresa_id, trigger_key)
);

COMMENT ON TABLE public.referral_trigger_events IS
  'Lightweight infrastructure for future referral nudges; no invasive popups in MVP.';

ALTER TABLE public.referral_trigger_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS referral_trigger_events_empresa_id_idx
  ON public.referral_trigger_events (empresa_id);

CREATE INDEX IF NOT EXISTS referral_trigger_events_trigger_key_idx
  ON public.referral_trigger_events (trigger_key);

-- ---------------------------------------------------------------------------
-- 5. RLS policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS referrals_owner_select ON public.referrals;
CREATE POLICY referrals_owner_select ON public.referrals
  FOR SELECT
  TO authenticated
  USING (
    public.get_owner_user_id(auth.uid()) = referrer_empresa_id
    OR public.get_owner_user_id(auth.uid()) = referred_empresa_id
    OR EXISTS (
      SELECT 1
      FROM public.super_admins sa
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
    )
  );

DROP POLICY IF EXISTS referral_rewards_owner_select ON public.referral_rewards;
CREATE POLICY referral_rewards_owner_select ON public.referral_rewards
  FOR SELECT
  TO authenticated
  USING (
    public.get_owner_user_id(auth.uid()) = empresa_id
    OR EXISTS (
      SELECT 1
      FROM public.super_admins sa
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
    )
  );

DROP POLICY IF EXISTS referral_trigger_events_owner ON public.referral_trigger_events;
CREATE POLICY referral_trigger_events_owner ON public.referral_trigger_events
  FOR ALL
  TO authenticated
  USING (public.get_owner_user_id(auth.uid()) = empresa_id)
  WITH CHECK (public.get_owner_user_id(auth.uid()) = empresa_id);

-- New Supabase projects may not expose new tables to the Data API by default.
-- Keep grants explicit and RLS guarded.
GRANT SELECT ON public.referrals TO authenticated;
GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.referral_trigger_events TO authenticated;

GRANT ALL ON public.referrals TO service_role;
GRANT ALL ON public.referral_rewards TO service_role;
GRANT ALL ON public.referral_trigger_events TO service_role;

-- ---------------------------------------------------------------------------
-- Notify PostgREST to reload the schema cache.
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
