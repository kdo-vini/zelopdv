# Zelinho Gerente — snapshot de RBAC (2026-08-13)

## Finding confirmado antes da mudanca

As tabelas de inteligencia financeira `business_signals` e
`business_daily_snapshots` estavam protegidas apenas pelo tenant. Um
subusuario ativo sem `relatorios.ver` conseguia ler os sinais e snapshots da
empresa dona pela Data API; tambem conseguia alterar `business_signals.read_at`
para marcar um aviso como lido.

O subusuario permanente de producao
`3f9060ca-446c-4299-a8c4-256aa195ed80` tem o cargo `auxiliar gestao` e nao tem
`relatorios.ver`. Um smoke transacional inseriu uma linha sintetica de cada
tabela para o owner `5efac306-25b4-4858-b94c-50fb42699a52`: antes da mudanca,
o subusuario viu `1` signal e `1` snapshot e atualizou `1` signal. A transacao
foi revertida e nao deixou dados.

## Snapshot exato pre-mudanca

As duas tabelas tinham RLS ativo, sem force RLS, e o mesmo ACL:

```text
postgres=arwdDxtm/postgres
authenticated=r/postgres
service_role=arwd/postgres
```

Contagem remota no momento do snapshot: `business_signals=134`,
`business_daily_snapshots=588`.

Policies remotas antes da migration:

```text
business_signals_select_owner | SELECT | {authenticated}
USING (user_id = get_owner_user_id(auth.uid()))

business_signals_update_read | UPDATE | {authenticated}
USING (user_id = get_owner_user_id(auth.uid()))
WITH CHECK (user_id = get_owner_user_id(auth.uid()))

business_snapshots_select_owner | SELECT | {authenticated}
USING (user_id = get_owner_user_id(auth.uid()))
```

## Consumidores e blast radius

### Browser

- `src/routes/gestao/gerente/+page.svelte` le as duas tabelas e marca sinais
  como lidos por meio de `src/lib/stores/gerente.js`.
- `src/routes/gestao/gerente/semana/+page.svelte` le as duas tabelas.
- `src/lib/components/GestaoSidebar.svelte` e `src/lib/stores/gerente.js`
  fazem somente leituras/contagens de sinais para o badge e o update de
  `read_at`.
- `src/lib/navigation/appNavigation.js` exibe o Zelinho somente quando o
  contexto de subusuario tem a capability existente `relatorios.ver`.

### Server, admin e cron

O engine de inteligencia, o assistente, o digest, o endpoint de insights do
admin e as rotinas cron usam `supabaseAdmin`/service-role. Eles nao passam por
essas policies e permanecem inalterados.

### Blast radius intencional

- Owner: continua lendo e atualizando o proprio tenant.
- Subusuario com `relatorios.ver`: continua lendo e marcando sinais como
  lidos.
- Subusuario sem `relatorios.ver`: perde somente o acesso aos dados do
  Zelinho Gerente; o PDV, Mesas, Pessoas, Fichario e demais leituras
  operacionais nao mudam.
- Super-admin autenticado sem ser owner de uma empresa: continua sem linhas
  por essas policies; o painel usa service-role/handlers proprios.
- Anon: continua sem grant e sem acesso.
- Service-role: continua lendo e escrevendo sem alteracao.

## Mudanca forward-only

`supabase/migrations/20260813043000_gerente_reports_rbac.sql` altera somente as
tres policies existentes para exigir, alem do tenant, a decisao
`fiado_actor_can('relatorios.ver', user_id)`. Nenhum grant, tabela, funcao,
coluna, dado ou contrato de server foi alterado.

## Verificacao pos-apply (confirmada em producao)

O smoke remoto transacional apos o apply retornou a matriz abaixo; a linha
sintetica foi criada e revertida na mesma transacao (`synthetic_rows=1` no
resultado antes do rollback):

| Principal | SELECT sinais/snapshots | UPDATE `read_at` |
| --- | --- | --- |
| owner | 1/1 | 1 |
| subusuario sem `relatorios.ver` | 0/0 | 0 |
| subusuario com `relatorios.ver` | 1/1 | 1 |
| super-admin fora do tenant | 0/0 | 0 |
| anon | sem grant SELECT/UPDATE | sem grant |
| service-role | 1/1 | 1 |

Tambem foi confirmada a definicao pos-apply das tres policies: cada uma exige
`fiado_actor_can('relatorios.ver', user_id)` alem do escopo por owner. Os ACLs
continuam `authenticated=r` e `service_role=arwd`; nao existe grant para
`anon`.

Todos os probes devem terminar com `ROLLBACK`; nenhuma fixture de producao
deve permanecer.

## Rollback

Somente se explicitamente aprovado, criar uma nova migration forward-only com:

```sql
alter policy business_signals_select_owner
  on public.business_signals
  using (user_id = get_owner_user_id(auth.uid()));

alter policy business_signals_update_read
  on public.business_signals
  using (user_id = get_owner_user_id(auth.uid()))
  with check (user_id = get_owner_user_id(auth.uid()));

alter policy business_snapshots_select_owner
  on public.business_daily_snapshots
  using (user_id = get_owner_user_id(auth.uid()));
```

Nao reescrever a migration aplicada e nao modificar linhas existentes.
