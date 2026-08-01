-- Corrige lacuna da migration produtos_montaveis_pdv_2026_07_31: a RPC
-- criar_venda_completa (venda de balcão, online e replay offline) ainda
-- gravava vendas_itens sem a coluna modifiers, descartando o snapshot da
-- montagem antes de chegar ao banco. Este arquivo apenas amplia o insert de
-- vendas_itens; nenhuma outra regra da função muda.

begin;

create or replace function public.criar_venda_completa(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_venda_id bigint;
  v_numero_venda integer;
  v_caixa_provided integer;
  v_caixa_id integer;
  v_id_cliente uuid;
  v_client_sale_id text;
  v_item jsonb;
  v_pag jsonb;
  v_estoque jsonb;
  v_fiado jsonb;
  v_taxa jsonb;
  v_qtd integer;
  v_linha record;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_client_sale_id := nullif(p_payload->>'client_sale_id', '');
  if v_client_sale_id is not null then
    select id, numero_venda, id_caixa
      into v_venda_id, v_numero_venda, v_caixa_id
      from public.vendas
     where id_usuario = v_user_id
       and client_sale_id = v_client_sale_id
     limit 1;

    if found then
      return jsonb_build_object(
        'id', v_venda_id,
        'numero_venda', v_numero_venda,
        'id_caixa', v_caixa_id,
        'client_sale_id', v_client_sale_id,
        'idempotent', true
      );
    end if;
  end if;

  v_caixa_provided := nullif(p_payload->>'id_caixa','')::integer;
  if v_caixa_provided is not null then
    select id into v_caixa_id
    from public.caixas
    where id = v_caixa_provided
      and id_usuario = v_user_id
      and data_fechamento is null;
  end if;
  if v_caixa_id is null then
    select id into v_caixa_id
    from public.caixas
    where id_usuario = v_user_id
      and data_fechamento is null
    order by data_abertura desc
    limit 1;
  end if;

  v_id_cliente := nullif(p_payload->>'id_cliente','')::uuid;

  insert into public.vendas (
    id_usuario, id_caixa, id_cliente, client_sale_id, valor_total, forma_pagamento,
    valor_recebido, valor_troco, valor_desconto, desconto_tipo,
    tipo_pedido, taxa_entrega, created_at
  )
  values (
    v_user_id,
    v_caixa_id,
    v_id_cliente,
    v_client_sale_id,
    coalesce((p_payload->>'valor_total')::numeric, 0),
    coalesce(nullif(p_payload->>'forma_pagamento',''), 'dinheiro'),
    nullif(p_payload->>'valor_recebido','')::numeric,
    coalesce((p_payload->>'valor_troco')::numeric, 0),
    coalesce((p_payload->>'valor_desconto')::numeric, 0),
    nullif(p_payload->>'desconto_tipo',''),
    coalesce(nullif(p_payload->>'tipo_pedido',''), 'retirada'),
    coalesce((p_payload->>'taxa_entrega')::numeric, 0),
    coalesce((p_payload->>'created_at')::timestamptz, now())
  )
  returning id, numero_venda into v_venda_id, v_numero_venda;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'itens','[]'::jsonb))
  loop
    insert into public.vendas_itens (
      id_usuario, id_venda, id_produto, quantidade,
      nome_produto_na_venda, preco_unitario_na_venda, modifiers
    )
    values (
      v_user_id,
      v_venda_id,
      nullif(v_item->>'id_produto','')::integer,
      coalesce((v_item->>'quantidade')::integer, 1),
      coalesce(v_item->>'nome_produto_na_venda', v_item->>'nome', ''),
      coalesce(
        (v_item->>'preco_unitario_na_venda')::numeric,
        (v_item->>'preco')::numeric,
        0
      ),
      coalesce(v_item->'modifiers', '[]'::jsonb)
    );
  end loop;

  for v_pag in select * from jsonb_array_elements(coalesce(p_payload->'pagamentos','[]'::jsonb))
  loop
    if coalesce((v_pag->>'valor')::numeric, 0) > 0 then
      insert into public.vendas_pagamentos (
        id_venda, id_usuario, forma_pagamento, valor
      )
      values (
        v_venda_id,
        v_user_id,
        coalesce(nullif(v_pag->>'forma_pagamento',''), nullif(v_pag->>'forma',''), ''),
        coalesce((v_pag->>'valor')::numeric, 0)
      );
    end if;
  end loop;

  create temporary table if not exists pg_temp.zelo_estoque_venda_tmp (
    id_produto integer,
    quantidade integer
  ) on commit drop;
  truncate table pg_temp.zelo_estoque_venda_tmp;

  for v_estoque in select * from jsonb_array_elements(coalesce(p_payload->'estoque','[]'::jsonb))
  loop
    v_qtd := coalesce((v_estoque->>'quantidade')::integer, 0);
    if v_qtd > 0 then
      insert into pg_temp.zelo_estoque_venda_tmp (id_produto, quantidade)
      values ((v_estoque->>'id_produto')::integer, v_qtd);
    end if;
  end loop;

  for v_linha in
    select c.id as id_categoria,
           c.nome as nome_categoria,
           coalesce(c.estoque_compartilhado_atual, 0) as estoque_atual,
           sum(t.quantidade)::integer as qtd
      from pg_temp.zelo_estoque_venda_tmp t
      join public.produtos p on p.id = t.id_produto and p.id_usuario = v_user_id
      join public.categorias c on c.id = p.id_categoria and c.id_usuario = v_user_id
     where coalesce(c.controlar_estoque_compartilhado, false) = true
     group by c.id, c.nome, c.estoque_compartilhado_atual
  loop
    update public.categorias
       set estoque_compartilhado_atual = coalesce(estoque_compartilhado_atual, 0) - v_linha.qtd
     where id = v_linha.id_categoria
       and id_usuario = v_user_id
       and coalesce(controlar_estoque_compartilhado, false) = true
       and coalesce(estoque_compartilhado_atual, 0) >= v_linha.qtd;

    if not found then
      raise exception 'Estoque insuficiente para "%". Disponivel: %, pedido: %',
        v_linha.nome_categoria,
        v_linha.estoque_atual,
        v_linha.qtd;
    end if;
  end loop;

  for v_linha in
    select p.id as id_produto,
           p.nome,
           coalesce(p.estoque_atual, 0) as estoque_atual,
           sum(t.quantidade)::integer as qtd
      from pg_temp.zelo_estoque_venda_tmp t
      join public.produtos p on p.id = t.id_produto and p.id_usuario = v_user_id
      left join public.categorias c on c.id = p.id_categoria and c.id_usuario = v_user_id
     where coalesce(c.controlar_estoque_compartilhado, false) = false
       and coalesce(p.controlar_estoque, false) = true
     group by p.id, p.nome, p.estoque_atual
  loop
    update public.produtos
       set estoque_atual = coalesce(estoque_atual, 0) - v_linha.qtd
     where id = v_linha.id_produto
       and id_usuario = v_user_id
       and coalesce(controlar_estoque, false) = true
       and coalesce(estoque_atual, 0) >= v_linha.qtd;

    if not found then
      raise exception 'Estoque insuficiente para "%". Disponivel: %, pedido: %',
        v_linha.nome,
        v_linha.estoque_atual,
        v_linha.qtd;
    end if;
  end loop;

  for v_fiado in select * from jsonb_array_elements(coalesce(p_payload->'fiados','[]'::jsonb))
  loop
    if coalesce((v_fiado->>'valor')::numeric, 0) > 0 then
      update public.pessoas
      set saldo_fiado = coalesce(saldo_fiado, 0) + (v_fiado->>'valor')::numeric
      where id = (v_fiado->>'id_pessoa')::uuid
        and id_usuario = v_user_id;
    end if;
  end loop;

  for v_taxa in select * from jsonb_array_elements(coalesce(p_payload->'taxas_plataforma','[]'::jsonb))
  loop
    if coalesce((v_taxa->>'valor_taxa')::numeric, 0) > 0 then
      insert into public.vendas_taxas_plataforma (
        id_venda, id_usuario, plataforma_id, plataforma_nome,
        taxa_pct, valor_bruto, valor_taxa
      )
      values (
        v_venda_id,
        v_user_id,
        coalesce(v_taxa->>'plataforma_id', ''),
        coalesce(v_taxa->>'plataforma_nome', v_taxa->>'plataforma_id', ''),
        coalesce((v_taxa->>'taxa_pct')::numeric, 0),
        coalesce((v_taxa->>'valor_bruto')::numeric, 0),
        coalesce((v_taxa->>'valor_taxa')::numeric, 0)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_venda_id,
    'numero_venda', v_numero_venda,
    'id_caixa', v_caixa_id,
    'client_sale_id', v_client_sale_id,
    'idempotent', false
  );
end;
$function$;

commit;
