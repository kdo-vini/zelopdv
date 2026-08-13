begin;
-- A pausa operacional é uma propriedade do produto canônico. O campo legado
-- da publicação é convertido para manter a versão antiga do runtime segura
-- durante o rollout. O campo será removido da leitura/escrita pelo runtime novo
-- e permanece sincronizado nesta janela de compatibilidade.
update public.produtos as produto
set ocultar_no_pdv = true
from public.zelomenu_product_publications as publicacao
where publicacao.id_usuario = produto.id_usuario
  and publicacao.id_produto = produto.id
  and publicacao.pausado_manualmente = true
  and coalesce(produto.ocultar_no_pdv, false) = false;
update public.zelomenu_product_publications as publicacao
set pausado_manualmente = coalesce(produto.ocultar_no_pdv, false)
from public.produtos as produto
where produto.id_usuario = publicacao.id_usuario
  and produto.id = publicacao.id_produto
  and publicacao.pausado_manualmente is distinct from coalesce(produto.ocultar_no_pdv, false);
alter table public.produtos
  alter column ocultar_no_pdv set default false,
  alter column ocultar_no_pdv set not null;
-- A categoria legada da Bem Servido só agrupava componentes. Produtos são
-- preservados sem categoria; o único item vendido separadamente sem vínculo
-- é movido para uma categoria comercial antes da remoção.
do $$
declare
  bem_servido_user uuid;
  componentes_id bigint;
  salgados_id bigint;
begin
  select ep.user_id
    into bem_servido_user
  from public.empresa_perfil ep
  where ep.zelomenu_slug = 'bemservido'
  limit 1;

  if bem_servido_user is null then
    return;
  end if;

  select c.id
    into componentes_id
  from public.categorias c
  where c.id_usuario = bem_servido_user
    and c.nome = 'Monte sua Marmita - Componentes'
  limit 1;

  if componentes_id is null then
    return;
  end if;

  select c.id
    into salgados_id
  from public.categorias c
  where c.id_usuario = bem_servido_user
    and c.nome = 'Salgados'
  limit 1;

  update public.zelomenu_product_publications pub
  set visivel_online = false
  from public.produtos p
  where p.id_usuario = bem_servido_user
    and p.id_categoria = componentes_id
    and p.id = pub.id_produto
    and pub.id_usuario = bem_servido_user
    and p.nome in ('Arroz branco', 'Bife à Milanesa');

  if salgados_id is not null then
    update public.produtos
    set id_categoria = salgados_id,
        id_subcategoria = null
    where id_usuario = bem_servido_user
      and id_categoria = componentes_id
      and nome = 'Torresmo';
  end if;

  delete from public.categorias
  where id = componentes_id
    and id_usuario = bem_servido_user;
end
$$;
commit;
