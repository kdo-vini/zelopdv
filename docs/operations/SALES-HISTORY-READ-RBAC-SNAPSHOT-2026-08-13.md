# Snapshot — leitura de vendas e itens (2026-08-13)

## Finding revalidado antes da mudança

`vendas` e `vendas_itens` tinham SELECT apenas por owner efetivo. Em uma
transação remota, o subusuário permanente foi temporariamente colocado em um
cargo contendo somente `pedidos.acessar`; ele leu uma venda e um item
sintéticos do titular (`1/1`). A transação terminou em `ROLLBACK` e a consulta
de limpeza confirmou zero fixtures remanescentes.

## Snapshot exato anterior

As duas tabelas tinham RLS ativo, `force_row_level_security=false` e o mesmo
ACL:

```text
{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

Policies SELECT anteriores:

```text
vendas_actor_select
  roles: {public}
  using: get_owner_user_id(auth.uid()) = id_usuario

vendas_itens_actor_select
  roles: {public}
  using: exists (
    select 1 from vendas v
    where v.id = vendas_itens.id_venda
      and v.id_usuario = get_owner_user_id(auth.uid())
  )
```

Havia uma única policy SELECT efetiva em cada tabela. Todas as policies de
INSERT/UPDATE/DELETE permanecem fora desta mudança.

## Consumidores e blast radius

### Browser

- `/app` lê vendas para o saldo do caixa; `pdv.acessar` é o gate canônico e
  capacidades de vender/receber/cancelar continuam aceitas para cargos
  customizados que já operam o PDV.
- `/app/mesas/[id]` cria venda e itens com `INSERT ... RETURNING`; a rota exige
  `mesas.acessar` e o fechamento usa `mesas.fechar`.
- `/gestao/caixa` lê vendas para fechar o caixa; capacidades `caixa.*` de
  operação ou leitura permanecem aceitas.
- `/relatorios` lê as duas tabelas após o gate `relatorios.ver`; exportação
  também permanece aceita.
- `/gestao/fichario` lê somente vendas referenciadas no ledger de fiado; a
  rota usa `fiado.visualizar`.
- `/gestao` e `OnboardingChecklist` consultam pelo `auth.uid()` bruto e, na
  prática, são consumidores do titular. Não foi criado um novo gate de
  Dashboard nesta fatia.

### Server/admin/cron

Inteligência, assistente, onboarding e manutenção server-side usam
`service_role`/`supabaseAdmin` e não são afetados. O admin consome agregados,
não estas tabelas diretamente. Nenhum consumidor anônimo ou storefront foi
encontrado.

### Impacto concreto

- Titulares permanecem com leitura integral pelo bypass explícito de owner.
- Subusuários com capacidade legítima de PDV, Mesas, Caixa, Relatórios ou
  Fichário permanecem com leitura owner-scoped.
- Cargos contendo somente Pedidos, Catálogo, Estoque ou Pessoas perdem a
  leitura bruta de todo o histórico de vendas.
- Dos quatro subusuários ativos observados antes da mudança, somente um cargo
  (`gerente fabrica`, restrito a Pedidos/Estoque/Produtos) perde a leitura
  bruta. O fixture permanente mantém acesso por `fiado.visualizar`.
- Super-admin fora do tenant permanece sem linhas; `service_role` não muda.

`fiado.visualizar` ainda concede leitura do histórico owner-scoped inteiro,
embora a UI peça somente vendas ligadas ao ledger. Restringir por venda ligada
exigiria outro desenho de consulta/índice ou RPC e foi deliberadamente deixado
fora desta contenção para evitar regressão no Fichário.

## Mudança forward-only

`20260813090000_sales_history_read_rbac.sql` revoga SELECT anônimo e altera
somente as duas policies SELECT para `authenticated`, preservando o escopo do
titular e a relação item → venda.

A primeira implementação correta fazia até 13 chamadas ao helper
`fiado_actor_can` por linha e repetia o gate no item e na venda-pai. Como a
migration já estava aplicada, ela não foi reescrita. A companion forward-only
`20260813091000_sales_history_read_rbac_performance.sql` mantém exatamente a
mesma união de capabilities, resolve membership/cargo em um InitPlan não
correlacionado (uma vez por statement) e deixa a policy do item herdar a
autorização da venda-pai. Não cria função/RPC nem usa `SECURITY DEFINER`.

Nenhuma das duas migrations altera dados, writes, billing, offline, UI ou
contratos da Data API para consumidores autorizados.

## Matriz pós-aplicação

A matriz completa abaixo foi executada após a primeira migration. Todas as
linhas sintéticas, mudanças temporárias de cargo e operações foram feitas em
uma única transação remota e revertidas:

| Principal/capability | `vendas` | `vendas_itens` |
| --- | ---: | ---: |
| Titular autenticado | 1 | 1 |
| Fixture permanente no cargo atual (`fiado.visualizar`) | 1 | 1 |
| Somente `pedidos.acessar` | 0 | 0 |
| `pdv.acessar` | 1 | 1 |
| `pdv.vender` | 1 | 1 |
| `pdv.receber` | 1 | 1 |
| `mesas.acessar` | 1 | 1 |
| `caixa.abrir` | 1 | 1 |
| `caixa.fechar` | 1 | 1 |
| `caixa.movimentar` | 1 | 1 |
| `caixa.ver` | 1 | 1 |
| `relatorios.ver` | 1 | 1 |
| `relatorios.exportar` | 1 | 1 |
| `fiado.visualizar` | 1 | 1 |
| Subusuário bloqueado | 0 | 0 |
| Super-admin fora do tenant | 0 | 0 |
| `service_role` | 1 | 1 |
| `anon` | sem grant SELECT | sem grant SELECT |

O smoke também confirmou uma linha afetada em cada operação sensível que
depende de visibilidade para `RETURNING`: INSERT de venda/item com
`mesas.fechar`, UPDATE de venda e DELETE de item/venda com `pdv.cancelar`.

Depois de aplicar `20260813091000`, a matriz obrigatória foi repetida com:
titular, fixture no cargo atual, somente `pedidos.acessar`, `pdv.acessar`,
`mesas.acessar`, `caixa.ver`, `relatorios.ver`, `fiado.visualizar`, subusuário
bloqueado, super-admin externo, `service_role` e ausência de grant para
`anon`. Os cinco casos de write/`RETURNING` acima também passaram novamente.
Após o rollback, o cargo permanente voltou a `active` com suas permissões
originais e zero fixtures `audit-sales-history-*` permaneceram.

## Desempenho da policy final

- Antes da companion, um `EXPLAIN ANALYZE` representativo de
  `count(vendas_itens)` para o fixture autorizado levou 731,117 ms.
- O mesmo desenho final medido transacionalmente antes do deploy levou
  7,593 ms para 920 itens visíveis.
- Após o deploy, duas execuções por ator confirmaram: titular 347,966 ms em
  cache frio e 5,254 ms aquecido para 192 itens; subusuário apenas com
  `relatorios.ver` 20,096 ms frio e 6,478 ms aquecido para 920 itens.
- Para `vendas`, a segunda execução ficou em 0,305 ms para o titular e
  0,868 ms para o subusuário de Relatórios.

Os benchmarks foram executados dentro de transações com rollback. A latência
fria observada continua registrada como risco operacional; não foi adicionada
arquitetura de cache ou índice nesta contenção.

Validação de regressão após a aplicação:

- `npm test`: 104 arquivos, 647 testes aprovados (incluindo 16 asserts
  estruturais desta contenção);
- `npm run check`: 0 erros e 95 warnings preexistentes;
- `supabase db lint --linked --level error`: somente os dois erros antigos em
  `save_zelomenu_delivery_settings` e `criar_venda_completa`;
- security advisors: 44 warnings preexistentes e nenhum finding para as
  policies novas;
- `supabase db push --linked --dry-run`: banco remoto atualizado.

## Rollback

Não reescrever a migration aplicada. Se necessário, criar uma nova migration
forward-only com o snapshot exato anterior:

```sql
grant select on table public.vendas, public.vendas_itens
  to anon, authenticated;

alter policy vendas_actor_select
  on public.vendas
  to public
  using (get_owner_user_id(auth.uid()) = id_usuario);

alter policy vendas_itens_actor_select
  on public.vendas_itens
  to public
  using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_itens.id_venda
        and v.id_usuario = get_owner_user_id(auth.uid())
    )
  );
```

Nenhuma reescrita de dados é necessária.
