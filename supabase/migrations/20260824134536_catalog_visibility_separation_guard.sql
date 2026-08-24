-- Contract guard: PDV visibility and online publication are independent.
-- This migration changes metadata only. It must not alter current product or
-- ZeloMenu publication rows, including the Bem Servido catalog.

comment on column public.produtos.ocultar_no_pdv is
  'Internal ZeloPDV visibility. This flag is independent from ZeloMenu online publication.';

comment on column public.zelomenu_product_publications.visivel_online is
  'Customer-facing ZeloMenu publication. This flag is independent from PDV visibility.';

comment on column public.zelomenu_product_publications.pausado_manualmente is
  'Manual customer-facing pause in ZeloMenu. This flag is independent from PDV visibility.';

do $$
begin
  if to_regclass('public.produtos') is null
    or to_regclass('public.zelomenu_product_publications') is null
  then
    raise exception 'Catalog visibility contract requires the canonical product and publication tables';
  end if;
end;
$$;
