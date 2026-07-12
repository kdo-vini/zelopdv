-- Allow the Intelligence narrative layer to use the shared AI cost ledger.
-- The original constraint predates this product surface and only permits
-- support/assistant values.
alter table public.ai_usage_logs
  drop constraint if exists ai_usage_logs_chat_type_check;

alter table public.ai_usage_logs
  add constraint ai_usage_logs_chat_type_check
  check (chat_type in ('support', 'assistant', 'intelligence'));
