-- Garante no máximo UM caixa aberto por empresa (id_usuario).
--
-- Contexto: aberturas duplicadas (duas abas/dispositivos, retry após falha de
-- rede) criavam dois caixas abertos. Todo o app assume no máximo um aberto
-- (order by data_abertura desc limit 1), então o mais antigo virava "órfão":
-- invisível no PDV e no fechamento, mas aparecendo como aberto nos relatórios.

begin;

-- 1) Saneamento (duplicados): entre caixas ABERTOS do mesmo usuário, mantém só
--    o mais recente. Os mais antigos são fechados herdando como data_fechamento
--    a abertura do caixa seguinte, para manter o período coerente nos relatórios.
--    Vendas nunca caem nesses caixas antigos (PDV e RPC sempre usam o aberto
--    mais recente), então o fechamento é seguro.
update public.caixas c
set data_fechamento = coalesce(
  (
    select min(c2.data_abertura)
    from public.caixas c2
    where c2.id_usuario = c.id_usuario
      and c2.data_abertura > c.data_abertura
  ),
  now()
)
where c.data_fechamento is null
  and exists (
    select 1
    from public.caixas c3
    where c3.id_usuario = c.id_usuario
      and c3.data_fechamento is null
      and c3.data_abertura > c.data_abertura
  );

-- 2) Saneamento (órfãos estagnados): caixa aberto que já foi "ultrapassado" por
--    um caixa mais novo (já fechado) é lixo do bug — fecha herdando a abertura
--    do caixa seguinte. Proteção: se houver venda registrada nele DEPOIS da
--    abertura do caixa mais novo, ele está em uso real e é preservado (o dono
--    fecha pelo fluxo normal).
update public.caixas c
set data_fechamento = (
  select min(c2.data_abertura)
  from public.caixas c2
  where c2.id_usuario = c.id_usuario
    and c2.data_abertura > c.data_abertura
)
where c.data_fechamento is null
  and exists (
    select 1
    from public.caixas c3
    where c3.id_usuario = c.id_usuario
      and c3.data_abertura > c.data_abertura
  )
  and not exists (
    select 1
    from public.vendas v
    where v.id_caixa = c.id
      and v.created_at > (
        select max(c4.data_abertura)
        from public.caixas c4
        where c4.id_usuario = c.id_usuario
      )
  );

-- 3) Invariante: índice único parcial impede um segundo caixa aberto por
--    usuário, independentemente de bug de cliente, corrida ou múltiplas abas.
--    O client trata a violação (23505) adotando o caixa existente.
create unique index if not exists caixas_one_open_per_user
  on public.caixas (id_usuario)
  where data_fechamento is null;

commit;
