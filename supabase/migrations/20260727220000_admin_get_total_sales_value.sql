-- Admin RPC: faturamento total por usuário (soma de valor_total em vendas).
--
-- Usada pelo dashboard admin para calcular faturamento médio mensal por cliente.
-- Security definer: o dashboard usa anon key (não service-role), então precisa
-- bypassar RLS para ler vendas de todos os usuários.
--
-- Uso no admin-dashboard:
--   const { data } = await supabase.rpc('admin_get_total_sales_value')
--   // data = [{ id_usuario: uuid, total_revenue: numeric }, ...]

create or replace function admin_get_total_sales_value()
returns table (id_usuario uuid, total_revenue numeric)
security definer
set search_path = public
language plpgsql
as $$
begin
  return query
    select v.id_usuario, coalesce(sum(v.valor_total), 0)::numeric as total_revenue
    from vendas v
    group by v.id_usuario;
end;
$$;
