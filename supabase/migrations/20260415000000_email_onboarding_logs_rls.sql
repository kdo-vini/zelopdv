-- Migration: email_onboarding_logs — table creation + RLS
--
-- Creates the table that tracks which onboarding emails have been sent to each
-- trialing user, and locks it down with RLS.
--
-- All application access to this table goes through the Supabase service-role
-- client (supabaseAdmin), which bypasses RLS by design.  No anon/authenticated
-- policies are intentionally defined here — direct client-side access must
-- remain blocked.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_onboarding_logs (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id         UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email_day       INT         NOT NULL,
  recipient_email TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, email_day)
);

-- ── Row Level Security ────────────────────────────────────────────────────────

-- Enable RLS — no permissive policies are added, so direct client access is
-- denied for all roles.  The service-role key used by the server bypasses RLS
-- entirely, so server-side operations continue to work without any policy.
ALTER TABLE public.email_onboarding_logs ENABLE ROW LEVEL SECURITY;
