-- Carga operacional idempotente para Mix Guaraná.
-- Aplicar com: supabase db query --linked --file <este arquivo>
--
-- O produto principal fica visível no PDV e no ZeloMenu.
-- Os produtos-componentes continuam reais para preço/estoque, mas ficam
-- ocultos do PDV e explicitamente não publicados no ZeloMenu.

begin;

create temporary table _mix_guarana_groups (
  nome text primary key,
  id uuid not null
) on commit drop;

create temporary table _mix_guarana_product_map (
  chave text primary key,
  id_produto bigint not null
) on commit drop;

do $$
declare
  v_user_id uuid := '39192d38-507c-443c-b075-85998abde740';
  v_categoria_guarana bigint;
  v_categoria_coberturas bigint;
  v_categoria_adicionais bigint;
  v_categoria_confeitos bigint;
  v_base_id bigint;
  v_500_id bigint;
  v_produto_id bigint;
  v_grupo_id uuid;
  v_opcao_id uuid;
  v_nome text;
  v_count integer;
  v_i integer;
  v_coverages text[] := array[
    'Abacaxi', 'Açaí', 'Amendoim', 'Amora', 'Café', 'Caramelo', 'Cereja',
    'Chocolate', 'Doce de Leite', 'Frutas Vermelhas', 'Guaraná', 'Kiwi',
    'Leite de Coco', 'Leite Condensado', 'Limão', 'Maracujá', 'Mel',
    'Menta', 'Morango', 'Tutti Frutti', 'Uva', 'Azedinha', 'Blue Ice',
    'Chiclete', 'Chiclete Azul', 'Fini Banana', 'Fini Beijos', 'Fini Dentaduras'
  ];
  v_traditional text[] := array[
    'Choco Power Ball', 'Coloreti', 'Ovomaltine', 'Jujuba', 'Amendoim', 'Flocos'
  ];
  v_fini text[] := array[
    'Fini Banana', 'Fini Beijos', 'Fini Dentaduras', 'Fini Minhocas'
  ];
  v_group_names text[] := array[
    'Tamanho',
    'Abacate',
    'Coberturas ou confeitos incluídos (até 2)',
    'Coberturas ou confeitos extras (+R$ 1 cada)',
    'Confeitos Fini (+R$ 2 cada)'
  ];
begin
  select count(*), max(id) into v_count, v_categoria_guarana
    from public.categorias
   where id_usuario = v_user_id and lower(trim(nome)) = lower('Guaraná');
  if v_count <> 1 then
    raise exception 'Categoria Guaraná ambígua ou ausente para Mix Guaraná: %', v_count;
  end if;

  select count(*), max(id) into v_count, v_categoria_coberturas
    from public.categorias
   where id_usuario = v_user_id and lower(trim(nome)) = lower('Coberturas');
  if v_count <> 1 then
    raise exception 'Categoria Coberturas ambígua ou ausente para Mix Guaraná: %', v_count;
  end if;

  select count(*), max(id) into v_count, v_categoria_adicionais
    from public.categorias
   where id_usuario = v_user_id and lower(trim(nome)) = lower('Adicionais');
  if v_count <> 1 then
    raise exception 'Categoria Adicionais ambígua ou ausente para Mix Guaraná: %', v_count;
  end if;

  select count(*), max(id) into v_count, v_categoria_confeitos
    from public.categorias
   where id_usuario = v_user_id and lower(trim(nome)) = lower('Confeitos');
  if v_count <> 1 then
    raise exception 'Categoria Confeitos ambígua ou ausente para Mix Guaraná: %', v_count;
  end if;

  -- Normaliza os nomes já existentes, sem tocar em preço ou saldo.
  update public.produtos
     set nome = trim(nome)
   where id_usuario = v_user_id;

  update public.produtos
     set nome = 'Amendoim'
   where id_usuario = v_user_id and id = 993;

  update public.produtos
     set nome = 'Uva'
   where id_usuario = v_user_id and id = 1011;

  update public.produtos
     set nome = 'Fini Dentaduras'
   where id_usuario = v_user_id and id in (1002, 1016);

  update public.produtos
     set nome = 'Fini Minhocas'
   where id_usuario = v_user_id and id = 1017;

  -- Cria os componentes ausentes da arte, sem ativar controle de estoque.
  insert into public.produtos (
    id_usuario, id_categoria, nome, preco, controlar_estoque, estoque_atual, ocultar_no_pdv
  )
  select v_user_id, v_categoria_guarana, 'Guaraná 500ml', 15.00, false, 0, true
   where not exists (
     select 1 from public.produtos
      where id_usuario = v_user_id and lower(trim(nome)) = lower('Guaraná 500ml')
   );

  insert into public.produtos (
    id_usuario, id_categoria, nome, preco, controlar_estoque, estoque_atual, ocultar_no_pdv
  )
  select v_user_id, v_categoria_coberturas, item.nome, 0.00, false, 0, true
    from unnest(array['Mel', 'Azedinha', 'Chiclete Azul']::text[]) item(nome)
   where not exists (
     select 1 from public.produtos p
      where p.id_usuario = v_user_id
        and p.id_categoria = v_categoria_coberturas
        and lower(trim(p.nome)) = lower(item.nome)
   );

  -- O produto-base é a única entrada vendável no PDV/cardápio.
  insert into public.produtos (
    id_usuario, id_categoria, nome, preco, controlar_estoque, estoque_atual, ocultar_no_pdv
  )
  select v_user_id, v_categoria_guarana, 'Guaraná da Amazônia', 8.00, false, 0, false
   where not exists (
     select 1 from public.produtos
      where id_usuario = v_user_id and lower(trim(nome)) = lower('Guaraná da Amazônia')
   );

  select count(*), max(id) into v_count, v_base_id
    from public.produtos
   where id_usuario = v_user_id and lower(trim(nome)) = lower('Guaraná da Amazônia');
  if v_count <> 1 then
    raise exception 'Produto-base Guaraná da Amazônia ambíguo após carga: %', v_count;
  end if;

  update public.produtos
     set id_categoria = v_categoria_guarana,
         preco = 8.00,
         ocultar_no_pdv = false
   where id = v_base_id and id_usuario = v_user_id;

  select count(*), max(id) into v_count, v_500_id
    from public.produtos
   where id_usuario = v_user_id and lower(trim(nome)) = lower('Guaraná 500ml');
  if v_count <> 1 then
    raise exception 'Produto Guaraná 500ml ambíguo após carga: %', v_count;
  end if;

  update public.produtos
     set id_categoria = v_categoria_guarana,
         preco = 15.00,
         ocultar_no_pdv = true
   where id = v_500_id and id_usuario = v_user_id;

  -- Esconde componentes do PDV, mas preserva os produtos para vínculos e estoque.
  update public.produtos
     set ocultar_no_pdv = true
   where id_usuario = v_user_id
     and (
       id_categoria in (v_categoria_coberturas, v_categoria_adicionais, v_categoria_confeitos)
       or id in (
         select id from public.produtos
          where id_usuario = v_user_id
            and lower(trim(nome)) in (
              lower('Guaraná 300ml'), lower('Guaraná 400ml'), lower('Guaraná 500ml'), lower('Guaraná 700ml')
            )
       )
     );

  update public.produtos
     set ocultar_no_pdv = false
   where id = v_base_id and id_usuario = v_user_id;

  -- Publicação é independente do PDV: só o produto-base entra no cardápio.
  insert into public.zelomenu_product_publications (
    id_usuario, id_produto, visivel_online, pausado_manualmente, ordem
  ) values (v_user_id, v_base_id, true, false, 0)
  on conflict (id_usuario, id_produto) do update
    set visivel_online = true,
        pausado_manualmente = false,
        updated_at = now();

  insert into public.zelomenu_product_publications (
    id_usuario, id_produto, visivel_online, pausado_manualmente, ordem
  )
  select v_user_id, p.id, false, false, 0
    from public.produtos p
   where p.id_usuario = v_user_id
     and p.id <> v_base_id
     and (
       p.id_categoria in (v_categoria_coberturas, v_categoria_adicionais, v_categoria_confeitos)
       or lower(trim(p.nome)) in (
         lower('Guaraná 300ml'), lower('Guaraná 400ml'), lower('Guaraná 500ml'), lower('Guaraná 700ml')
       )
     )
  on conflict (id_usuario, id_produto) do update
    set visivel_online = false,
        pausado_manualmente = false,
        updated_at = now();

  if (select count(*) from public.produtos
       where id_usuario = v_user_id
         and lower(trim(nome)) in (
           lower('Guaraná 300ml'), lower('Guaraná 400ml'), lower('Guaraná 500ml'), lower('Guaraná 700ml')
         )
         and ocultar_no_pdv = true) <> 4
     or (select count(*) from public.zelomenu_product_publications pub
           join public.produtos p on p.id = pub.id_produto and p.id_usuario = pub.id_usuario
          where pub.id_usuario = v_user_id
            and lower(trim(p.nome)) in (
              lower('Guaraná 300ml'), lower('Guaraná 400ml'), lower('Guaraná 500ml'), lower('Guaraná 700ml')
            )
            and pub.visivel_online = false) <> 4 then
    raise exception 'Verificação interna falhou: tamanhos-componentes ainda expostos';
  end if;

  -- Resolve produtos reais para cada opção. Se algum estiver ausente, aborta.
  insert into _mix_guarana_product_map (chave, id_produto)
  select 'cobertura:' || item.nome, p.id
    from unnest(v_coverages) item(nome)
    join public.produtos p
      on p.id_usuario = v_user_id
     and p.id_categoria = v_categoria_coberturas
     and lower(trim(p.nome)) = lower(item.nome);

  insert into _mix_guarana_product_map (chave, id_produto)
  select 'tradicional:' || item.nome, p.id
    from unnest(v_traditional) item(nome)
    join public.produtos p
      on p.id_usuario = v_user_id
     and p.id_categoria = v_categoria_confeitos
     and lower(trim(p.nome)) = lower(item.nome);

  insert into _mix_guarana_product_map (chave, id_produto)
  select 'fini:' || item.nome, p.id
    from unnest(v_fini) item(nome)
    join public.produtos p
      on p.id_usuario = v_user_id
     and p.id_categoria = v_categoria_adicionais
     and lower(trim(p.nome)) = lower(item.nome);

  insert into _mix_guarana_product_map (chave, id_produto)
  select * from (values
    ('tamanho:300 ml', (select id from public.produtos where id_usuario=v_user_id and lower(trim(nome))=lower('Guaraná 300ml'))),
    ('tamanho:400 ml', (select id from public.produtos where id_usuario=v_user_id and lower(trim(nome))=lower('Guaraná 400ml'))),
    ('tamanho:500 ml', v_500_id),
    ('tamanho:700 ml', (select id from public.produtos where id_usuario=v_user_id and lower(trim(nome))=lower('Guaraná 700ml')))
  ) as tamanho(chave, id_produto);

  if (select count(*) from _mix_guarana_product_map where chave like 'cobertura:%') <> cardinality(v_coverages)
     or (select count(*) from _mix_guarana_product_map where chave like 'tradicional:%') <> cardinality(v_traditional)
     or (select count(*) from _mix_guarana_product_map where chave like 'fini:%') <> cardinality(v_fini)
     or (select count(*) from _mix_guarana_product_map where chave like 'tamanho:%') <> 4 then
    raise exception 'Mapa de produtos-componentes incompleto para Mix Guaraná';
  end if;

  -- Recria somente os grupos desta montagem, tornando a carga repetível.
  delete from public.zelomenu_modifier_groups
   where id_usuario = v_user_id
     and id_produto = v_base_id
     and (
       nome = any(v_group_names)
       or nome = any(array[
         'Coberturas incluídas (até 2)',
         'Coberturas extras (+R$ 1 cada)',
         'Confeitos tradicionais incluídos (até 2)',
         'Confeitos tradicionais extras (+R$ 1 cada)'
       ])
     );

  insert into public.zelomenu_modifier_groups (
    id_usuario, id_produto, nome, tipo, modo_preco, min_selecoes, max_selecoes,
    permite_quantidade, maximo_por_opcao, ativo, ordem
  ) values
    (v_user_id, v_base_id, 'Tamanho', 'variacao', 'substituir', 1, 1, false, null, true, 1),
    (v_user_id, v_base_id, 'Abacate', 'adicional', 'somar', 1, 1, false, null, true, 2),
    (v_user_id, v_base_id, 'Coberturas ou confeitos incluídos (até 2)', 'adicional', 'somar', 0, 2, false, null, true, 3),
    (v_user_id, v_base_id, 'Coberturas ou confeitos extras (+R$ 1 cada)', 'adicional', 'somar', 0, null, true, null, true, 4),
    (v_user_id, v_base_id, 'Confeitos Fini (+R$ 2 cada)', 'adicional', 'somar', 0, null, true, null, true, 5);

  insert into _mix_guarana_groups (nome, id)
  select nome, id
    from public.zelomenu_modifier_groups
   where id_usuario = v_user_id and id_produto = v_base_id and nome = any(v_group_names);

  -- Tamanhos: preço final substituto, mas com vínculo para estoque/identidade.
  v_grupo_id := (select id from _mix_guarana_groups where nome = 'Tamanho');
  for v_i in 1..4 loop
    v_nome := (array['300 ml', '400 ml', '500 ml', '700 ml'])[v_i];
    v_produto_id := (select id_produto from _mix_guarana_product_map where chave = 'tamanho:' || v_nome);
    insert into public.zelomenu_modifier_options (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
    values (v_user_id, v_grupo_id, v_nome, (array[8.00, 12.00, 15.00, 22.00]::numeric[])[v_i], true, v_i)
    returning id into v_opcao_id;
    insert into public.zelomenu_modifier_option_products (id_opcao, id_usuario, id_produto, price_override)
    values (v_opcao_id, v_user_id, v_produto_id, (array[8.00, 12.00, 15.00, 22.00]::numeric[])[v_i]);
  end loop;

  -- Abacate é uma escolha textual, sem estoque próprio.
  v_grupo_id := (select id from _mix_guarana_groups where nome = 'Abacate');
  insert into public.zelomenu_modifier_options (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
  values
    (v_user_id, v_grupo_id, 'Com abacate', 0.00, true, 1),
    (v_user_id, v_grupo_id, 'Sem abacate', 0.00, true, 2);

  -- A regra da arte é combinada: até duas coberturas OU confeitos tradicionais.
  -- Um único grupo é necessário para impedir 2 + 2 entre as duas listas.
  v_grupo_id := (select id from _mix_guarana_groups where nome = 'Coberturas ou confeitos incluídos (até 2)');
  for v_i in 1..cardinality(v_coverages) loop
    v_nome := v_coverages[v_i];
    v_produto_id := (select id_produto from _mix_guarana_product_map where chave = 'cobertura:' || v_nome);
    insert into public.zelomenu_modifier_options (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
    values (v_user_id, v_grupo_id, v_nome, 0.00, true, v_i)
    returning id into v_opcao_id;
    insert into public.zelomenu_modifier_option_products (id_opcao, id_usuario, id_produto, price_override)
    values (v_opcao_id, v_user_id, v_produto_id, 0.00);
  end loop;

  for v_i in 1..cardinality(v_traditional) loop
    v_nome := v_traditional[v_i];
    v_produto_id := (select id_produto from _mix_guarana_product_map where chave = 'tradicional:' || v_nome);
    insert into public.zelomenu_modifier_options (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
    values (v_user_id, v_grupo_id, v_nome, 0.00, true, cardinality(v_coverages) + v_i)
    returning id into v_opcao_id;
    insert into public.zelomenu_modifier_option_products (id_opcao, id_usuario, id_produto, price_override)
    values (v_opcao_id, v_user_id, v_produto_id, 0.00);
  end loop;

  -- As mesmas opções podem ser adicionadas por R$ 1 cada.
  v_grupo_id := (select id from _mix_guarana_groups where nome = 'Coberturas ou confeitos extras (+R$ 1 cada)');
  for v_i in 1..cardinality(v_coverages) loop
    v_nome := v_coverages[v_i];
    v_produto_id := (select id_produto from _mix_guarana_product_map where chave = 'cobertura:' || v_nome);
    insert into public.zelomenu_modifier_options (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
    values (v_user_id, v_grupo_id, v_nome, 1.00, true, v_i)
    returning id into v_opcao_id;
    insert into public.zelomenu_modifier_option_products (id_opcao, id_usuario, id_produto, price_override)
    values (v_opcao_id, v_user_id, v_produto_id, 1.00);
  end loop;

  for v_i in 1..cardinality(v_traditional) loop
    v_nome := v_traditional[v_i];
    v_produto_id := (select id_produto from _mix_guarana_product_map where chave = 'tradicional:' || v_nome);
    insert into public.zelomenu_modifier_options (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
    values (v_user_id, v_grupo_id, v_nome, 1.00, true, cardinality(v_coverages) + v_i)
    returning id into v_opcao_id;
    insert into public.zelomenu_modifier_option_products (id_opcao, id_usuario, id_produto, price_override)
    values (v_opcao_id, v_user_id, v_produto_id, 1.00);
  end loop;

  -- Fini: cada unidade soma R$ 2.
  v_grupo_id := (select id from _mix_guarana_groups where nome = 'Confeitos Fini (+R$ 2 cada)');
  for v_i in 1..cardinality(v_fini) loop
    v_nome := v_fini[v_i];
    v_produto_id := (select id_produto from _mix_guarana_product_map where chave = 'fini:' || v_nome);
    insert into public.zelomenu_modifier_options (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
    values (v_user_id, v_grupo_id, v_nome, 2.00, true, v_i)
    returning id into v_opcao_id;
    insert into public.zelomenu_modifier_option_products (id_opcao, id_usuario, id_produto, price_override)
    values (v_opcao_id, v_user_id, v_produto_id, 2.00);
  end loop;

  if (select count(*) from public.zelomenu_modifier_groups where id_usuario=v_user_id and id_produto=v_base_id and ativo) <> 5
     or (select count(*) from public.zelomenu_modifier_options o join public.zelomenu_modifier_groups g on g.id=o.id_grupo where g.id_usuario=v_user_id and g.id_produto=v_base_id and o.ativo) <> 78
     or (select count(*) from public.zelomenu_modifier_option_products l where l.id_usuario=v_user_id and exists (select 1 from public.zelomenu_modifier_options o join public.zelomenu_modifier_groups g on g.id=o.id_grupo where o.id=l.id_opcao and g.id_usuario=v_user_id and g.id_produto=v_base_id)) <> 76 then
    raise exception 'Verificação interna falhou: grupos/opções/vínculos incompletos';
  end if;
end;
$$;

commit;
