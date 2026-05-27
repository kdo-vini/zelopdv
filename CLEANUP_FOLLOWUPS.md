# Cleanup follow-ups — ZeloPDV

Próximos PRs da auditoria de dead code/duplicatas. PRs 1–5 já foram aplicados (ver commit). Estes ficam pra agendar.

Origem do plano: análise completa em conversa com Claude (2026-05-27). Cada item tem evidência concreta e plano de validação.

---

## PR 6 — Adicionar svelte-check + lint no app principal

**Por quê**: hoje só o `admin-dashboard/` tem `npm run check`. O app principal não tem verificação estática — qualquer regressão de tipos/imports só aparece em runtime ou em PR review humano.

**O que fazer**:
1. `npm install -D svelte-check typescript`
2. Criar `jsconfig.json` na raiz com `checkJs: false` (ou `true` se quiserem TS gradual).
3. Adicionar scripts em `package.json`:
   ```json
   "check": "svelte-kit sync && svelte-check --tsconfig ./jsconfig.json",
   "check:watch": "svelte-kit sync && svelte-check --tsconfig ./jsconfig.json --watch"
   ```
4. Opcional: ESLint mínimo (`eslint-plugin-svelte` + flat config).

**Validação**: rodar `npm run check` e tratar warnings importantes (Svelte 5 deve estar limpo).

**Tamanho**: ~1h, sem risco.

---

## PR 7 — DRY do chat: extrair ChatStreamCore

**Por quê**: `src/lib/components/SupportChat.svelte` (489 L) e `src/lib/components/InAppSupportChat.svelte` (432 L) duplicam todo o miolo de stream SSE → marked → DOMPurify → render. Diferenças são apenas: SupportChat tem estado local + toggle/botão flutuante; InAppSupportChat lê/escreve em `$lib/stores/support`.

**O que fazer**:
1. Criar `src/lib/components/chat/ChatStreamCore.svelte`:
   - Props: `messages` (array), `placeholder` (string), `endpoint` (default `/api/chat/support`)
   - Slots: `header`, `footer` (pra customizar visual)
   - Eventos: `on:send`, `on:streamComplete`
   - Internamente: marked.use(...), DOMPurify, fetch + SSE reader, scrollToBottom
2. Em `SupportChat.svelte`: manter chrome (botão flutuante, animação, estado local de messages) e usar `<ChatStreamCore bind:messages>`.
3. Em `InAppSupportChat.svelte`: manter binding com store e usar `<ChatStreamCore messages={$supportMessages} on:send={handleSendToStore}>`.
4. Considerar se `AssistantChat.svelte` (508 L, endpoint `/api/chat/assistant`) também merece encaixar — provavelmente sim.

**Validação**:
- Build + tests
- QA manual:
  - Landing page (`/`): abrir widget, mandar pergunta, ver resposta
  - Dentro `/app`: abrir InAppSupport, mandar pergunta, mudar de rota, voltar — mensagens persistem (store)
  - Dentro `/gestao`: idem
  - Assistant em `/app` (se mudou também): testar fluxo de IA do PDV

**Tamanho**: ~3h. Ganho: -800 a -900 L.

---

## PR 8 — Decidir futuro do gateway Asaas (cloudflare-worker + branch legado)

**Contexto**: O comentário em `src/routes/api/billing/webhook/+server.js:1` diz "Stripe webhook handler. Reativado após pivot do Asaas (Apr/2026)". Existem ainda:
- `cloudflare-worker/asaas-proxy.js` — proxy Cloudflare Workers para API Asaas. Zero referências no repo.
- `src/routes/api/billing/cancel-subscription/+server.js:38` — branch "manual/Asaas legado".
- `admin-dashboard/src/routes/subscriptions/+page.svelte:1311` — UI mostra label "Asaas (legado)" quando `payment_provider === 'asaas'`.
- `admin-dashboard/src/lib/subscriptionHelpers.js:11` — JSDoc menciona Stripe/Asaas.

**Perguntas a responder com produto/cofundador**:
1. Existe alguma `subscriptions.payment_provider = 'asaas'` ainda ativa no DB?
2. O worker `cloudflare-worker/asaas-proxy.js` ainda está deployado na Cloudflare?
3. Se sim para (1): migrar essas assinaturas pra Stripe ou cancelar.
4. Se não para (1) e (2): remover tudo.

**O que fazer (se decisão for "pode remover")**:
1. Remover pasta `cloudflare-worker/` completa.
2. Em `cancel-subscription/+server.js`, simplificar removendo branch Asaas.
3. Em `admin-dashboard/src/routes/subscriptions/+page.svelte`, remover bloco `{:else if selectedSub.payment_provider === 'asaas'}`.
4. Em `admin-dashboard/src/lib/subscriptionHelpers.js`, ajustar JSDoc.

**Validação**: testar cancelamento de assinatura Stripe ativa.

**Tamanho**: 30 min após decisão; horas se precisar migrar dados.

---

## PR 9 — Investigar agendamento de `/api/cron/nudge-incomplete-registration`

**Contexto**: `vercel.json` só agenda `/api/cron/onboarding-emails`. A rota `/api/cron/nudge-incomplete-registration/+server.js` existe e tem lógica de envio de email + log. Mas não há gatilho documentado.

**Possíveis cenários**:
- Esquecimento: deveria estar no `vercel.json` mas nunca foi adicionado.
- Está em cron externo (Upstash, Trigger.dev, GitHub Actions, etc.).
- É dead code (foi implementado e nunca ativado).

**O que fazer**:
1. Buscar em `.github/workflows/`, scripts externos, dashboard Vercel UI.
2. Se for esquecimento: adicionar entrada em `vercel.json`.
3. Se for dead: remover rota inteira + lógica relacionada em `onboardingEvents.js` (verificar primeiro o que `logOnboardingCommunication` usa).

**Validação**: depende do desfecho.

**Tamanho**: 15-30 min de investigação.

---

## PR 10 — Substituir @iconify/* por SVG inline (2 deps p/ 2 ícones)

**Contexto**: `@iconify/svelte` e `@iconify/icons-simple-icons` são usados SOMENTE em `src/routes/assinatura/+page.svelte` para 1 ícone cada:
- `OfflineIcon` de `@iconify/svelte/dist/OfflineIcon.svelte`
- `pixIconData` de `@iconify/icons-simple-icons/pix`

**O que fazer**:
1. Criar `src/lib/icons/PixIcon.svelte` com o SVG do PIX inline (pegar de simple-icons GitHub).
2. Criar `src/lib/icons/OfflineIcon.svelte` com SVG equivalente.
3. Atualizar `assinatura/+page.svelte` pra usar os componentes locais.
4. `npm uninstall @iconify/svelte @iconify/icons-simple-icons`.

**Validação**:
- Build (admin-dashboard não usa essas deps, só o app principal).
- QA: abrir `/assinatura`, conferir que ambos ícones aparecem.

**Ganho**: tamanho do node_modules + uma dependência runtime a menos no bundle.

**Tamanho**: 1h.

---

## PR 11+ — Decomposição gradual dos arquivos gigantes

Não é um PR só — são vários incrementais, com QA manual entre eles. NUNCA fazer "big bang".

**Ordem sugerida de ataque** (do mais doloroso pro menos):

### Onda 1 — Modal de pagamento (1.122 L)
`src/lib/components/modals/ModalPagamento.svelte` mistura 5 modos de pagamento (dinheiro, cartão, pix, fiado, valor avulso).

Fatiar em:
- `lib/components/pagamento/PagamentoDinheiro.svelte`
- `lib/components/pagamento/PagamentoCartao.svelte`
- `lib/components/pagamento/PagamentoPix.svelte`
- `lib/components/pagamento/PagamentoFiado.svelte`
- ModalPagamento.svelte vira só roteador `{#if modo === 'dinheiro'} ... {/if}` + lógica compartilhada de cálculo de troco

### Onda 2 — `/app/+page.svelte` (1.569 L, PDV principal)
Extrair em ordem:
1. `<PDVProductGrid>` (grade de produtos + filtros + busca)
2. `<PDVCart>` (carrinho lateral)
3. `<PDVCheckoutBar>` (totais + botão checkout)
Hooks dedicados:
- `lib/stores/pdvCart.js` (já existe `pdvCache.js`? confirmar)

### Onda 3 — Mesas/[id]/+page.svelte (3.456 L — o monstro)
Fatiar em:
- `<TabelaMesaItem>`, `<TabelaMesaSummary>`, `<DividirContaModal>`
- store `useMesaRealtime` para WebSocket Supabase
- `lib/finance/mesaOps.js` para cálculos de divisão

### Onda 4 — Assinatura (2.571 L)
- `<PlanSelector>`, `<PixPaymentBox>`, `<CardCheckoutBox>`

### Onda 5 — Produtos (2.374 L)
- `<ProductForm>`, `<ProductListTable>`, `<ProductBulkActions>`

### Onda 6 — Relatórios (1.989 L)
- Um arquivo por tipo de relatório em `src/lib/reports/`

### Critério de "pronto"
- Cada onda gera 2-5 PRs pequenos
- Cada PR: 1 extração + testes verdes + QA manual completo do fluxo afetado
- NUNCA mergear duas extrações no mesmo PR

---

## Itens menores que NÃO viraram PR

| Item | Por quê não priorizar |
|---|---|
| Duplicação `src/lib/pricing.js` ↔ `admin-dashboard/src/lib/pricing.js` | Intencional. Resolver só se for migrar pra monorepo (pnpm workspace) por outras razões. |
| 173 `console.log/error/warn` no src/ | Maioria é tratamento legítimo de fallback. Não tem "console.log de debug esquecido" óbvio. |
| Documentos `.md` na raiz (PROJETO_*, OFFLINE, mesas, audit-report, memory) | Decisão de organização, não dead code. Considerar mover pra `docs/` num PR só de housekeeping. |
| Páginas grandes não listadas em Onda (termos 1032 L, privacidade 984 L) | Conteúdo, não código. OK do jeito que está. |
| `playwright` declarado junto com `@playwright/test` em devDeps | Redundante mas inofensivo. Remover sozinho não vale PR. |

---

## Como validar qualquer PR desta lista

```bash
npm run build                           # build app principal
cd admin-dashboard && npm run build && cd ..   # build admin
npm test                                # vitest (139 tests)
npm run test:e2e -- pdv.spec.js         # E2E só se mexer em /app
npm run test:e2e -- auth.spec.js        # E2E só se mexer em auth
npm run test:e2e -- access-control.spec.js
```

QA manual sempre incluir:
- Login / signup / reset senha
- PDV: criar venda em cada forma de pagamento
- Caixa: abrir / movimentar / fechar
- Impressão: cupom (Zelo Impressão se pareada, fallback iframe se não)
- Mesas: abrir, adicionar item, fechar conta
- Subscrição: dashboard, toggle addon, cancel
- PWA offline: criar venda, voltar online, sync
