-- Função agregadora para painel operacional (dashboard) consolidando múltiplas métricas em uma única chamada.
-- Execute no editor SQL do Supabase. Idempotente via CREATE OR REPLACE.
-- Retorna um JSON com chaves: vendas, estoque, caixa, atividade, alertas, insight
-- Observação: Não inclui dados de fiado para evitar poluição, conforme decisão de UX.

create or replace function public.dashboard_resumo()
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_agora timestamptz := now();
  v_inicio_hoje timestamptz := date_trunc('day', v_agora);
  v_inicio_ontem timestamptz := date_trunc('day', v_agora - interval '1 day');
  v_fim_ontem timestamptz := v_inicio_hoje; -- inicio de hoje é fim de ontem

  v_vendas_total_hoje numeric := 0;
  v_vendas_count_hoje int := 0;
  v_ticket_medio_hoje numeric := null;
  v_ticket_medio_ontem numeric := null;
  v_ticket_var_pct numeric := null;

  v_criticos int := 0;
  v_rupturas int := 0;
  v_total_itens int := 0;
  v_saude_estoque_pct numeric := null;

  v_caixa_aberto boolean := false;
  v_caixa_aberto_desde timestamptz := null;
  v_caixa_horas numeric := null;
  v_caixa_ultimo_fechamento timestamptz := null;
  v_id_caixa_aberto bigint := null;

  v_atividade json := '[]'::json;
  v_alertas json := '[]'::json;
  v_insight text := null;
begin
  if v_user is null then
    return json_build_object('error','sessao_invalida');
  end if;

  -- Vendas hoje
  select coalesce(sum(valor_total),0), count(*),
         case when count(*)>0 then sum(valor_total)/count(*) else null end
    into v_vendas_total_hoje, v_vendas_count_hoje, v_ticket_medio_hoje
  from vendas
  where id_usuario = v_user
    and created_at >= v_inicio_hoje;

  -- Vendas ontem (ticket)
  select case when count(*)>0 then sum(valor_total)/count(*) else null end
    into v_ticket_medio_ontem
  from vendas
  where id_usuario = v_user
    and created_at >= v_inicio_ontem and created_at < v_fim_ontem;

  if v_ticket_medio_hoje is not null and v_ticket_medio_ontem is not null and v_ticket_medio_ontem > 0 then
    v_ticket_var_pct := round( (v_ticket_medio_hoje - v_ticket_medio_ontem) / v_ticket_medio_ontem * 100, 2);
  end if;

  -- Estoque health
  -- Ajuste: tabela produtos usa controlar_estoque + estoque_atual em vez de 'quantidade'.
  -- Consideramos apenas itens com controlar_estoque=true para métricas de saúde.
  select
    count(*) filter (where controlar_estoque and estoque_atual = 0) as rupturas,
    count(*) filter (where controlar_estoque and estoque_atual <= 3) as criticos,
    count(*) filter (where controlar_estoque) as total_itens
    into v_rupturas, v_criticos, v_total_itens
  from produtos
  where id_usuario = v_user;

  if v_total_itens > 0 then
    v_saude_estoque_pct := round( (v_total_itens - v_criticos)::numeric / v_total_itens * 100, 2 );
  end if;

  -- Caixa aberto: usar tabela 'caixas' (MVP) com data_abertura e data_fechamento
  select id, data_abertura
    into v_id_caixa_aberto, v_caixa_aberto_desde
  from caixas
  where id_usuario = v_user and data_fechamento is null
  order by data_abertura desc
  limit 1;

  if v_id_caixa_aberto is not null then
    v_caixa_aberto := true;
    v_caixa_horas := round( extract(epoch from (v_agora - v_caixa_aberto_desde)) / 3600, 2 );
  end if;

  -- Último fechamento: maior data_fechamento registrada
  select max(data_fechamento) into v_caixa_ultimo_fechamento
  from caixas
  where id_usuario = v_user and data_fechamento is not null;

  -- Atividade recente (últimas N vendas hoje + últimas N movimentações de caixa)
  with ult_vendas as (
    select 'venda' as tipo, id, valor_total as valor, created_at as ts, null::text as motivo
    from vendas
    where id_usuario = v_user and created_at >= v_inicio_hoje
    order by created_at desc
    limit 6
  ), ult_movs as (
    select case when tipo = 'sangria' then 'sangria' else 'suprimento' end as tipo,
           id, valor, created_at as ts, motivo
    from caixa_movimentacoes
    where id_usuario = v_user
    order by created_at desc
    limit 6
  ), unidos as (
    select * from ult_vendas
    union all
    select * from ult_movs
  )
  select coalesce(json_agg(json_build_object(
           'tipo', tipo,
           'id', id,
           'valor', valor,
           'ts', ts,
           'motivo', motivo
         ) order by ts desc), '[]'::json)
    into v_atividade
  from unidos;

  -- Alertas simples
  if v_rupturas > 0 then
    v_alertas := v_alertas || json_build_array(json_build_object('tipo','estoque','mensagem', v_rupturas || ' item(ns) sem estoque.'));
  end if;
  if v_criticos > 0 then
    v_alertas := v_alertas || json_build_array(json_build_object('tipo','estoque','mensagem', v_criticos || ' item(ns) em nível crítico (<=3).'));
  end if;
  if v_caixa_aberto and v_caixa_horas is not null and v_caixa_horas > 10 then
    v_alertas := v_alertas || json_build_array(json_build_object('tipo','caixa','mensagem','Caixa aberto há mais de 10h. Considere fechar.'));
  end if;

  -- Insight simples baseado em ticket médio
  if v_ticket_medio_hoje is not null then
    if v_ticket_var_pct is null then
      v_insight := 'Ticket médio hoje: R$ ' || to_char(v_ticket_medio_hoje, 'FM999G990D00');
    elsif v_ticket_var_pct >= 0 then
      v_insight := 'Ticket médio subiu ' || v_ticket_var_pct || '% vs ontem.';
    else
      v_insight := 'Ticket médio caiu ' || abs(v_ticket_var_pct) || '% vs ontem.';
    end if;
  end if;

  return json_build_object(
    'vendas', json_build_object(
      'totalHoje', v_vendas_total_hoje,
      'countHoje', v_vendas_count_hoje,
      'ticketMedioHoje', v_ticket_medio_hoje,
      'ticketMedioOntem', v_ticket_medio_ontem,
      'ticketMedioVarPct', v_ticket_var_pct
    ),
    'estoque', json_build_object(
      'criticos', v_criticos,
      'rupturas', v_rupturas,
      'saudePct', v_saude_estoque_pct
    ),
    'caixa', json_build_object(
      'aberto', v_caixa_aberto,
      'desde', v_caixa_aberto_desde,
      'horasAberto', v_caixa_horas,
      'ultimoFechamento', v_caixa_ultimo_fechamento
    ),
    'atividade', v_atividade,
    'alertas', v_alertas,
    'insight', v_insight
  );
end;
$$;

-- Permissões: permitir execução para usuários autenticados conforme políticas RLS padrões.
-- Exemplo (ajuste conforme necessidade):
-- grant execute on function public.dashboard_resumo() to authenticated;