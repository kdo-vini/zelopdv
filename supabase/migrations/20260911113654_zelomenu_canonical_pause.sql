-- supabase/migrations/20260911120000_zelomenu_canonical_pause.sql
--
-- Pausa canônica do cardápio digital.
--
-- Problema: o mesmo item existia com dois interruptores independentes. Um
-- produto avulso pausava em `zelomenu_product_publications.pausado_manualmente`;
-- o mesmo item, oferecido como adicional, continuava saindo porque
-- `zelomenu_modifier_options.ativo` é uma flag separada, editada em outra tela.
-- O lojista pausava uma forma do produto e a outra seguia vendendo.
--
-- Modelo: `zelomenu_modifier_option_products` já garante
-- `num_nonnulls(id_produto, id_componente) = 1`, ou seja, toda opção vinculada
-- aponta para exatamente um destino. Esse destino é a identidade canônica:
--
--   opção --> produto     => pausa mora em zelomenu_product_publications
--   opção --> componente  => pausa mora em zelomenu_modifier_components
--
-- `zelomenu_modifier_options.ativo` passa a ser estrutural ("esta opção existe
-- neste grupo"), nunca disponibilidade. Com isso, pausar o produto pausa
-- automaticamente todas as aparições dele como adicional, porque todas resolvem
-- para a mesma linha de publicação.
--
-- Fronteira preservada: pausar no cardápio nunca toca `produtos.ocultar_no_pdv`.
-- `visivel_online = false` continua significando "só complemento", não "pausado".

-- Resolve o destino canônico de uma opção.
create or replace function public.zelomenu_option_destination(
  p_opcao uuid,
  p_owner uuid
)
returns table (kind text, produto_id bigint, componente_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case when op.id_produto is not null then 'produto' else 'componente' end,
    op.id_produto,
    op.id_componente
  from public.zelomenu_modifier_option_products op
  where op.id_opcao = p_opcao
    and op.id_usuario = p_owner;
$$;

-- Disponibilidade efetiva por opção, numa fonte só.
-- `security_invoker` mantém o RLS das tabelas de origem valendo para quem lê.
create or replace view public.zelomenu_option_availability
with (security_invoker = true)
as
select
  o.id                                as opcao_id,
  o.id_usuario,
  g.id                                as grupo_id,
  g.id_produto                        as grupo_produto_id,
  o.nome                              as opcao_nome,
  o.ordem                             as opcao_ordem,
  case when op.id_produto is not null then 'produto'
       when op.id_componente is not null then 'componente'
       else 'livre' end               as destino_kind,
  op.id_produto                       as destino_produto_id,
  op.id_componente                    as destino_componente_id,
  coalesce(p.nome, c.nome, o.nome)    as nome_canonico,
  o.ativo                             as opcao_ativa,
  g.ativo                             as grupo_ativo,
  coalesce(pub.pausado_manualmente, c.pausado_manualmente, false) as destino_pausado,
  -- Uma opção só aparece pro cliente quando a estrutura existe E o destino
  -- canônico não está pausado.
  (o.ativo and g.ativo
   and not coalesce(pub.pausado_manualmente, c.pausado_manualmente, false))    as disponivel
from public.zelomenu_modifier_options o
join public.zelomenu_modifier_groups g
  on g.id = o.id_grupo and g.id_usuario = o.id_usuario
left join public.zelomenu_modifier_option_products op
  on op.id_opcao = o.id and op.id_usuario = o.id_usuario
left join public.produtos p
  on p.id = op.id_produto and p.id_usuario = o.id_usuario
left join public.zelomenu_product_publications pub
  on pub.id_produto = op.id_produto and pub.id_usuario = o.id_usuario
left join public.zelomenu_modifier_components c
  on c.id = op.id_componente and c.id_usuario = o.id_usuario;

comment on view public.zelomenu_option_availability is
  'Disponibilidade efetiva de cada opção de modificador, resolvida pelo destino canônico (produto ou componente). Leia daqui em vez de checar zelomenu_modifier_options.ativo isolado.';

-- Setter canônico. Recebe o destino, não a opção: pausar é sempre um ato sobre
-- a identidade do item, nunca sobre uma aparição específica dele.
create or replace function public.zelomenu_set_menu_pause(
  p_pausado boolean,
  p_produto_id bigint default null,
  p_componente_id uuid default null,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_nome text;
  v_anterior boolean;
  v_atual boolean;
  v_visivel boolean;
  v_afetadas integer := 0;
begin
  if p_pausado is null then
    raise exception using errcode = '22023', message = 'PAUSADO_INVALIDO';
  end if;
  if num_nonnulls(p_produto_id, p_componente_id) <> 1 then
    raise exception using errcode = '22023', message = 'DESTINO_INVALIDO';
  end if;

  if p_produto_id is not null then
    select nome into v_nome
      from public.produtos
     where id = p_produto_id and id_usuario = v_owner;
    if not found then
      raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_ENCONTRADO';
    end if;

    select pausado_manualmente, visivel_online into v_anterior, v_visivel
      from public.zelomenu_product_publications
     where id_usuario = v_owner and id_produto = p_produto_id
     for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'PRODUTO_NAO_PUBLICADO';
    end if;

    update public.zelomenu_product_publications
       set pausado_manualmente = p_pausado,
           updated_at = now()
     where id_usuario = v_owner and id_produto = p_produto_id
     returning pausado_manualmente into v_atual;
  else
    select nome, pausado_manualmente into v_nome, v_anterior
      from public.zelomenu_modifier_components
     where id = p_componente_id and id_usuario = v_owner
     for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'COMPONENTE_NAO_ENCONTRADO';
    end if;

    update public.zelomenu_modifier_components
       set pausado_manualmente = p_pausado,
           updated_at = now()
     where id = p_componente_id and id_usuario = v_owner
     returning pausado_manualmente into v_atual;
  end if;

  -- Quantas aparições como opção seguem esse destino. Serve pra UI dizer
  -- "pausado aqui e em mais N adicionais" em vez de fingir que é local.
  select count(*) into v_afetadas
    from public.zelomenu_modifier_option_products op
   where op.id_usuario = v_owner
     and ((p_produto_id is not null and op.id_produto = p_produto_id)
       or (p_componente_id is not null and op.id_componente = p_componente_id));

  return jsonb_build_object(
    'kind', case when p_produto_id is not null then 'produto' else 'componente' end,
    'produto_id', p_produto_id,
    'componente_id', p_componente_id,
    'nome', v_nome,
    'pausado_anterior', v_anterior,
    'pausado_manualmente', v_atual,
    'visivel_online', v_visivel,
    'opcoes_afetadas', v_afetadas
  );
end;
$$;

-- Atalho pra UI: pausa a partir de uma opção, resolvendo o destino canônico.
-- Pausar o adicional "Coca-Cola Zero 2 L" pausa o produto, e portanto também o
-- avulso e todos os outros adicionais que apontam pra ele.
create or replace function public.zelomenu_set_menu_pause_by_option(
  p_opcao uuid,
  p_pausado boolean,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.gerente_resolve_owner(p_owner);
  v_produto bigint;
  v_componente uuid;
begin
  select op.id_produto, op.id_componente into v_produto, v_componente
    from public.zelomenu_modifier_option_products op
   where op.id_opcao = p_opcao and op.id_usuario = v_owner;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPCAO_SEM_DESTINO';
  end if;

  return public.zelomenu_set_menu_pause(p_pausado, v_produto, v_componente, v_owner);
end;
$$;

-- O Zelinho Gerente mantém a assinatura antiga, mas agora passa pelo caminho
-- canônico e também alcança adicionais ancorados em componente.
create or replace function public.gerente_set_menu_pause(
  p_produto_id bigint,
  p_pausado boolean,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.zelomenu_set_menu_pause(p_pausado, p_produto_id, null, p_owner);
end;
$$;

revoke all on function public.zelomenu_option_destination(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zelomenu_option_destination(uuid, uuid) to service_role;

revoke all on function public.zelomenu_set_menu_pause(boolean, bigint, uuid, uuid) from public, anon;
grant execute on function public.zelomenu_set_menu_pause(boolean, bigint, uuid, uuid) to authenticated, service_role;

revoke all on function public.zelomenu_set_menu_pause_by_option(uuid, boolean, uuid) from public, anon;
grant execute on function public.zelomenu_set_menu_pause_by_option(uuid, boolean, uuid) to authenticated, service_role;

revoke all on function public.gerente_set_menu_pause(bigint, boolean, uuid) from public, anon;
grant execute on function public.gerente_set_menu_pause(bigint, boolean, uuid) to authenticated, service_role;

grant select on public.zelomenu_option_availability to authenticated, service_role;
