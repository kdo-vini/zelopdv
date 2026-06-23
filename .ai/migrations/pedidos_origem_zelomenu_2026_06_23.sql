-- ============================================================================
-- Permitir origem='zelomenu' em pedidos (D-096 / ZLM-301 / T5)
--
-- O `public_order` do ZeloMenu materializa um ticket de cozinha em
-- pedidos.origem='zelomenu'. O CHECK atual `pedidos_origem_check` aceita
-- 'balcao'/'comanda'/'zelochat' mas REJEITA 'zelomenu' — pego na validação em
-- 2026-06-23 (insert de teste no Donutopia retornou pedidos_origem_check).
--
-- Recriamos o check com o conjunto completo. Seguro: verificado que nenhuma
-- linha existente em `pedidos` usa origem fora de 'balcao', então a troca não
-- rejeita nenhum registro atual. ('zelochat' já era aceito; só faltava 'zelomenu'.)
-- ============================================================================
alter table public.pedidos drop constraint if exists pedidos_origem_check;

alter table public.pedidos
  add constraint pedidos_origem_check
  check (origem in ('balcao', 'comanda', 'zelochat', 'zelomenu'));
