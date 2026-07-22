-- MRR real: guarda o valor efetivamente cobrado por assinatura (em centavos),
-- em vez de só derivar do preço de tabela atual do plan_tier no admin-dashboard.
-- Sem essa coluna, um cliente grandfathered num price antigo (ex.: Casa dos
-- Salgados, bundle real R$147) aparece no MRR pelo preço de tabela atual
-- (R$198), não pelo que ele realmente paga.
--
-- Populada em dois pontos:
-- - Webhook Stripe (src/routes/api/billing/webhook/+server.js): soma
--   unit_amount x quantity de todos os itens da subscription (plano + addons).
-- - Fluxo Pix (src/lib/server/billingPix.js): copia amount_expected_cents do
--   billing_payments pago, travado no momento da cobrança.
--
-- Nullable: linhas antigas ficam null até o próximo evento (renovação/troca de
-- plano), ou até rodar o script de backfill único (scripts/backfill-monthly-value.js).

begin;

alter table public.subscriptions
  add column if not exists monthly_value_cents integer;

comment on column public.subscriptions.monthly_value_cents is
  'Valor mensal REAL cobrado desta assinatura, em centavos. Preenchido pelo webhook Stripe (soma dos itens) e pelo fluxo Pix (amount_expected_cents do billing_payments). Null = ainda não sincronizado; MRR cai no fallback estimado por plan_tier.';

commit;
