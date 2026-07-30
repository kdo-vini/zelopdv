-- Exclusao definitiva de pessoa quitada.
--
-- A ficha pode ser apagada pela empresa quando nao existe saldo em aberto.
-- Como o extrato do fiado e as vendas guardam FKs para pessoas, a operacao
-- precisa acontecer nesta RPC, em uma unica transacao, e nao por DELETE direto
-- do navegador.

begin;

create or replace function public.fiado_excluir_pessoa(p_id_pessoa uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_pessoa public.pessoas%rowtype;
  v_lancamentos_excluidos integer := 0;
  v_vendas_desvinculadas integer := 0;
begin
  if v_actor is null then
    raise exception 'Nao autenticado.' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);
  if not public.fiado_actor_can('pessoas.gerenciar', v_owner) then
    raise exception 'Voce nao tem permissao para excluir pessoas.' using errcode = '42501';
  end if;

  select * into v_pessoa
    from public.pessoas
   where id = p_id_pessoa
     and id_usuario = v_owner
   for update;
  if not found then
    raise exception 'Pessoa nao encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_pessoa.saldo_fiado, 0) <> 0 then
    raise exception 'Nao e possivel excluir uma pessoa com saldo de fiado diferente de zero.' using errcode = '23514';
  end if;

  -- Preserva a venda e seus totais, mas remove a identidade que a empresa
  -- decidiu apagar antes de remover a linha-pai.
  update public.vendas
     set id_cliente = null,
         id_pessoa = null
   where id_usuario = v_owner
     and (id_cliente = v_pessoa.id or id_pessoa = v_pessoa.id);
  get diagnostics v_vendas_desvinculadas = row_count;

  delete from public.fiado_lancamentos
   where id_usuario = v_owner
     and id_pessoa = v_pessoa.id;
  get diagnostics v_lancamentos_excluidos = row_count;

  delete from public.pessoas
   where id = v_pessoa.id
     and id_usuario = v_owner;

  return jsonb_build_object(
    'excluida', true,
    'pessoa_id', v_pessoa.id,
    'lancamentos_excluidos', v_lancamentos_excluidos,
    'vendas_desvinculadas', v_vendas_desvinculadas
  );
end;
$$;

revoke all on function public.fiado_excluir_pessoa(uuid) from public, anon;
grant execute on function public.fiado_excluir_pessoa(uuid) to authenticated, service_role;

commit;
