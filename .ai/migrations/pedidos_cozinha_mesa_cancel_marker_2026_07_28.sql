-- Fase 2A corrective patch: a comanda-owned mesa order must not be marked as
-- stock-released when its kitchen ticket is cancelled. The first production
-- migration guarded the restoration update but left the marker assignment
-- unconditional; this CREATE OR REPLACE patch fixes that state transition.

begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.transition_zelo_order(uuid,integer,text,uuid,jsonb)'::regprocedure)
    into v_definition;

  if position('o.fulfillment->>''comandaItemId'' is null' in v_definition)=0 then
    raise exception 'PRECONDITION_FAILED: transition_zelo_order cancellation guard missing';
  end if;
  if position('stock_released_at=case when v_to=''cancelled'' and stock_committed_at is not null then now() else stock_released_at end,' in v_definition)=0 then
    raise exception 'PRECONDITION_FAILED: transition_zelo_order stock marker already patched or drifted';
  end if;

  v_definition:=replace(v_definition,
    'stock_released_at=case when v_to=''cancelled'' and stock_committed_at is not null then now() else stock_released_at end,',
    'stock_released_at=case when v_to=''cancelled'' and stock_committed_at is not null
      and (o.source <> ''mesa'' or o.fulfillment->>''comandaItemId'' is null)
      then now() else stock_released_at end,');
  execute v_definition;
end $$;

commit;
