-- Allow sub-users to insert cash movements on behalf of the owner account.
-- Existing app flow writes id_usuario = ownerUserId and id_operador = auth user.
-- The old policy only allowed auth.uid() = id_usuario, which blocks sub-users.

DROP POLICY IF EXISTS "caixa_movs_insert_own" ON public.caixa_movimentacoes;

CREATE POLICY "caixa_movs_actor_insert"
ON public.caixa_movimentacoes
FOR INSERT
WITH CHECK (
  get_owner_user_id(auth.uid()) = id_usuario
);
