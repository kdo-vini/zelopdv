# Leitura dos pedidos canônicos — RBAC — 2026-08-13

## Estado de produção verificado antes da mudança

As três tabelas canônicas foram revalidadas diretamente no catálogo linked
antes de qualquer alteração:

- `public.zelo_orders`, `public.zelo_order_items` e
  `public.zelo_order_events` pertencem a `postgres`, têm RLS ligado e
  `FORCE RLS` desligado;
- cada tabela tem exatamente uma policy permissiva de `SELECT`, com o papel
  `authenticated`, e nenhuma policy permissiva adicional de `SELECT` ou
  `ALL`;
- as policies antigas limitam somente ao tenant retornado por
  `get_owner_user_id(auth.uid())`; elas não verificam capabilities;
- ACL idêntica nas três tabelas:
  `postgres=arwdDxtm`, `service_role=arwdDxtm`, `authenticated=r`, sem ACL por
  coluna e sem grant para `anon`;
- `zelo_orders` está na publication `supabase_realtime`, com suas 25 colunas e
  sem filtro; items e events não estão publicados;
- existem 572 events, sem órfãos e sem divergência entre o `empresa_id` do
  event e o da ordem-pai.

As definições e ACLs das RPCs canônicas foram fotografadas antes da mudança.
Esta migration não as altera:

| Função | MD5 de `pg_get_functiondef` |
| --- | --- |
| `accept_zelo_order(uuid,integer,uuid)` | `4be03a0fd64dc614dbf713f976c5185d` |
| `close_zelo_order(uuid,integer,jsonb,uuid)` | `879857cca0faa31ab41a0c50ff893f69` |
| `create_zelo_order(uuid,integer,text,jsonb)` | `bd809a61d07248b077a47dc84530624f` |
| `reject_zelo_order(uuid,integer,uuid,text)` | `1fe0e282f62d1bc82bddafe52a7825f1` |
| `transition_zelo_order(uuid,integer,text,uuid,jsonb)` | `b78318bdaad53d8c74f45d6dfe0483de` |
| `zelo_order_has_permission(uuid,text)` | `baef0a2e58a7501d485bc180f1331c49` |

As quatro RPCs de ação já expostas ao browser continuam executáveis por
`authenticated` e `service_role`; `create_zelo_order` e o helper interno
continuam somente para `service_role`. Owner, `SECURITY DEFINER` e
`search_path` permanecem inalterados.

## Confirmação test-first

O verificador transacional
`supabase/verification/canonical_orders_select_rbac_authz.sql` usa somente
fixtures sintéticas e termina em `ROLLBACK`. Antes da migration, um papel
`pedidos.receber` sem capability de leitura viu 5 orders, 1 item e 3 events,
quando o contrato esperado era zero. Isso confirmou que qualquer subusuário
ativo do tenant conseguia ler customer, payment, fulfillment, totais, itens e
histórico de estado.

Após a reprodução e os benchmarks, foram confirmados zero usuários, empresas,
orders e roles de fixture persistidos.

## Consumidores e blast radius

Consumidores browser-side autenticados:

- ZeloPDV: helper `src/lib/onlineOrders.js`, fila `/app/pedidos` protegida por
  `pedidos.acessar`, cozinha `/app/pedidos/cozinha` protegida por
  `pedidos.cozinha` e a consulta auxiliar de Mesas usada somente com
  `pedidos.cozinha`;
- ZeloChat: hook do owner para lista, polling, impressão automática e Realtime,
  além das métricas do próprio owner.

Consumidores server-side usam `service_role`: criação de pedido de Mesa no
ZeloPDV e os fluxos canônicos do ZeloChat/ZeloMenu. Não foi encontrado leitor
runtime direto de `zelo_order_events`; a tabela permanece como auditoria do
motor canônico. Não há consumidor cron ou administrativo dependente do acesso
browser amplo.

Distribuição agregada em produção antes da mudança: 9 cargos, 5 com
`pedidos.acessar` ou `pedidos.cozinha`, 4 sem nenhuma capability de pedidos e
zero cargos somente de ação. Há 3 subusuários ativos reais sem capability de
leitura; nenhum consumidor legítimo identificado depende desse acesso.

| Ator | Comportamento esperado após contenção |
| --- | --- |
| anon | sem grant/sem leitura |
| autenticado externo ao tenant | zero linhas |
| owner ZeloPDV/ZeloChat | leitura integral preservada |
| subusuário com `pedidos.acessar` | orders, items e events preservados |
| subusuário com `pedidos.cozinha` | orders, items e events preservados |
| subusuário somente `pedidos.receber` | leitura direta negada; ação `deliver` preservada |
| subusuário somente `pedidos.cancelar` | leitura direta negada; ação `cancel` preservada |
| subusuário ativo sem capability de leitura | zero linhas |
| subusuário removido | zero linhas |
| super-admin externo | zero linhas; sem bypass de tenant |
| service role | leitura e fluxos server-side preservados |

`pedidos.cozinha` ainda recebe todas as colunas da ordem porque o consumidor
atual seleciona a linha completa. Restringir colunas exigiria mudar o contrato
de aplicação e fica explicitamente fora desta contenção. A migration não muda
grants, RPCs de ação, publication, billing, vendas/offline, Mesa ou UI.

## Menor correção

A migration forward-only
`20260813094000_canonical_orders_select_rbac.sql` altera somente os `USING` das
três policies existentes:

- a ordem-pai exige o mesmo tenant e owner ou papel ativo com
  `pedidos.acessar` ou `pedidos.cozinha`;
- items herdam a visibilidade da ordem-pai;
- events herdam a visibilidade da ordem-pai e confirmam o mesmo `empresa_id`.

A consulta de permissão é um subplano não correlacionado, executado uma vez por
statement. Ela não chama helper `SECURITY DEFINER` por linha. No estado anterior,
uma leitura autorizada de 1.000 orders levou 1,438 ms. Depois da aplicação, a
mesma leitura levou 1,852 ms: acréscimo absoluto de 0,414 ms, com a capability
executada como `InitPlan` uma vez por statement. O ensaio prévio de papel não
autorizado levou 1,597 ms e ainda retornou as 1.000 linhas, confirmando o
vazamento.

## Verificação

- [x] teste estático falhou antes de existir a migration e passou depois;
- [x] catálogo, policies, ACLs, functions e publication fotografados live;
- [x] reprodução linked pré-mudança confirmou o bypass com `ROLLBACK`;
- [x] benchmark linked pré-mudança registrado e resíduos zerados;
- [x] baseline PG17 descartável permaneceu idêntico à produção no cutoff;
- [x] migrations forward-only `092000`, `093000` e `094000` e as três matrizes
  transacionais passaram no banco descartável;
- [x] revisão independente sem achados obrigatórios;
- [x] dry-run linked mostrou somente `094000` pendente;
- [x] apply linked da migration;
- [x] matriz linked pós-mudança para todos os atores e ações;
- [x] Data API nested select e Realtime para owner, acesso/cozinha e bloqueado;
- [x] benchmark, catálogo, ACLs, functions, publication e resíduos pós-mudança;
- [x] suíte completa e typecheck: 106 arquivos/654 testes, 0 erros e 95
  warnings preexistentes;
- [x] lint/security checks e migration dry-run final: banco remoto alinhado;
  lint reproduziu somente os dois erros preexistentes em
  `criar_venda_completa` e `save_zelomenu_delivery_settings`; advisors foram
  executados e nenhum objeto desta migration adicionou finding novo.

O primeiro ensaio Realtime não recebeu eventos para nenhum ator, inclusive o
owner. A causa foi isolada no próprio probe: ele assinava imediatamente após
`signInWithPassword` e disputava com a atualização assíncrona do token do
cliente Node. O ensaio repetido aguardando explicitamente
`realtime.setAuth(session.access_token)` passou para owner,
`pedidos.acessar` e `pedidos.cozinha`, negou o papel action-only e confirmou
Data API nested e zero resíduo. Nenhum código de aplicação foi alterado por
esse ajuste de teste.

## Rollback

Rollback nunca edita a migration aplicada. Criar uma nova migration
forward-only que restaure literalmente os três `USING` congelados no baseline
`supabase/baselines/20260813091000/schema.sql`:

```sql
alter policy zelo_orders_owner_select on public.zelo_orders
  to authenticated
  using (
    empresa_id in (
      select ep.id
      from public.empresa_perfil ep
      where ep.user_id = public.get_owner_user_id(auth.uid())
    )
  );

alter policy zelo_order_items_owner_select on public.zelo_order_items
  to authenticated
  using (
    exists (
      select 1
      from public.zelo_orders o
      where o.id = zelo_order_items.order_id
        and o.empresa_id in (
          select ep.id
          from public.empresa_perfil ep
          where ep.user_id = public.get_owner_user_id(auth.uid())
        )
    )
  );

alter policy zelo_order_events_owner_select on public.zelo_order_events
  to authenticated
  using (
    empresa_id in (
      select ep.id
      from public.empresa_perfil ep
      where ep.user_id = public.get_owner_user_id(auth.uid())
    )
  );
```

Esse rollback reabre deliberadamente a leitura ampla confirmada e só deve ser
usado emergencialmente enquanto um consumidor inesperado é investigado.
