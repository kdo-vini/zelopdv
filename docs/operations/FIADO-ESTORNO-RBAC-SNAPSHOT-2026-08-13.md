# Estorno de fiado RBAC — 2026-08-13

## Estado de produção verificado antes da mudança

`public.fiado_estornar_venda(bigint)` foi revalidada diretamente no catálogo
linked antes de qualquer alteração:

- `SECURITY DEFINER`, owner `postgres`, `VOLATILE`, `search_path=public`;
- ACL exata:
  `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`;
- SHA-256 de `pg_get_functiondef`:
  `f5994c428598b75ee3d339dae2a6f02b31062e72b4b3f175a9767d67af7815f9`;
- escopo da venda por `get_owner_user_id(auth.uid())` e `id_usuario`;
- nenhuma checagem de `pdv.cancelar` antes de atualizar
  `pessoas.saldo_fiado` e inserir o evento compensatório em
  `fiado_lancamentos`.

A definição pré-mudança completa também está congelada no baseline imutável
`supabase/baselines/20260813091000/schema.sql`. Esta correção não altera o
baseline nem qualquer migration já aplicada.

## Reprodução test-first

O verificador transacional
`supabase/verification/fiado_estorno_rbac_authz.sql` cria somente fixtures
sintéticas e faz `ROLLBACK`. Antes da migration ele falhou com:

```text
active subuser without pdv.cancelar reversed a fiado sale
```

Depois da falha foram confirmados `0` usuários, `0` pessoas e `0` vendas de
fixture persistidos em produção.

## Consumidores e blast radius

O único consumidor de aplicação encontrado é o helper browser-side
`src/lib/finance/saleOps.js`, chamado pela exclusão de venda histórica em
`src/routes/gestao/+page.svelte`. Essa tela e seu botão não consultam
`pdv.cancelar`; ela busca o caixa pelo UUID bruto da sessão e, por isso,
subusuários normalmente recebem um dashboard vazio. A autorização real da
exclusão já está nas policies de UPDATE/DELETE de `vendas` e filhos, que exigem
`pdv.cancelar` para subusuários. O bypass confirmado permitia que alguém com um
ID de venda chamasse a RPC diretamente, alterasse saldo/ledger e só depois
fosse bloqueado ao tentar excluir a venda. Esta fatia alinha o efeito colateral
ao enforcement de banco existente; não adiciona um gate de UI. Não há
consumidor cron, administrativo ou service-role identificado para esta RPC.

Distribuição agregada antes da mudança: 10 subusuários ativos, 1 com
`pdv.cancelar` e 9 sem a capability. Os nove não possuem um caminho legítimo de
cancelamento; o comportamento removido é somente a chamada direta que
contornava o gate já aplicado ao restante da operação.

| Ator | Comportamento esperado após contenção |
| --- | --- |
| anon | execução negada |
| autenticado externo ao tenant | resultado neutro, sem acesso ao tenant |
| owner | estorno e idempotência preservados |
| subusuário com `pdv.cancelar` | estorno preservado |
| subusuário ativo sem `pdv.cancelar` | negado antes de saldo/ledger |
| subusuário removido | não resolve mais o antigo tenant; resultado neutro |
| super-admin externo | sem bypass de tenant; resultado neutro |
| service role sem ator UUID | continua não autenticado |
| service role com contexto explícito do owner | execução preservada |

Billing, vendas/offline, fluxo Mesa, UI e os cálculos de fiado não são
alterados.

## Menor correção

A migration forward-only
`20260813093000_fiado_estorno_rbac.sql` substitui somente a definição da RPC e
adiciona:

```sql
if not public.fiado_actor_can('pdv.cancelar', v_owner) then
  raise exception 'Sem permissão para cancelar esta venda.'
    using errcode = '42501';
end if;
```

O gate fica depois de confirmar uma venda do tenant com cliente e antes de
qualquer consulta ou mutação financeira. Escopo, cálculo simples/múltiplo,
idempotência, valores retornados, owner, `search_path` e ACLs permanecem.

## Verificação

- [x] teste estático falhou antes da migration e passou depois;
- [x] reprodução linked pré-mudança confirmou o bypass e fez rollback;
- [x] baseline PG17 descartável continuou idêntico à produção no cutoff;
- [x] migrations `092000` e `093000` aplicaram no banco descartável;
- [x] matriz local passou para anon, autenticado externo, owner, subusuário com
  e sem capability, removido, super-admin e service role;
- [x] revisão independente sem achados obrigatórios;
- [x] apply linked da migration;
- [x] mesma matriz transacional linked pós-mudança;
- [x] catálogo/ACL/hash pós-mudança e migration list/dry-run alinhados;
- [x] suíte completa e typecheck: 104 arquivos/650 testes, 0 erros e 95
  warnings preexistentes; lint linked em nível `error` reproduziu somente os
  dois findings já registrados em `criar_venda_completa` e
  `save_zelomenu_delivery_settings`. Os advisors linked também foram
  executados; os warnings preexistentes permanecem fora desta fatia, e a
  execução authenticated da RPC continua deliberadamente exposta com o novo
  guard interno.

Após o apply, a definição tem SHA-256
`31ab5592ddcfdb12c3537b3f8531a4163ead24752c74a87d39b111d44614ffb4`,
mantém a ACL prévia e contém o gate. A matriz linked passou e a conferência
final encontrou `0` usuários, pessoas, vendas ou roles de fixture. A lista de
migrations está alinhada por `20260813093000` e o dry-run está atualizado.

## Rollback

Rollback nunca edita a migration aplicada. Criar uma nova migration
forward-only que restaure literalmente a definição congelada em
`supabase/baselines/20260813091000/schema.sql` (função
`fiado_estornar_venda(bigint)`), seguida de:

```sql
alter function public.fiado_estornar_venda(bigint) owner to postgres;
revoke all on function public.fiado_estornar_venda(bigint) from public;
revoke execute on function public.fiado_estornar_venda(bigint) from anon;
grant execute on function public.fiado_estornar_venda(bigint)
  to authenticated, service_role;
```

Esse rollback reabre deliberadamente o bypass verificado e só deve ser usado
como ação emergencial enquanto um consumidor inesperado é investigado.
