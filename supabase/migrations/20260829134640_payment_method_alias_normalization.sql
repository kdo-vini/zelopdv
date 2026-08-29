-- Normalize native payment aliases at the financial-table boundary.
-- This covers display labels emitted by ZeloMenu/ZeloChat such as "Pix",
-- "Dinheiro", "Cartão de crédito" and "Cartão de débito". Historical rows
-- are normalized by the report layer and are intentionally not rewritten.

create or replace function public.normalize_payment_method_id(p_method text)
returns text
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_method text := lower(trim(p_method));
begin
  v_method := translate(v_method, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_method := regexp_replace(replace(replace(v_method, '_', ' '), '-', ' '), '\s+', ' ', 'g');

  return case v_method
    when 'dinheiro' then 'dinheiro'
    when 'cash' then 'dinheiro'
    when 'pix' then 'pix'
    when 'pix online' then 'pix'
    when 'debito' then 'cartao_debito'
    when 'cartao debito' then 'cartao_debito'
    when 'cartao de debito' then 'cartao_debito'
    when 'credito' then 'cartao_credito'
    when 'cartao credito' then 'cartao_credito'
    when 'cartao de credito' then 'cartao_credito'
    when 'cartao' then 'cartao'
    when 'vale refeicao' then 'vale_refeicao'
    when 'fiado' then 'fiado'
    when 'multiplo' then 'multiplo'
    when 'multiplos pagamentos' then 'multiplo'
    else trim(p_method)
  end;
end;
$$;

create or replace function public.normalize_vendas_payment_method()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.forma_pagamento := public.normalize_payment_method_id(new.forma_pagamento);
  return new;
end;
$$;

drop trigger if exists vendas_normalize_payment_method on public.vendas;
create trigger vendas_normalize_payment_method
  before insert or update of forma_pagamento on public.vendas
  for each row
  execute function public.normalize_vendas_payment_method();

drop trigger if exists vendas_pagamentos_normalize_payment_method on public.vendas_pagamentos;
create trigger vendas_pagamentos_normalize_payment_method
  before insert or update of forma_pagamento on public.vendas_pagamentos
  for each row
  execute function public.normalize_vendas_payment_method();

revoke all on function public.normalize_payment_method_id(text) from public, anon;
grant execute on function public.normalize_payment_method_id(text) to authenticated, service_role;

revoke all on function public.normalize_vendas_payment_method() from public, anon;
grant execute on function public.normalize_vendas_payment_method() to authenticated, service_role;

notify pgrst, 'reload schema';
