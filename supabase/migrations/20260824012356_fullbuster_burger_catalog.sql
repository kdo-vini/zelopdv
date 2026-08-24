-- Full Buster Burger: catalog seed for ZeloPDV + ZeloMenu publication layer.
--
-- This migration intentionally does not:
--   * enable subscriptions.has_zelo_menu;
--   * create empresa_perfil.zelomenu_slug; or
--   * configure delivery ranges.
--
-- The menu publication rows are created as visible so the catalog is ready
-- when the entitlement and slug are activated manually.

do $$
begin
  if not exists (
    select 1
    from public.empresa_perfil
    where user_id = '79a8ffbd-82e1-4307-b218-dc2a4175d66b'::uuid
      and nome_exibicao = 'FullBuster Burger'
  ) then
    raise exception 'Full Buster owner guard failed: expected empresa_perfil was not found';
  end if;
end $$;

create temporary table _fullbuster_categories (
  nome text primary key,
  ordem integer not null
) on commit drop;

insert into _fullbuster_categories (nome, ordem)
values
  ('Tradicionais', 1),
  ('Hambúrguer', 2),
  ('Frango', 3),
  ('Filé Mignon', 4),
  ('Bebidas', 5),
  ('Cerveja Lata', 6),
  ('1 Litro', 7),
  ('2 Litros', 8),
  ('Sucos (500ml)', 9);

insert into public.categorias (id_usuario, nome, ordem)
select
  '79a8ffbd-82e1-4307-b218-dc2a4175d66b'::uuid,
  source.nome,
  source.ordem
from _fullbuster_categories source
where not exists (
  select 1
  from public.categorias target
  where target.id_usuario = '79a8ffbd-82e1-4307-b218-dc2a4175d66b'::uuid
    and lower(target.nome) = lower(source.nome)
);

create temporary table _fullbuster_products (
  categoria text not null,
  nome text not null,
  descricao text,
  preco_normal numeric(10, 2) not null,
  preco_grande numeric(10, 2),
  ordem integer not null,
  primary key (categoria, nome)
) on commit drop;

insert into _fullbuster_products
  (categoria, nome, descricao, preco_normal, preco_grande, ordem)
values
  ('Tradicionais', 'Misto Quente', 'Presunto e Queijo', 28.00, 34.00, 1),
  ('Tradicionais', 'Bauru', 'Presunto, Queijo e Tomate', 28.00, 34.00, 2),
  ('Tradicionais', 'Vegetariano', 'Ovo, Queijo, Creme de Milho e Salada', 30.00, 39.00, 3),
  ('Tradicionais', 'Americano Comum', 'Ovo, Presunto, Queijo e Salada', 30.00, 37.00, 4),
  ('Tradicionais', 'Mineirinho', 'Bacon, Presunto, Queijo e Salada', 33.00, 39.00, 5),

  ('Hambúrguer', 'X Burguer', 'Hambúrguer, Queijo e Tomate', 28.00, 36.00, 6),
  ('Hambúrguer', 'X Salada', 'Hambúrguer, Queijo e Salada', 28.00, 36.00, 7),
  ('Hambúrguer', 'X Egg', 'Hambúrguer, Ovo, Queijo e Salada', 29.00, 37.00, 8),
  ('Hambúrguer', 'X Maionese', 'Hambúrguer, Presunto, Queijo, Salada e Maionese', 33.00, 41.00, 9),
  ('Hambúrguer', 'X Bacon', 'Hambúrguer, Bacon, Queijo e Salada', 33.00, 41.00, 10),
  ('Hambúrguer', 'X Calabresa', 'Hambúrguer, Calabresa, Queijo e Salada', 33.00, 41.00, 11),
  ('Hambúrguer', 'X Burguer Duplo', '2 Hambúrgueres, Queijo, Tomate e Cheddar', 34.00, 42.00, 12),
  ('Hambúrguer', 'X Calabresa Acebolado', 'Hambúrguer, Calabresa, Cebola, Queijo e Salada', 35.00, 43.00, 13),
  ('Hambúrguer', 'Gauchninho', 'Hambúrguer, Bacon, Ovo, Queijo e Salada', 35.00, 43.00, 14),
  ('Hambúrguer', 'Americano Especial', 'Hambúrguer, Ovo, Presunto, Queijo, Creme de Milho e Salada', 35.00, 43.00, 15),
  ('Hambúrguer', 'Calaburguer', 'Hambúrguer, Calabresa, Ovo, Queijo e Salada', 35.00, 43.00, 16),
  ('Hambúrguer', 'X Promi', 'Hambúrguer, Calabresa, Presunto, Queijo, Creme de Milho e Salada', 37.00, 45.00, 17),
  ('Hambúrguer', 'X Nápoli', 'Hambúrguer, Bacon, Presunto, Queijo, Creme de Milho e Salada', 37.00, 45.00, 18),
  ('Hambúrguer', 'X Plis', 'Hambúrguer, Bacon, Calabresa, Queijo e Salada', 37.00, 45.00, 19),
  ('Hambúrguer', 'X Bacon Especial', 'Hambúrguer, Bacon, Ovo, Presunto, Queijo e Salada', 38.00, 46.00, 20),
  ('Hambúrguer', 'X Bacon Duplo', '2 Hambúrgueres, Bacon, Queijo, Salada e Cheddar', 39.00, 48.00, 21),
  ('Hambúrguer', 'X Tudo Especial', 'Hambúrguer, Bacon, Calabresa, Ovo, Presunto, Queijo, Creme de Milho e Salada', 41.00, 50.00, 22),

  ('Frango', 'Fransalada', 'Frango, Queijo e Salada', 37.00, 44.00, 23),
  ('Frango', 'Chicken Egg', 'Frango, Ovo, Queijo e Salada', 38.00, 45.00, 24),
  ('Frango', 'Francalabresa', 'Frango, Calabresa, Queijo e Salada', 39.00, 47.00, 25),
  ('Frango', 'Frangood', 'Frango, Presunto, Queijo, Creme de Milho e Salada', 39.00, 47.00, 26),
  ('Frango', 'Frambacon', 'Frango, Bacon, Queijo e Salada', 39.00, 47.00, 27),
  ('Frango', 'Framburguer', 'Frango, Hambúrguer, Bacon, Presunto, Queijo e Salada', 42.00, 51.00, 28),
  ('Frango', 'Tudo Frango', 'Frango, Calabresa, Bacon, Ovo, Presunto, Queijo, Creme de Milho e Salada', 48.00, 57.00, 29),
  ('Frango', 'Franlé Especial', 'Frango, Filé Mignon, Ovo, Presunto, Queijo, Creme de Milho e Salada', 49.00, 58.00, 30),

  ('Filé Mignon', 'Mignon House', 'Filé Mignon, Queijo e Salada', 47.00, 55.00, 31),
  ('Filé Mignon', 'Mignon Executivo', 'Filé Mignon, Ovo, Queijo e Salada', 48.00, 56.00, 32),
  ('Filé Mignon', 'Filé Acebolado', 'Filé Mignon, Cebola, Queijo e Salada', 48.00, 56.00, 33),
  ('Filé Mignon', 'Mignon Fresh', 'Filé Mignon, Presunto, Queijo e Salada', 49.00, 57.00, 34),
  ('Filé Mignon', 'Mignon Bacon', 'Filé Mignon, Bacon, Queijo e Salada', 50.00, 58.00, 35),
  ('Filé Mignon', 'Mignon Calabresa', 'Filé Mignon, Calabresa, Queijo e Salada', 50.00, 58.00, 36),
  ('Filé Mignon', 'Mignon Prime', 'Filé Mignon, Bacon, Presunto, Queijo e Salada', 51.00, 59.00, 37),
  ('Filé Mignon', 'Full Buster', 'Filé Mignon, Bacon, Calabresa, Ovo, Presunto, Queijo, Creme de Milho e Salada', 56.00, 64.00, 38),

  ('Bebidas', 'Água', null, 4.00, null, 1),
  ('Bebidas', 'Água c/gás', null, 4.50, null, 2),
  ('Bebidas', 'Coca Cola Lata', null, 7.00, null, 3),
  ('Bebidas', 'Coca Cola Zero Lata', null, 7.00, null, 4),
  ('Bebidas', 'Fanta Laranja Lata', null, 7.00, null, 5),
  ('Bebidas', 'Sprite Lata', null, 7.00, null, 6),
  ('Bebidas', 'Monster Energy', null, 12.00, null, 7),

  ('Cerveja Lata', 'Itaipava Lata', null, 6.00, null, 1),
  ('Cerveja Lata', 'Brahma Lata', null, 7.00, null, 2),
  ('Cerveja Lata', 'Skol Lata', null, 7.00, null, 3),
  ('Cerveja Lata', 'Antarctica Lata', null, 7.00, null, 4),

  ('1 Litro', 'Coca Cola 1L', null, 10.00, null, 1),
  ('1 Litro', 'Coca Cola Zero 1L', null, 10.00, null, 2),
  ('1 Litro', 'Antárctica Guaraná', null, 10.00, null, 3),

  ('2 Litros', 'Coca Cola 2L', null, 15.00, null, 1),
  ('2 Litros', 'Coca Cola Zero 2L', null, 15.00, null, 2),
  ('2 Litros', 'Fanta Laranja 2L', null, 14.00, null, 3),
  ('2 Litros', 'Roller 2L', null, 13.00, null, 4),
  ('2 Litros', 'Poty Guaraná 2L', null, 12.00, null, 5),
  ('2 Litros', 'Poty Laranja 2L', null, 12.00, null, 6),
  ('2 Litros', 'Poty Limão 2L', null, 12.00, null, 7),
  ('2 Litros', 'Kuat 2L', null, 11.00, null, 8),

  ('Sucos (500ml)', 'Laranja', null, 13.00, null, 1),
  ('Sucos (500ml)', 'Acerola', null, 9.00, null, 2),
  ('Sucos (500ml)', 'Abacaxi c/Hortelã', null, 9.00, null, 3),
  ('Sucos (500ml)', 'Morango', null, 9.00, null, 4),
  ('Sucos (500ml)', 'Abacaxi', null, 9.00, null, 5),
  ('Sucos (500ml)', 'Maracujá', null, 9.00, null, 6);

do $$
declare
  v_owner uuid := '79a8ffbd-82e1-4307-b218-dc2a4175d66b'::uuid;
  v_categoria_id integer;
  v_produto_id bigint;
  v_grupo_id uuid;
  v_opcao_id uuid;
  product_row record;
begin
  for product_row in
    select *
    from _fullbuster_products
    order by categoria, ordem
  loop
    select c.id
      into v_categoria_id
    from public.categorias c
    where c.id_usuario = v_owner
      and lower(c.nome) = lower(product_row.categoria)
    order by c.id
    limit 1;

    if v_categoria_id is null then
      raise exception 'Full Buster category not found: %', product_row.categoria;
    end if;

    select p.id
      into v_produto_id
    from public.produtos p
    where p.id_usuario = v_owner
      and lower(p.nome) = lower(product_row.nome)
    order by p.id
    limit 1;

    if v_produto_id is null then
      insert into public.produtos
        (id_usuario, id_categoria, nome, preco, controlar_estoque, estoque_atual, eh_item_por_unidade, ocultar_no_pdv, preco_2, preco_3)
      values
        (v_owner, v_categoria_id, product_row.nome, product_row.preco_normal, false, 0, false, false, null, null)
      returning id into v_produto_id;
    else
      update public.produtos
      set id_categoria = v_categoria_id,
          preco = product_row.preco_normal,
          preco_2 = null,
          preco_3 = null,
          ocultar_no_pdv = false
      where id = v_produto_id
        and id_usuario = v_owner;
    end if;

    insert into public.zelomenu_product_publications
      (id_usuario, id_produto, descricao_publica, visivel_online, pausado_manualmente, ordem)
    values
      (v_owner, v_produto_id, product_row.descricao, true, false, product_row.ordem)
    on conflict (id_usuario, id_produto) do update
      set descricao_publica = excluded.descricao_publica,
          visivel_online = true,
          pausado_manualmente = false,
          ordem = excluded.ordem,
          updated_at = now();

    if product_row.preco_grande is not null then
      select g.id
        into v_grupo_id
      from public.zelomenu_modifier_groups g
      where g.id_usuario = v_owner
        and g.id_produto = v_produto_id
        and lower(g.nome) = lower('Tamanho')
      order by g.ordem, g.id
      limit 1;

      if v_grupo_id is null then
        insert into public.zelomenu_modifier_groups
          (id_usuario, id_produto, nome, tipo, modo_preco, min_selecoes, max_selecoes, permite_quantidade, maximo_por_opcao, ativo, ordem)
        values
          (v_owner, v_produto_id, 'Tamanho', 'variacao', 'substituir', 1, 1, false, null, true, 1)
        returning id into v_grupo_id;
      else
        update public.zelomenu_modifier_groups
        set nome = 'Tamanho',
            tipo = 'variacao',
            modo_preco = 'substituir',
            min_selecoes = 1,
            max_selecoes = 1,
            permite_quantidade = false,
            maximo_por_opcao = null,
            ativo = true,
            ordem = 1,
            updated_at = now()
        where id = v_grupo_id
          and id_usuario = v_owner
          and id_produto = v_produto_id;
      end if;

      select o.id
        into v_opcao_id
      from public.zelomenu_modifier_options o
      where o.id_usuario = v_owner
        and o.id_grupo = v_grupo_id
        and lower(o.nome) = lower('Normal')
      order by o.ordem, o.id
      limit 1;

      if v_opcao_id is null then
        insert into public.zelomenu_modifier_options
          (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
        values
          (v_owner, v_grupo_id, 'Normal', product_row.preco_normal, true, 1);
      else
        update public.zelomenu_modifier_options
        set price_delta = product_row.preco_normal,
            ativo = true,
            ordem = 1,
            updated_at = now()
        where id = v_opcao_id
          and id_usuario = v_owner
          and id_grupo = v_grupo_id;
      end if;

      select o.id
        into v_opcao_id
      from public.zelomenu_modifier_options o
      where o.id_usuario = v_owner
        and o.id_grupo = v_grupo_id
        and lower(o.nome) = lower('Grande')
      order by o.ordem, o.id
      limit 1;

      if v_opcao_id is null then
        insert into public.zelomenu_modifier_options
          (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
        values
          (v_owner, v_grupo_id, 'Grande', product_row.preco_grande, true, 2);
      else
        update public.zelomenu_modifier_options
        set price_delta = product_row.preco_grande,
            ativo = true,
            ordem = 2,
            updated_at = now()
        where id = v_opcao_id
          and id_usuario = v_owner
          and id_grupo = v_grupo_id;
      end if;

      select g.id
        into v_grupo_id
      from public.zelomenu_modifier_groups g
      where g.id_usuario = v_owner
        and g.id_produto = v_produto_id
        and lower(g.nome) = lower('Acréscimos')
      order by g.ordem, g.id
      limit 1;

      if v_grupo_id is null then
        insert into public.zelomenu_modifier_groups
          (id_usuario, id_produto, nome, tipo, modo_preco, min_selecoes, max_selecoes, permite_quantidade, maximo_por_opcao, ativo, ordem)
        values
          (v_owner, v_produto_id, 'Acréscimos', 'adicional', 'somar', 0, 3, false, null, true, 2)
        returning id into v_grupo_id;
      else
        update public.zelomenu_modifier_groups
        set nome = 'Acréscimos',
            tipo = 'adicional',
            modo_preco = 'somar',
            min_selecoes = 0,
            max_selecoes = 3,
            permite_quantidade = false,
            maximo_por_opcao = null,
            ativo = true,
            ordem = 2,
            updated_at = now()
        where id = v_grupo_id
          and id_usuario = v_owner
          and id_produto = v_produto_id;
      end if;

      select o.id
        into v_opcao_id
      from public.zelomenu_modifier_options o
      where o.id_usuario = v_owner
        and o.id_grupo = v_grupo_id
        and lower(o.nome) = lower('Creme de Milho')
      order by o.ordem, o.id
      limit 1;
      if v_opcao_id is null then
        insert into public.zelomenu_modifier_options
          (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
        values
          (v_owner, v_grupo_id, 'Creme de Milho', 6.00, true, 1);
      else
        update public.zelomenu_modifier_options
        set price_delta = 6.00, ativo = true, ordem = 1, updated_at = now()
        where id = v_opcao_id and id_usuario = v_owner and id_grupo = v_grupo_id;
      end if;

      select o.id
        into v_opcao_id
      from public.zelomenu_modifier_options o
      where o.id_usuario = v_owner
        and o.id_grupo = v_grupo_id
        and lower(o.nome) = lower('Cheddar')
      order by o.ordem, o.id
      limit 1;
      if v_opcao_id is null then
        insert into public.zelomenu_modifier_options
          (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
        values
          (v_owner, v_grupo_id, 'Cheddar', 6.00, true, 2);
      else
        update public.zelomenu_modifier_options
        set price_delta = 6.00, ativo = true, ordem = 2, updated_at = now()
        where id = v_opcao_id and id_usuario = v_owner and id_grupo = v_grupo_id;
      end if;

      select o.id
        into v_opcao_id
      from public.zelomenu_modifier_options o
      where o.id_usuario = v_owner
        and o.id_grupo = v_grupo_id
        and lower(o.nome) = lower('Catupiry')
      order by o.ordem, o.id
      limit 1;
      if v_opcao_id is null then
        insert into public.zelomenu_modifier_options
          (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
        values
          (v_owner, v_grupo_id, 'Catupiry', 6.00, true, 3);
      else
        update public.zelomenu_modifier_options
        set price_delta = 6.00, ativo = true, ordem = 3, updated_at = now()
        where id = v_opcao_id and id_usuario = v_owner and id_grupo = v_grupo_id;
      end if;
    else
      select g.id
        into v_grupo_id
      from public.zelomenu_modifier_groups g
      where g.id_usuario = v_owner
        and g.id_produto = v_produto_id
        and lower(g.nome) = lower('Adicionais')
      order by g.ordem, g.id
      limit 1;

      if v_grupo_id is null then
        insert into public.zelomenu_modifier_groups
          (id_usuario, id_produto, nome, tipo, modo_preco, min_selecoes, max_selecoes, permite_quantidade, maximo_por_opcao, ativo, ordem)
        values
          (v_owner, v_produto_id, 'Adicionais', 'adicional', 'somar', 0, 1, false, null, true, 1)
        returning id into v_grupo_id;
      else
        update public.zelomenu_modifier_groups
        set nome = 'Adicionais',
            tipo = 'adicional',
            modo_preco = 'somar',
            min_selecoes = 0,
            max_selecoes = 1,
            permite_quantidade = false,
            maximo_por_opcao = null,
            ativo = true,
            ordem = 1,
            updated_at = now()
        where id = v_grupo_id
          and id_usuario = v_owner
          and id_produto = v_produto_id;
      end if;

      select o.id
        into v_opcao_id
      from public.zelomenu_modifier_options o
      where o.id_usuario = v_owner
        and o.id_grupo = v_grupo_id
        and lower(o.nome) = lower('Gelo e Limão')
      order by o.ordem, o.id
      limit 1;

      if v_opcao_id is null then
        insert into public.zelomenu_modifier_options
          (id_usuario, id_grupo, nome, price_delta, ativo, ordem)
        values
          (v_owner, v_grupo_id, 'Gelo e Limão', 2.50, true, 1);
      else
        update public.zelomenu_modifier_options
        set price_delta = 2.50,
            ativo = true,
            ordem = 1,
            updated_at = now()
        where id = v_opcao_id
          and id_usuario = v_owner
          and id_grupo = v_grupo_id;
      end if;
    end if;
  end loop;
end $$;
