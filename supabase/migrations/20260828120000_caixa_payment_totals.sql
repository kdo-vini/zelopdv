-- Additive per-payment-method snapshot for cash closings.
-- Legacy aggregate columns remain the compatibility contract for old clients.

alter table public.caixa_fechamentos
  add column if not exists totais_pagamento jsonb not null default '{}'::jsonb;

alter table public.caixa_fechamentos
  drop constraint if exists caixa_fechamentos_totais_pagamento_object_check;

alter table public.caixa_fechamentos
  add constraint caixa_fechamentos_totais_pagamento_object_check
  check (jsonb_typeof(totais_pagamento) = 'object');

comment on column public.caixa_fechamentos.totais_pagamento is
  'Snapshot de totais por forma de pagamento no fechamento; preserva IDs canônicos e plataformas dinâmicas.';

-- Existing closings only retain the three legacy aggregates. Card totals cannot
-- be split retrospectively between debit and credit.
update public.caixa_fechamentos
set totais_pagamento = jsonb_build_object(
  'dinheiro', coalesce(total_dinheiro, 0),
  'pix', coalesce(total_pix, 0),
  'cartao', coalesce(total_cartao, 0)
)
where totais_pagamento = '{}'::jsonb;
