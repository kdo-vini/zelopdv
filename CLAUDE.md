# CLAUDE.md — Zelo PDV

System knowledge base for Claude Code. Update this file on every commit with a changelog entry.

---

## Project Overview

**Zelo PDV** is a SaaS Point of Sale (POS) system for small Brazilian businesses.
- Multi-tenant: one Supabase project, RLS isolates each user's data
- Subscription-gated: Stripe handles billing; `/app`, `/admin`, `/relatorios` require an active subscription
- Offline-first: IndexedDB (Dexie) queues sales when offline; syncs on reconnect
- PWA: installable on any device, Service Worker caches app shell + Supabase API responses

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 |
| Styling | Tailwind CSS 3 + @tailwindcss/forms |
| Backend/DB | Supabase (Postgres + Auth + Storage + RLS) |
| Billing | Stripe (subscriptions, webhooks, billing portal) |
| Offline | Dexie.js (IndexedDB wrapper) |
| PWA | @vite-pwa/sveltekit + Workbox |
| Deployment | Vercel (adapter-vercel only) |
| Reports | jsPDF + jspdf-autotable, SheetJS (xlsx) |
| Charts | Chart.js (via BarChart.svelte + DonutChart.svelte) |

---

## Repository Structure

```
src/
├── hooks.server.js              # In-memory API rate limiter (all /api/* routes)
├── app.html / app.css / theme.css
├── routes/
│   ├── +layout.svelte           # Auth guards, navigation, PIN setup, online/offline bar
│   ├── app/
│   │   ├── +page.js             # ssr=false (client-only render)
│   │   └── +page.svelte         # PDV main page (~1679 lines) — cart, payment, receipt
│   ├── admin/                   # Admin dashboard (PIN-protected)
│   ├── relatorios/+page.svelte  # Reports page — PDF/Excel export (lazy loaded)
│   ├── assinatura/              # Subscription management
│   ├── login/ cadastro/ perfil/ esqueci-senha/ redefinir-senha/
│   └── api/
│       ├── billing/
│       │   ├── create-checkout-session/+server.js
│       │   ├── create-portal-session/+server.js
│       │   └── webhook/+server.js   ← PRIMARY webhook handler
│       ├── stripe/webhook/+server.js  ← legacy/secondary webhook
│       └── public-env/+server.js      # Exposes anon key to static HTML pages
├── lib/
│   ├── supabaseClient.js        # Supabase client (browser-only, localStorage session)
│   ├── authStore.js             # sessionStore, authReadyStore, waitAuthReady()
│   ├── guards.js                # ensureActiveSubscription(), isSubscriptionActiveStrict()
│   ├── offlineDb.js             # Dexie schema + sync queue + limparVendasAntigas()
│   ├── receipt.js               # Thermal receipt HTML builder (58mm/80mm)
│   ├── utils.js                 # withTimeout(), fetchAll()
│   ├── errorUtils.js            # Portuguese error messages, translateSubscriptionStatus()
│   ├── profileUtils.js          # normalizeLarguraBobina(), requiredOk(), buildPayload()
│   ├── server/
│   │   ├── stripe.js            # Stripe singleton (server-only)
│   │   └── supabaseAdmin.js     # Supabase service-role client (bypasses RLS)
│   ├── stores/
│   │   ├── pdvCache.js          # 5-min TTL cache for produtos/categorias/subcategorias
│   │   ├── adminStore.js        # adminUnlocked writable
│   │   └── ui.js                # Toast queue + confirmModal (confirmAction → Promise<bool>)
│   ├── utils/
│   │   ├── pdfReport.js         # generatePDFReport(dados) — async, lazy-loads jsPDF
│   │   └── excelReport.js       # generateExcelReport(dados) — async, lazy-loads xlsx
│   └── components/
│       ├── VirtualProductGrid.svelte   # Virtualized product grid (ResizeObserver, keyboard nav)
│       ├── ToastContainer.svelte
│       ├── ConfirmDialog.svelte
│       ├── PinSetupModal.svelte
│       ├── AdminLock.svelte
│       ├── [Categorias/Produtos/Subcategorias/Expenses/Pessoas]Manager.svelte
│       ├── charts/
│       │   ├── BarChart.svelte
│       │   └── DonutChart.svelte
│       └── modals/
│           ├── ModalAbrirCaixa.svelte
│           ├── ModalPagamento.svelte    # Split payments, discounts, fiado
│           ├── ModalMovCaixa.svelte     # Sangria / Suprimento
│           ├── ModalQuantidade.svelte
│           ├── ModalValorAvulso.svelte
│           └── ModalSucesso.svelte
static/
├── perfil.html / painel.html    # Standalone HTML pages (use /api/public-env)
└── pwa-192x192.png / pwa-512x512.png / favicon.png / logo-zelo.svg
```

---

## Database Schema (inferred from code)

```sql
-- Auth managed by Supabase Auth
empresa_perfil      (user_id, nome_exibicao, documento, contato, largura_bobina, pin_admin, logo_url, ...)
produtos            (id, nome, preco, categoria_id, subcategoria_id, estoque_atual, controlar_estoque, ocultar_no_pdv, eh_item_por_unidade)
categorias          (id, nome, ordem)
subcategorias       (id, id_categoria, nome, ordem)

vendas              (id, numero_venda, valor_total, forma_pagamento, valor_recebido, valor_troco,
                     id_usuario, id_caixa, id_cliente, valor_desconto, desconto_tipo, created_at)
vendas_itens        (id_venda, id_produto, quantidade, nome_produto_na_venda, preco_unitario_na_venda)
vendas_pagamentos   (id_venda, forma_pagamento, valor)

caixas              (id, data_abertura, data_fechamento, valor_inicial, id_usuario)
caixa_movimentacoes (id_caixa, tipo: 'sangria'|'suprimento', valor, motivo, id_usuario)

pessoas             (id, nome, saldo_fiado)
-- fichario (fiado ledger) — RPC: fiado_lancar_debito

subscriptions       (user_id, stripe_customer_id, stripe_subscription_id, status,
                     current_period_end, cancel_at_period_end, price_id, updated_at)

-- IndexedDB (Dexie — browser only)
ZeloPDVDB.produtos          (id, nome, preco, categoria_id)
ZeloPDVDB.categorias        (id, nome)
ZeloPDVDB.vendas_pendentes  (++id, data, total, status: 'aguardando')
```

---

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `VITE_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key |
| `SUPABASE_URL` | server | Same URL for server-side admin client |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Bypasses RLS — only for webhook handlers |
| `STRIPE_SECRET_KEY` | server | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | server | Stripe webhook signature verification |
| `STRIPE_PRICE_ID_MONTHLY_59` | server | Price ID for R$59/mo plan |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | server | Portal config ID |
| `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public | Stripe publishable key |
| `VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL` | public | Direct payment link (optional) |
| `PUBLIC_APP_URL` | server | App base URL for redirects |

> Never commit `.env`. It is in `.gitignore`.

---

## Key Patterns & Conventions

### Auth flow
```
+layout.svelte waits for waitAuthReady() → checks session
→ redirects unauthenticated to /login
→ redirects authenticated public-path users to /app
→ checks empresa_perfil completeness
→ checks isSubscriptionActiveStrict() before /app, /admin, /relatorios
```

### Subscription check
```js
// Always use the strict version — validates status AND current_period_end
import { isSubscriptionActiveStrict } from '$lib/guards';
```

### Toast notifications
```js
import { addToast } from '$lib/stores/ui';
addToast('mensagem', 'success' | 'error' | 'info' | 'warning');
```

### Confirm dialogs
```js
import { confirmAction } from '$lib/stores/ui';
const ok = await confirmAction('Título', 'Mensagem de confirmação?');
```

### Heavy libraries — always lazy-load
```js
// Reports (jsPDF ~300 KB, xlsx ~900 KB) — already async in utility files
// Do NOT import them statically. Call the async utility functions instead:
async function exportarPDF() {
    const { generatePDFReport } = await import('$lib/utils/pdfReport');
    await generatePDFReport(dados);
}
```

### Offline sales
```js
// On Supabase insert failure → save offline
import { salvarVendaOffline } from '$lib/offlineDb';
// On reconnect → sync
import { syncVendasPendentes } from '$lib/offlineDb';
// Periodic cleanup of stuck records (call on app load or cron-like interval)
import { limparVendasAntigas } from '$lib/offlineDb';
await limparVendasAntigas(30); // delete unsync'd records older than 30 days
```

### Dexie schema migrations
```js
// When adding fields or indexes, ALWAYS increment version:
db.version(2).stores({ ... }).upgrade(tx => { /* migrate existing rows */ });
// Never skip versions. Never modify a past version definition.
```

### Rate limiting
- All `/api/*` routes are covered by `src/hooks.server.js`
- Billing/webhook endpoints: 100 req/min per IP
- Default: 300 req/min per IP
- On Vercel (serverless), this is per-instance — not a distributed hard limit

### Receipt printing
- Built in `src/lib/receipt.js` — generates thermal-printer HTML
- Opens a popup window; sends content via `postMessage` + `document.write` fallback
- Supports 58 mm and 80 mm paper widths (set in `empresa_perfil.largura_bobina`)

---

## Deployment

- **Platform:** Vercel (adapter-vercel only — `svelte.config.js`)
- **Build:** `npm run build` → Vercel runs automatically on push to `main`
- **PWA:** Service Worker generated by Workbox at build time
  - App shell: precaches `**/*.{js,css,html,png,svg,ico}`
  - Supabase REST/Auth: NetworkFirst, 10 s timeout, 5 min cache, 64 entries max
  - Supabase Storage: StaleWhileRevalidate, 24 h cache, 32 entries max
- **Stripe webhooks:** point to `https://zelopdv.com.br/api/billing/webhook`

---

## Commit Log

### 2026-03-01 — Architecture hardening
**Files changed:** `src/hooks.server.js` (new), `vite.config.js`, `svelte.config.js`,
`src/lib/offlineDb.js`, `src/lib/utils/pdfReport.js`, `src/lib/utils/excelReport.js`,
`src/routes/relatorios/+page.svelte`

**Changes:**
- **Dynamic imports:** `generatePDFReport` and `generateExcelReport` are now `async` and
  lazy-load jsPDF (~300 KB) and xlsx (~900 KB) only when the user actually exports a report.
  Removes ~1.2 MB from the initial JS bundle. Callers updated to `await import(...)` inline.
- **Vercel-only adapter:** Removed the `VERCEL` env-var toggle and `adapter-node` import
  from `svelte.config.js`. One adapter, one deployment target.
- **Offline sync hardening:** `syncVendasPendentes` now deletes records from IndexedDB after
  successful sync (previously only marked `sincronizado`, causing unbounded DB growth).
  Added `limparVendasAntigas(dias?)` for cleaning stuck records. Added migration guide comment
  for future Dexie `version(N)` upgrades.
- **PWA Workbox runtime caching:** Added `NetworkFirst` strategy for Supabase REST/Auth
  endpoints and `StaleWhileRevalidate` for Supabase Storage. Offline users now see cached
  data instead of blank screens. Storage images (logos) load instantly from cache.
- **API rate limiting:** Created `src/hooks.server.js` with in-memory rate limiter.
  Billing/webhook routes: 100 req/min. Default: 300 req/min. Returns `429 Retry-After: 60`.
