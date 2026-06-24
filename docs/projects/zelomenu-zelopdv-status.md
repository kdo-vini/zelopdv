# ZeloMenu no ZeloPDV — Status de Rollout

Data: 2026-06-24  
Autor: Verboo Code  
Formato: entregue vs pendente, riscos, regras de negócio

---

## Resumo Executivo

O ZeloMenu foi implementado como módulo adquirível no ZeloPDV (addon de R$40/mês) e também como capacidade obrigatória do ZeloChat (R$147) e do Bundle (R$197). Pedidos+Cozinha deixou de ser addon comercial separado — foi absorvido como motor interno pelo ZeloMenu.

---

## Entregue

### Pricing & Catálogo (`src/lib/pricing.js`)
- `ADDONS.menu`: preço R$40, Stripe `price_1TlbH4LUJWyE4PkYX0kdJhAw`, `setsEntitlement: 'has_zelo_menu'`
- `PLANS.pdv.allowsMenu: true` — PDV pode comprar Menu como addon
- `PLANS.chat.includesMenu: true` — Chat inclui Menu obrigatoriamente
- `PLANS.bundle.includesMenu: true` — Bundle inclui Menu
- `PLANS.bundle.allowsMenu: false` — não é addon comprável (já incluso)
- `addons.menu.allowsMenu` verificação de elegibilidade por plano

### Entitlements (`src/lib/guards.js`)
- `hasZeloMenuAccess(userId)`: chat/bundle sempre true; pdv precisa da flag `has_zelo_menu`
- `hasOrderingReviewAccess(userId)`: libera tela de pedidos se tem Menu OU pedidos legacy
- `hasKitchenQueueAccess(userId)`: libera cozinha se tem Menu, pedidos legacy OU mesas
- Todas resolvem sub-user ownership via `resolveSubscriptionUserId()`

### Stripe Webhook (`src/routes/api/billing/webhook/+server.js`)
- Define `has_zelo_menu` em `checkout.session.completed` e `customer.subscription.updated`
- chat/bundle → sempre true; pdv → true se menu addon presente

### Billing APIs
- **toggle-addon**: coluna `has_zelo_menu` mapeada para addon 'menu'
- **create-subscription**: valida `menu` addon, inclui em line items, metadata, subData e PostHog
- **change-plan**: remove `has_zelo_menu` ao trocar para plano incompatível
- **pix/create**: valida, serializa e persiste `has_zelo_menu`
- **pix status**: serializa `has_zelo_menu` na resposta
- **admin sync-plan**: mapeia `menu → has_zelo_menu` no ADDON_DB_COLUMN
- **admin update-user-subscription**: suporta `has_zelo_menu` no update

### Core Pix (`src/lib/server/billingPix.js`)
- `serializeBillingPayment()`: inclui `addons.menu`
- `activateSubscriptionFromPayment()`: persiste `has_zelo_menu`
- `findBillingPaymentForUser/ByProviderId()`: retorna `has_zelo_menu`

### Checkout (`/assinatura`)
- ZeloMenu no catálogo de addons (R$40/mês, com teaser e pain point)
- Pedidos+Cozinha removido do catálogo de addons para novas vendas
- ToggleAddonSelection, addonAvailable, addonSelected, calculateValue, forced-off: todos com menu
- Payload enviado para create-subscription e pix/create inclui `menu`
- Estado ativo (`activeMenuAddon`) lido de `has_zelo_menu`

### Gestão de Extensões (`/gestao/extensoes`)
- ZeloMenu como card principal no grid (preço R$40/mês, compatibilidade pdv/bundle)
- Requer `hasZeloMenuAccess` para mostrar como ativo
- Pedidos+Cozinha: só exibe se já estiver ativo (legado), com tagline "Legado — agora parte do ZeloMenu"
- Card "Em breve" removido (substituído pelo ZeloMenu)

### Produtos — Bulk Publish (`/gestao/produtos`)
- `hasZeloMenuAccess` gate: botão "Publicar no menu" só aparece se tem Menu
- Revalida o entitlement no clique antes de publicar
- Usa `publishProductsToZeloMenu()` com batch upsert em `zelomenu_product_publications`
- Falhas parciais permanecem selecionadas para nova tentativa
- Importa `publishProductsToZeloMenu` de `src/lib/zelomenuPublications.js`

### Publicação (`src/lib/zelomenuPublications.js`)
- `publishProductsToZeloMenu()`: upsert em lote, retorna publishedIds/failedIds/errors
- `unpublishProductsFromZeloMenu()`: update `visivel_online = false` em lote

### Admin Dashboard
- Flag `has_zelo_menu` editável na página de assinaturas
- Regra: chat/bundle sempre true, pdv respeita flag

### Documentação
- `docs/projects/zelomenu-linear-plan.md`: ZLM-201 (bulk publish), ZLM-205 (billing) atualizados
- `docs/CURRENT.md`: reflete estado atual do ZeloMenu
- `docs/FIXES_PROGRESS.md`: FX-ZELOMENU registrados
- `docs/data/SCHEMA_RLS.md`: schema de publicação documentado
- Testes: `tests/zelomenuPublications.test.js`, `tests/guards.zelomenu.test.js`, `tests/zelomenuPublicationSchema.test.js`

### Migrações
- `.ai/migrations/zelomenu_entitlement_and_slug_2026_06_23.sql` — `subscriptions.has_zelo_menu`, `empresa_perfil.zelomenu_slug`
- `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` — tabelas de publicação
- `.ai/migrations/zelomenu_pedido_status_sync_2026_06_23.sql` — sync de status
- `.ai/migrations/pedidos_origem_zelomenu_2026_06_23.sql` — origem zelomenu em pedidos

---

## Pendente / A Fazer

### ZeloMenu no Marketing (`/extensoes`)
- Adicionar ZeloMenu como card na landing page pública de extensões
- Adicionar seção detalhada de features, FAQ, depoimento
- Atualizar meta tags para incluir ZeloMenu
- Atualizar Pedidos+Cozinha para mencionar absorção pelo ZeloMenu
- (ticket de implementação em andamento via agente separado)

### Self-Service de Publicação
- Edição individual de nome público, descrição, foto e ordem no ZeloMenu
- Despublicação/pausa por produto individual (não apenas em lote)
- Gerenciamento de modificadores/grupos de opções na UI
- Preview do cardápio antes de publicar

### Consumo pelo Menu Público
- `menu.zelopdv.com.br/{slug}` — página pública
- Carrinho, confirmação e estados
- Integração com motor de pedidos

### Marketing Page de Extensões
- `src/lib/data/extensoes.js`: adicionar entrada `menu`
- `src/routes/extensoes/+page.svelte`: adicionar card ZeloMenu e atualizar Pedidos tagline
- `static/sitemap.xml`: adicionar `/extensoes#menu`
- Atualizar meta description

---

## Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Cliente legado com Pedidos+Cozinha perde acesso | Alto | Legacy `hasOrderingReviewAccess` e `hasKitchenQueueAccess` incluem `has_pedidos_addon` como fallback |
| Cliente com Mesas sem Menu perde cozinha | Médio | `hasKitchenQueueAccess` inclui `has_mesas_addon` como fallback |
| Cliente PDV + Chat + Menu paga dobrado | Médio | `bundle.allowsMenu: false` impede compra duplicada; sanitizeAddons() filtra addon não permitido |
| Casa dos Salgados com preço antigo | Baixo | Legacy price IDs mapeados para 'chat' no webhook; tratamento individual não no código |
| Sub-user não consegue publicar mesmo com Menu ativo | Baixo | `hasZeloMenuAccess` resolve ownerUserId corretamente |
| Admin dashboard não envia `addons.menu` no sync-plan | Baixo | Admin dashboard já envia `addons: { menu: editZeloMenuAddon }` |

---

## Regras de Negócio Não-Óbvias

### 1. Pedidos+Cozinha Legacy vs Novo Menu

| Cenário | hasOrderingReviewAccess | hasKitchenQueueAccess | hasZeloMenuAccess |
|---------|------------------------|----------------------|-------------------|
| PDV + Menu | true | true | true |
| PDV + Pedidos legacy | true | true | false |
| PDV + Mesas | false (sem guard na assinatura) | true (precisa para comanda) | false |
| PDV only | false | false | false |
| Bundle | true | true | true |
| Chat | true | true | true |

O ZeloMenu **não substitui** Pedidos+Cozinha no banco — clientes legados mantêm `has_pedidos_addon`. As guards de UI aceitam qualquer um dos dois.

### 2. Mesas não libera Menu automaticamente

Ter Mesas addon ativo **não** concede `has_zelo_menu`. São addons independentes. A única interseção é que `hasKitchenQueueAccess` considera Mesas como fallback (porque uma comanda precisa de cozinha).

### 3. ZeloMenu não é vendido como produto standalone

ZeloMenu requer uma base operacional: ZeloPDV ou ZeloChat. Não existe subscription com `plan_tier: 'menu'`. É sempre um addon sobre um plano base.

### 4. Chat e Bundle incluem Menu, não compram como addon

Para chat/bundle, `has_zelo_menu` é sempre true independente de qualquer flag. O webhook forja o valor. A UI não mostra opção de desligar.

### 5. Coluna `has_zelo_menu` vs `has_pedidos_addon`

São flags independentes. `has_zelo_menu` é a flag moderna de entitlement do ZeloMenu. `has_pedidos_addon` é legacy de quando Pedidos+Cozinha era addon separado. Clientes com `has_pedidos_addon` ativo continuam operacionais, mas não ganham `has_zelo_menu` automaticamente.

### 6. Preço do módulo Menu no PDV: R$40

PDV (R$59) + Menu (R$40) = R$99. Se houver outros addons (Mesas +R$30, Acessos +R$30), cada um soma independentemente. Não há bundling forçado.

---

## Comercial: Planos e Preços

| Plano | Preço | Inclui Menu? | Pode comprar Menu? |
|-------|-------|--------------|-------------------|
| ZeloPDV | R$59 | Não | Sim (+R$40, total R$99) |
| ZeloChat | R$147 | Sim | Não (já incluso) |
| Bundle | R$197 | Sim | Não (já incluso) |

Addons disponíveis:
- Mesas: +R$30/mês (qualquer plano com PDV)
- ZeloMenu: +R$40/mês (apenas plano com PDV)
- Acessos: +R$30/mês (qualquer plano com PDV)
- Pedidos+Cozinha: +R$30/mês (apenas legado — não vendido como novo)

---

## Arquivos Alterados (2026-06-24)

### Backend (Billing API)
- `src/lib/pricing.js` — ADDONS.menu, PLANS flags
- `src/lib/guards.js` — hasZeloMenuAccess, hasOrderingReviewAccess, hasKitchenQueueAccess
- `src/lib/zelomenuPublications.js` — publishProductsToZeloMenu, unpublishProductsFromZeloMenu
- `src/lib/server/billingPix.js` — serialize/activate/find com has_zelo_menu
- `src/routes/api/billing/toggle-addon/+server.js` — ADDON_DB_COLUMN para menu
- `src/routes/api/billing/create-subscription/+server.js` — validação e payload menu
- `src/routes/api/billing/change-plan/+server.js` — removedAddons para menu
- `src/routes/api/billing/webhook/+server.js` — has_zelo_menu no sync
- `src/routes/api/billing/pix/create/+server.js` — validação e INSERT com menu
- `src/routes/api/admin/billing/sync-plan/+server.js` — ADDON_DB_COLUMN para menu
- `src/routes/api/admin/billing/update-user-subscription/+server.js` — has_zelo_menu

### Frontend
- `src/routes/assinatura/+page.svelte` — menu addon no checkout
- `src/routes/gestao/extensoes/+page.svelte` — ZeloMenu card, Pedidos legado
- `src/routes/gestao/produtos/+page.svelte` — bulk publish gate

### Documentação
- `docs/projects/zelomenu-linear-plan.md` — ZLM-201, ZLM-205 atualizados
- `docs/projects/zelomenu-zelopdv-status.md` — este documento
