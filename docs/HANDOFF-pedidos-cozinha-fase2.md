# HANDOFF: aposentadoria do módulo Pedidos + Cozinha

> Escrito em 2026-07-28. A fase 1 está commitada em `8945f17`; a fase 2 foi executada em produção e publicada no merge `5a6f45a3`. Este documento agora serve como registro de execução e dos testes funcionais ainda pendentes.
> Docs relacionadas: [[CURRENT]] · [[FIXES_PROGRESS]] · [[BILLING]] · [[ZeloPDV.memory]]

---

## Atualizacao da retomada (2026-07-28)

- ZeloMenu e ZeloChat ja foram mergeados em producao e passaram o soak inicial; os commits e evidencias estao em `docs/operations/PEDIDOS-COZINHA-PREFLIGHT-2026-07-28.md`.
- O preflight sanitizado foi concluido: 3 pedidos, 5 itens, R$ 65 em subtotais e nenhuma venda vinculada.
- O projeto tem backup fisico recente, mas `pitr_enabled=false`; o dump SQL completo nao foi capturado porque o CLI exigiu Docker Desktop.
- O DDL foi executado em duas transacoes no projeto linkado, com backup fisico existente; as assercoes de schema e ACL passaram.
- O PR #27 foi mergeado em `5a6f45a3` e esta em producao; `/api/version` confirma esse commit. As rotas dependentes do schema retornam 200 e o endpoint de cozinha sem bearer retorna 401.
- Nao ha credenciais E2E nem tenant descartavel configurado. Um smoke transacional com rollback passou 3/3 (cancelamento de item de comanda, entrega sem venda e bloqueio de fechamento); `delete_account` real continua pendente.

## To-do executivo (atualizado em 2026-07-28)

- [x] Reconciliar o estado local: a fase 1 está no commit `8945f17` e o `HEAD` atual está em `main`/`origin/main`; a branch de trabalho da fase 2 é `codex/fase2-pedidos-cozinha`.
- [x] Confirmar por leitura local e no schema real que `billing_payments.has_pedidos_addon` não tem consumidor runtime; os usos restantes estão em fixtures/documentação.
- [x] Especificar o contrato canônico de `source='mesa'` para QR público e comanda, incluindo idempotência, ownership, estoque, cancelamento e fechamento financeiro. O QR consome estoque no aceite; o item já reservado pela comanda leva `fulfillment.comandaItemId` e não sofre baixa/restauração duplicada.
- [x] Ajustar e testar ZeloMenu, incluindo a cópia órfã de `delivery-frontend`, para parar de selecionar `subscriptions.has_pedidos_addon` e materializar `table_order` em `zelo_orders`. ZeloMenu passou `typecheck` e 262 testes; a cópia órfã recebeu o mesmo ajuste.
- [ ] Capturar export sanitizado, DDL das funções/views/policies e janela de PITR antes do ponto de não retorno.
- [x] Preparar e executar as migrations transacionais revisadas que removem `pedidos`, `pedido_itens`, `proximo_numero_pedido`, `subscriptions.has_pedidos_addon` e `billing_payments.has_pedidos_addon` na ordem correta. As duas transações passaram e as asserções de schema/ACL foram aprovadas.
- [x] Deployar os consumidores cross-repo, aguardar soak e só então executar DDL em produção. ZeloMenu e ZeloChat foram publicados antes do DDL; o ZeloPDV foi publicado depois.
- [ ] Validar entitlement, QR público, comanda/cozinha, estoque, ausência de venda duplicada e deleção de conta. O entitlement/QR e o caminho canônico de produção já passaram verificações técnicas; falta apenas exercitar `delete_account` com conta descartável.
- [x] Reconciliar tecnicamente a assinatura `d5625be9`: o valor atual é R$258 e bate com bundle R$198 + Mesas R$30 + Acessos R$30; o `has_pedidos_addon` antigo aparece só como flag histórica nos logs, não como componente do preço atual.
- [ ] Decisão humana sobre eventual crédito/estorno ou retirada de algum add-on da assinatura `d5625be9`; não há evidência suficiente para alterar cobrança automaticamente.

> Decisão do dono do produto: o snapshot financeiro histórico de `billing_payments.has_pedidos_addon` não precisa ser preservado; a coluna entra no escopo de remoção, sem apagar os demais registros de cobrança.

> Validação cross-repo: ZeloPDV passou 441/441 e os testes direcionados da fase 2 passaram 11/11; ZeloMenu passou typecheck, build e 262/262; ZeloChat passou lint e os testes direcionados. A suíte completa do ZeloChat tem uma falha preexistente fora deste diff em `tests/zelomenuSlug.test.ts` (expectativa `/menu/:slug` contra runtime `/:slug`).

## 0. LEIA ISTO PRIMEIRO: correção de uma conclusão anterior

Eu havia concluído que o branch `else` de `public.confirm_zelomenu_cart` (que insere em `pedidos`/`pedido_itens`) era **código morto**, com base em: 49 sessões de carrinho confirmadas, nenhuma com `metadata->>'productionOrderId'` apontando para `pedidos`, e zero linhas em `pedidos` com `origem='zelomenu'`.

**Essa conclusão está errada e não deve ser usada como base para dropar a tabela.**

Duas frentes de investigação independentes acharam que o branch é **alcançável e está vivo**: o ZeloMenu tem rota pública `/:slug/mesa/:mesaId` (contexto `table_order`) que despacha para contexto diferente de `public_order` e portanto cai nesse `else`. A evidência que eu tinha prova que o caminho **nunca disparou ainda**, não que ele não exista. Dropar `pedidos` sem tratar isso quebra o pedido por QR code na mesa do ZeloMenu em runtime.

Consequência prática: **existem 2 bloqueadores cross-repo, não 1.**

---

## 1. Estado atual

### Fase 1 (código) — pronta, validada e commitada

O add-on legado "Pedidos + Cozinha" saiu inteiro do código do ZeloPDV no commit `8945f17`, que já está em `origin/main`. Detalhe completo em [[CURRENT]], entrada "Módulo Pedidos + Cozinha aposentado (2026-07-28)".

Validação na minha última execução:

| Comando | Resultado |
| --- | --- |
| `npm test` | 438/438; a suíte adicional da fase 2 passou 10/10 |
| `npm run check` | 0 erros / 96 avisos (baseline exata) |
| `cd admin-dashboard && npm run build` | OK |
| `npm run build` | bundles compilam; falha no adapter Vercel por `EPERM` de symlink, limitação conhecida deste clone Windows |

### ⚠️ O working tree está contaminado com trabalho de outras sessões

O inventário abaixo é o estado histórico da sessão anterior. No estado observado ao iniciar esta retomada, os arquivos fora da fase 2 eram `docs/CURRENT.md`, `docs/FIXES_PROGRESS.md`, `docs/data/SCHEMA_RLS.md`, `src/lib/data/extensoes.js`, `src/routes/extensoes/+page.svelte`, `src/themes/base.css` e `static/images/brands/`. A fase 1 já está commitada e não precisa ser separada com `git add -p`.

Antes de novos commits, **separe** as alterações de marketing. Estes arquivos não são da aposentadoria, são de sessões de marketing do mesmo dia (FX-MKT-03 a FX-MKT-06):

```
src/routes/+page.svelte
src/lib/components/marketing/SiteHeader.svelte
src/lib/components/marketing/MarketingFooter.svelte
src/lib/data/extensoes.js          (contaminado: tem MINHAS mudanças E as de marketing)
docs/CURRENT.md                    (idem)
docs/FIXES_PROGRESS.md             (idem)
static/og-image-home.png|svg       (untracked)
static/images/landing/             (untracked)
```

`src/lib/data/extensoes.js`, `docs/CURRENT.md` e `docs/FIXES_PROGRESS.md` têm as duas coisas misturadas. Use `git add -p` nesses três.

Arquivos que **são** da aposentadoria (commit desta task):

```
src/lib/pricing.js
src/lib/guards.js
src/lib/server/accessControl.js
src/lib/server/billingPix.js
src/lib/server/emailTemplates.js
src/lib/components/GestaoSidebar.svelte
src/lib/components/InAppSupportChat.svelte
src/lib/components/UpdateAvailable.svelte
src/lib/data/competitorComparisons.js
src/routes/api/access/users/+server.js
src/routes/api/billing/{create-subscription,webhook,toggle-addon,change-plan,pix/create}/+server.js
src/routes/api/admin/billing/{sync-plan,update-user-subscription,pix/create}/+server.js
src/routes/api/chat/support/+server.js
src/routes/app/pedidos/+page.svelte
src/routes/app/pedidos/cozinha/+page.svelte
src/routes/app/pedidos/novo/                   (DELETADO)
src/routes/app/pedidos/[id]/editar/            (DELETADO)
src/routes/app/mesas/[id]/+page.svelte
src/routes/assinatura/+page.svelte
src/routes/gestao/+page.svelte
src/routes/gestao/acessos/+page.svelte
src/routes/gestao/extensoes/+page.svelte
src/routes/perfil/+page.svelte
src/routes/relatorios/+page.svelte
admin-dashboard/src/lib/pricing.js
admin-dashboard/src/routes/{,subscriptions/,users/}+page.svelte
tests/{guards.zelomenu,api.create-subscription,api.billing-pix-status}.test.js
e2e/access-control.subusers.spec.js
e2e/helpers/access-control-fixtures.js
docs/BILLING.md
docs/marketing/PUBLIC_ROUTES.md
docs/ZeloPDV.memory.md
docs/projects/zelomenu-zelopdv-status.md       (banner de obsolescência)
```

O trabalho desta retomada está em `codex/fase2-pedidos-cozinha`; branches homônimas foram criadas em `zelomenu` e `zelochat`. O marketing permanece misturado nos arquivos listados acima; antes de commitar, use `git add -p` nesses arquivos e não reverta alterações de terceiros.

---

## 2. Fase 2 (banco): ordem obrigatória

DDL no Postgres é transacional, mas a ordem entre repos não é. Siga literalmente.

### Passo 0 — Commitar e deployar a fase 1 (RISCO ALTO se pular)

O commit `8945f17` já está em `origin/main`, mas o deploy/soak ainda precisa ser confirmado. Se a migration rodar antes de esse build estar no ar, uma instância antiga ainda pode consultar a tabela inexistente. Deploy da fase 1 **vem antes** de qualquer DDL.

Depois do deploy, confirme no ar: `/app/pedidos`, `/app/pedidos/cozinha`, `/relatorios`.

### Passo 1 — Export dos dados (somente leitura, faça antes de tudo)

3 linhas em `pedidos`, 5 em `pedido_itens`, soma R$ 65, nenhuma virou venda, mais recente 2026-07-11.

Recomendação da frente de dados: **dois `\copy` para CSV fora do banco**, com `nome_cliente` e `observacoes` substituídos por booleanos (minimização GDPR). **Não** criar tabela de arquivo dentro do banco.

Capture também o DDL do que vai cair, para tornar os drops reversíveis:
`pg_get_functiondef` de `delete_account`, `confirm_zelomenu_cart`, `proximo_numero_pedido`; `pg_get_viewdef` de `user_entitlements`; definição das policies `pedidos_actor` e `pedido_itens_actor`.

Confirme também a janela de PITR/backup do projeto `xnnjyrblpvsqrtsshawa`.

### Passo 2 — Bloqueador cross-repo 1: ZeloMenu, o `.select()`

Arquivo: `~/orca/zelomenu/src/hooks/useZeloMenuEntitlement.ts`
- linha 64: remover `has_pedidos_addon` do `.select()` de `subscriptions`
- linha 20: remover o campo do tipo `ZeloMenuSubscription`
- linha 91: remover `hasPedidosAddonLegacy: subscription?.has_pedidos_addon ?? undefined`

É o **único** consumidor real encontrado nos repos irmãos. O ZeloChat **não** lê a coluna nos call sites verificados e seu resolver/teste legado também foi removido nesta retomada.

Existe uma **cópia órfã** em `~/orca/workspaces/zelomenu/delivery-frontend/src/hooks/useZeloMenuEntitlement.ts` com o mesmo select. Verifique se está em produção antes de ignorar.

Deploy: branch `master` do repo `zelomenu` (`github.com/kdo-vini/zelomenu`), push em master dispara Dokploy. Depois do deploy, deixe uma **janela de soak** para abas antigas: o painel `/admin` é SPA e `public/sw.js` não tem handler de fetch, então aba aberta continua com o bundle velho até recarregar.

### Passo 3 — Bloqueador cross-repo 2: o fluxo `table_order` (ver seção 0)

Decida o destino da rota pública `/:slug/mesa/:mesaId` do ZeloMenu antes de dropar `pedidos`. Duas saídas:

**(a) Bloquear o fluxo:** impedir `context='table_order'` na abertura da sessão no ZeloMenu, e/ou fazer `confirm_zelomenu_cart` levantar erro explícito (`TABLE_ORDER_NOT_SUPPORTED`) no lugar do `else`.

**(b) Migrar o fluxo para o motor canônico**, que é a mesma solução do `source='mesa'` da seção 3. Esta é a saída implementada, porque o pedido por QR code na mesa e o "Enviar pra cozinha" da comanda são o mesmo problema de negócio.

### Passo 4 — Reescrita das funções (antes dos drops)

Use **`CREATE OR REPLACE FUNCTION`**, nunca `DROP` + `CREATE`. Motivo (risco alto identificado): `DROP`+`CREATE` perde o ACL restrito atual e reabre `EXECUTE` para `anon`/`authenticated`. Preserve owner, `search_path`, `SECURITY DEFINER` e assinatura exatos.

1. `confirm_zelomenu_cart(uuid,text,integer,text)`: remover/substituir o branch `else` (linhas ~74-85) que chama `proximo_numero_pedido` e insere em `pedidos`/`pedido_itens`, conforme a decisão do Passo 3.
2. `delete_account(uuid,text)`: remover a linha 43, `delete from pedidos where id_usuario = p_user_id;`. Manter a ordem restante.

Armadilha de ordem, com risco alto nos dois sentidos:
- trocar `delete_account` **antes** dos drops deixa órfãs as linhas dos 2 donos que têm registro em `pedidos`;
- dropar as tabelas **antes** de trocar `delete_account` quebra deleção de conta para **todos** os usuários (plpgsql resolve a relação em tempo de execução).

Solução: `CREATE OR REPLACE` de `delete_account` **e** os `DROP TABLE` numa **única transação** (`BEGIN; ... COMMIT;`).

Rode smoke test de `delete_account` logo após o COMMIT, com usuário de teste que tenha vendas e comandas. Idealmente num branch do Supabase, não em produção.

### Passo 5 — Drops (ponto de não retorno)

```
DROP POLICY pedido_itens_actor ON public.pedido_itens;   -- opcional, o DROP TABLE já remove
DROP POLICY pedidos_actor ON public.pedidos;
DROP TABLE public.pedido_itens;   -- ANTES de pedidos: FK pedido_itens_id_pedido_fkey
DROP TABLE public.pedidos;        -- sem CASCADE após o passo acima
DROP FUNCTION public.proximo_numero_pedido(uuid);
```

`proximo_numero_pedido` só tinha um chamador restante, o branch removido no Passo 4. Efeito colateral positivo: ela hoje tem `EXECUTE` concedido a `anon`.

### Passo 6 — View e coluna (só depois do deploy do Passo 2)

Numa única transação:
```
BEGIN;
DROP VIEW public.user_entitlements;
CREATE VIEW public.user_entitlements ... ;   -- sem has_pedidos_addon, reaplicando os 28 grants
ALTER TABLE public.subscriptions DROP COLUMN has_pedidos_addon;
COMMIT;
```
A view é o **único** objeto do banco que depende da coluna (confirmado por `pg_depend`).

### Passo 7 — Limpeza do resolver (depois do drop, sem acoplamento a deploy)

Mesmo diff nas **duas** cópias: `~/orca/zelomenu/src/domain/zelomenuEntitlements.ts` e `~/orca/zelochat/src/domain/zelomenuEntitlements.ts`. Ajustar também os testes das duas (em `zelomenu`, o caso das linhas 42-48).

### Objetos que permanecem

- **`billing_payments.has_pedidos_addon`**: removida por decisão do dono do produto. Não precisamos preservar esse snapshot financeiro legado; nenhum runtime atual lê a coluna. A migration deve removê-la sem apagar os demais registros ou campos de `billing_payments`.
- **`admin_activity_logs`**: não tocar. Em vez disso, documentar a data de aposentadoria e o significado da flag legada.

### Verificação pós-migration

`npm test` e `npm run check` no zelopdv; exercitar `/app/pedidos` e `/app/pedidos/cozinha`; confirmar um carrinho `public_order` do ZeloMenu de ponta a ponta; confirmar deleção de conta; confirmar entitlement do ZeloMenu no painel `/admin`.

---

## 3. `source='mesa'`: contrato implementado e DDL executada

O botão "Enviar pra cozinha" das Mesas foi removido na fase 1. Restaurá-lo apontando para o motor canônico **como está hoje causa baixa dupla de estoque e cobrança dupla**. Confirmado por mim no banco:

- `comanda_aplicar_delta_item` já decrementa `produtos.estoque_atual` e `categorias.estoque_compartilhado_atual` quando o item entra na comanda.
- `transition_zelo_order` decrementa **de novo** no `accepted` (linhas 79-132), estampando `stock_committed_at`.
- Trigger `zelo_order_sale_on_deliver` em `zelo_orders` chama `ensure_zelo_order_sale`, criando venda própria que a mesa cobraria outra vez no fechamento.

O contorno sem DDL (`source='manual'` + `product_id` nulo) foi **rejeitado**: perde o vínculo do bilhete com o produto e não fecha o buraco no ZeloChat, que também consome `zelo_orders`.

**Decisão do dono do produto:** adicionar `'mesa'` ao `CHECK` de `zelo_orders.source` (hoje `zelomenu|zelochat|manual|legacy_zelochat|legacy_pedido`) e preservar duas modalidades no mesmo source:

1. QR público (`table_order`): `stock_committed_at` nasce nulo e o bloco de `accepted` baixa estoque como nos demais pedidos online;
2. item da comanda enviado pelo PDV: o endpoint server-side valida owner/comanda/mesa/produto, usa chave `mesa:<comandaId>:item:<itemId>` e envia `comandaItemId`; `create_zelo_order` marca o estoque como já reservado;
3. cancelamento só restitui estoque quando o pedido mesa não carrega `comandaItemId`, evitando devolver estoque que continua sob responsabilidade da comanda;
4. `ensure_zelo_order_sale` retorna sem venda e `close_zelo_order` rejeita `source='mesa'`; a receita continua sendo criada pelo fechamento da comanda.

Na revisão do plano, entram mais dois guardrails obrigatórios:

3. o bloco de **restituição de estoque no `cancelled`** não pode devolver estoque que continua sob responsabilidade da comanda;
4. `close_zelo_order` não pode ser uma porta alternativa para cobrança de pedidos `source='mesa'`.

Assim a comanda segue dona do estoque e da receita, e o ZeloMenu só exibe o pedido na tela da cozinha.

**Isto atende também o Passo 3** (fluxo `table_order` do ZeloMenu). Trate como uma coisa só.

O SQL está em `.ai/migrations/pedidos_cozinha_source_mesa_and_drop_2026_07_28.sql`; o endpoint server-side está em `src/routes/api/mesas/cozinha/+server.js` e a UI foi restaurada em `src/routes/app/mesas/[id]/+page.svelte`. O endpoint deriva `empresa_id` do owner autenticado, nunca do cliente. `create_zelo_order` continua restrita a `service_role`/`postgres`.

O endpoint tem cobertura de 4 cenários de autenticação, autorização, escopo e fechamento; a migration tem 4 testes estruturais adicionais. Ainda falta teste real de ponta a ponta contra a base de staging/produção.

---

## 4. Item aberto de cobrança (decisão humana, não automatizar)

Assinatura `d5625be9` (prefixo do usuário): `monthly_value_cents = 25800`, ou seja R$ 258/mês. O catálogo vigente soma R$ 258 (bundle 198 + Mesas 30 + Acessos 30). O `has_pedidos_addon=true` aparece nos logs administrativos como flag histórica, mas não explica um excedente no `monthly_value_cents` atual. Stripe não retornou assinatura ativa para o `provider_customer_id`; a linha atual foi mantida manualmente no Supabase.

Não foi tocado de propósito. Conferir no provedor antes da próxima renovação. Mudança de cobrança, estorno ou crédito **é decisão humana**, nunca execução automática.

---

## 5. Decisões a preservar (não "consertar" por engano)

- **Chaves de permissão `pedidos.*` ficam com o prefixo antigo.** Estão persistidas no JSON de `access_roles`; renomear apaga silenciosamente a permissão de subusuários já cadastrados. Só os rótulos mudaram. `pedidos.criar` saiu da matriz e do cargo Atendente porque a capacidade não existe mais.
- **Rotas `/app/pedidos` e `/app/pedidos/cozinha` mantêm o nome.** Servem o ZeloMenu agora; renomear quebraria bookmarks, docs e o contrato de impressão.
- **`onlineOrders.js` continua emitindo `pedido_itens`, `enviado_cozinha` e `status_cozinha`** como shape de adaptador. Não são acesso a tabela; é o vocabulário compartilhado com `orderPrint.js` e com o contrato `kitchen_order` do ZeloChat. Renomear é refactor separado e arriscado.
- **Cozinha é exclusiva do ZeloMenu.** `hasKitchenQueueAccess` perdeu o fallback por `has_mesas_addon` (D-100 revogado nessa parte). Guardrail em `tests/guards.zelomenu.test.js` falha se ela divergir de `hasOrderingReviewAccess`.
- **Comentários que documentam a aposentadoria** em `guards.js:312`, `pricing.js:106`, `emailTemplates.js:246` e no prompt do suporte são intencionais, não resíduo.
- **Guards de regressão** em `tests/pricing.acessos.test.js` e `tests/emailTemplates.extensoes.test.js` citam "pedidos" de propósito: garantem que o add-on não volte a ser vendido.

---

## 6. Artefatos e comandos

Investigação completa das 4 frentes do workflow (a autoria, os céticos e a síntese falharam por limite de gastos da org):

```
Journal bruto:  C:\Users\Vinicius\.claude\projects\C--Users-Vinicius-orca-zelopdv\3e592124-2ec2-4041-a6a2-3925dc842ce7\subagents\workflows\wf_df06107a-3da\journal.jsonl
Digest extraído: C:\Users\Vinicius\.claude\projects\C--Users-Vinicius-orca-zelopdv\3e592124-2ec2-4041-a6a2-3925dc842ce7\tool-results\br73qagnl.txt
Script do workflow: C:\Users\Vinicius\.claude\projects\C--Users-Vinicius-orca-zelopdv\3e592124-2ec2-4041-a6a2-3925dc842ce7\workflows\scripts\fase2-aposentar-pedidos-db-wf_df06107a-3da.js
```

Para retomar o workflow de onde parou (as 4 frentes voltam do cache, só a autoria em diante roda):
```
Workflow({ scriptPath: '<script acima>', resumeFromRunId: 'wf_df06107a-3da' })
```

Validação:
```
npm test                              # esperado 430/430
npm run check                         # esperado 0 erros / 96 avisos
cd admin-dashboard && npm run build   # OK
```

Banco (projeto linkado `xnnjyrblpvsqrtsshawa` = ZeloPDV produção):
```
supabase db query --linked "SELECT ..."
```
Ao consultar, use contagens e prefixos de id (`left(id::text,8)`). Nunca extraia nome, e-mail, telefone ou documento de cliente para log ou doc.
