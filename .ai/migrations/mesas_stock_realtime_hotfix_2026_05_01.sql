-- Hotfix: reserve/release stock in table tabs as items are changed.
-- Applied to Supabase project xnnjyrblpvsqrtsshawa on 2026-05-01.

begin;

alter table public.comanda_itens
  add column if not exists estoque_baixado boolean not null default false;

drop function if exists public.decrementar_estoque(uuid, integer);

create or replace function public.decrementar_estoque(p_id integer, p_qtd integer)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Quantidade invalida para baixa de estoque';
  end if;

  update public.produtos
     set estoque_atual = coalesce(estoque_atual, 0) - p_qtd
   where id = p_id
     and id_usuario = auth.uid()
     and controlar_estoque = true
     and coalesce(estoque_atual, 0) >= p_qtd;

  if not found then
    raise exception 'Estoque insuficiente ou controle desativado para produto id=%', p_id;
  end if;
end;
$$;

create or replace function public.comanda_aplicar_delta_item(
  p_id_comanda uuid,
  p_id_produto integer,
  p_delta integer
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_comanda record;
  v_produto record;
  v_item record;
  v_qtd_atual integer;
  v_qtd_delta integer;
  v_qtd_reservar integer;
  v_qtd_devolver integer;
  v_baixar_estoque boolean;
begin
  if v_usuario is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_delta is null or p_delta = 0 then
    return;
  end if;

  select id, id_usuario
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and id_usuario = v_usuario
     and status = 'aberta'
   for update;

  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;

  select id, nome, preco, controlar_estoque, coalesce(estoque_atual, 0) as estoque_atual
    into v_produto
    from public.produtos
   where id = p_id_produto
     and id_usuario = v_usuario
   for update;

  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  select *
    into v_item
    from public.comanda_itens
   where id_comanda = p_id_comanda
     and id_produto = p_id_produto
   for update;

  if p_delta > 0 then
    v_qtd_delta := p_delta;
    v_qtd_reservar := v_qtd_delta;
    v_baixar_estoque := coalesce(v_produto.controlar_estoque, false)
      or coalesce(v_item.estoque_baixado, false);

    if v_baixar_estoque and v_item.id is not null and coalesce(v_item.estoque_baixado, false) = false then
      v_qtd_atual := greatest(1, round(coalesce(v_item.quantidade, 0))::integer);
      v_qtd_reservar := v_qtd_reservar + v_qtd_atual;
    end if;

    if v_baixar_estoque then
      update public.produtos
         set estoque_atual = coalesce(estoque_atual, 0) - v_qtd_reservar
       where id = p_id_produto
         and id_usuario = v_usuario
         and coalesce(estoque_atual, 0) >= v_qtd_reservar;

      if not found then
        raise exception 'Estoque insuficiente para "%". Disponivel: %, pedido: %',
          v_produto.nome,
          v_produto.estoque_atual,
          v_qtd_reservar;
      end if;
    end if;

    if v_item.id is null then
      insert into public.comanda_itens (
        id_comanda,
        id_produto,
        quantidade,
        preco_unitario,
        estoque_baixado
      ) values (
        p_id_comanda,
        p_id_produto,
        v_qtd_delta,
        v_produto.preco,
        v_baixar_estoque
      );
    else
      update public.comanda_itens
         set quantidade = greatest(1, round(coalesce(quantidade, 0))::integer) + v_qtd_delta,
             estoque_baixado = estoque_baixado or v_baixar_estoque
       where id = v_item.id;
    end if;

    return;
  end if;

  if v_item.id is null then
    raise exception 'Item nao encontrado na comanda';
  end if;

  v_qtd_atual := greatest(0, round(coalesce(v_item.quantidade, 0))::integer);
  v_qtd_delta := abs(p_delta);
  v_qtd_devolver := least(v_qtd_delta, v_qtd_atual);

  if v_qtd_devolver <= 0 then
    return;
  end if;

  if coalesce(v_item.estoque_baixado, false) then
    update public.produtos
       set estoque_atual = coalesce(estoque_atual, 0) + v_qtd_devolver
     where id = p_id_produto
       and id_usuario = v_usuario;
  end if;

  if v_qtd_atual - v_qtd_devolver <= 0 then
    delete from public.comanda_itens where id = v_item.id;
  else
    update public.comanda_itens
       set quantidade = v_qtd_atual - v_qtd_devolver
     where id = v_item.id;
  end if;
end;
$$;

create or replace function public.comanda_cancelar_com_estoque(p_id_comanda uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_comanda record;
  v_linha record;
begin
  if v_usuario is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select id, id_mesa
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and id_usuario = v_usuario
     and status = 'aberta'
   for update;

  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;

  for v_linha in
    select ci.id_produto,
           sum(greatest(1, round(coalesce(ci.quantidade, 0))::integer))::integer as qtd
      from public.comanda_itens ci
      join public.produtos p on p.id = ci.id_produto and p.id_usuario = v_usuario
     where ci.id_comanda = p_id_comanda
       and coalesce(ci.estoque_baixado, false) = true
     group by ci.id_produto
  loop
    update public.produtos
       set estoque_atual = coalesce(estoque_atual, 0) + v_linha.qtd
     where id = v_linha.id_produto
       and id_usuario = v_usuario;
  end loop;

  update public.comanda_itens
     set estoque_baixado = false
   where id_comanda = p_id_comanda
     and coalesce(estoque_baixado, false) = true;

  update public.comandas
     set status = 'cancelada',
         fechada_em = now()
   where id = p_id_comanda
     and id_usuario = v_usuario;

  update public.mesas
     set status = 'livre'
   where id = v_comanda.id_mesa
     and id_usuario = v_usuario;
end;
$$;

create or replace function public.comanda_garantir_estoque_baixado(p_id_comanda uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_comanda record;
  v_linha record;
begin
  if v_usuario is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select id
    into v_comanda
    from public.comandas
   where id = p_id_comanda
     and id_usuario = v_usuario
     and status = 'aberta'
   for update;

  if not found then
    raise exception 'Comanda aberta nao encontrada';
  end if;

  for v_linha in
    select ci.id_produto,
           p.nome,
           p.estoque_atual,
           sum(greatest(1, round(coalesce(ci.quantidade, 0))::integer))::integer as qtd
      from public.comanda_itens ci
      join public.produtos p on p.id = ci.id_produto and p.id_usuario = v_usuario
     where ci.id_comanda = p_id_comanda
       and coalesce(ci.estoque_baixado, false) = false
       and coalesce(p.controlar_estoque, false) = true
     group by ci.id_produto, p.nome, p.estoque_atual
  loop
    update public.produtos
       set estoque_atual = coalesce(estoque_atual, 0) - v_linha.qtd
     where id = v_linha.id_produto
       and id_usuario = v_usuario
       and coalesce(estoque_atual, 0) >= v_linha.qtd;

    if not found then
      raise exception 'Estoque insuficiente para "%". Disponivel: %, pedido: %',
        v_linha.nome,
        coalesce(v_linha.estoque_atual, 0),
        v_linha.qtd;
    end if;
  end loop;

  update public.comanda_itens ci
     set estoque_baixado = true
    from public.produtos p
   where ci.id_comanda = p_id_comanda
     and ci.id_produto = p.id
     and p.id_usuario = v_usuario
     and coalesce(ci.estoque_baixado, false) = false
     and coalesce(p.controlar_estoque, false) = true;
end;
$$;

revoke execute on function public.decrementar_estoque(integer, integer) from anon;
revoke execute on function public.comanda_aplicar_delta_item(uuid, integer, integer) from anon;
revoke execute on function public.comanda_cancelar_com_estoque(uuid) from anon;
revoke execute on function public.comanda_garantir_estoque_baixado(uuid) from anon;

grant execute on function public.decrementar_estoque(integer, integer) to authenticated;
grant execute on function public.comanda_aplicar_delta_item(uuid, integer, integer) to authenticated;
grant execute on function public.comanda_cancelar_com_estoque(uuid) to authenticated;
grant execute on function public.comanda_garantir_estoque_baixado(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
