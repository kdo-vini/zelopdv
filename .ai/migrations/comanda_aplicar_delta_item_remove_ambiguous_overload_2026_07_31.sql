begin;

-- The five-argument function has defaults for the two new parameters, so it
-- still accepts legacy calls with only (comanda, produto, delta). Keeping a
-- separate three-argument overload makes PostgREST return PGRST203 instead of
-- resolving the RPC for clients that send the legacy payload.
drop function if exists public.comanda_aplicar_delta_item(uuid, integer, integer);

notify pgrst, 'reload schema';

commit;
