-- Hotfix: offline_internal.close_caixa started persisting the canonical
-- payment snapshot before every environment had received the original
-- 20260828120000 migration. Keep this repair self-contained and idempotent so
-- a partially applied migration ledger cannot leave cash closing unavailable.

alter table public.caixa_fechamentos
  add column if not exists totais_pagamento jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.caixa_fechamentos'::regclass
      and conname = 'caixa_fechamentos_totais_pagamento_object_check'
  ) then
    alter table public.caixa_fechamentos
      add constraint caixa_fechamentos_totais_pagamento_object_check
      check (jsonb_typeof(totais_pagamento) = 'object') not valid;
  end if;
end
$$;

update public.caixa_fechamentos
set totais_pagamento = jsonb_build_object(
  'dinheiro', coalesce(total_dinheiro, 0),
  'pix', coalesce(total_pix, 0),
  'cartao', coalesce(total_cartao, 0)
)
where totais_pagamento = '{}'::jsonb;

alter table public.caixa_fechamentos
  validate constraint caixa_fechamentos_totais_pagamento_object_check;

comment on column public.caixa_fechamentos.totais_pagamento is
  'Snapshot de totais por forma de pagamento no fechamento; preserva IDs canônicos e plataformas dinâmicas.';
