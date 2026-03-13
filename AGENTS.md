# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Zelo PDV is a SaaS POS (Point of Sale) system for Brazilian lanchonetes (quick-service restaurants). It is a PWA with offline-first capabilities, built on SvelteKit 5 + Supabase + Stripe. Production: https://zelopdv.com.br

## Commands

```bash
npm run dev           # Start dev server (http://localhost:5173)
npm run build         # Production build
npm run preview       # Preview production build
npm run test          # Run unit tests with Vitest
npm run test:e2e      # Run E2E tests with Playwright
npm run test:e2e:ui   # Run Playwright tests with UI
```

Node version: 20.x (see `.nvmrc`).

There are two separate apps:
- **Root** (`/`) — main POS app, deployed as main Vercel project
- **`admin-dashboard/`** — separate Svelte 4 admin portal, deployed as a separate Vercel project

To develop `admin-dashboard/`, run `npm run dev` from inside that directory (runs on port 5174).

## Architecture

### Framework & Stack
- **SvelteKit 5** (SSR + SPA hybrid) with `@sveltejs/adapter-vercel` in prod, `adapter-node` in dev (auto-detected via `VERCEL` env var)
- **Supabase** for PostgreSQL database, authentication, and storage
- **Stripe** for recurring subscriptions
- **Dexie.js** (IndexedDB) for offline data caching
- **Tailwind CSS** + CSS Variables for styling
- **PWA** via `@vite-pwa/sveltekit` (Workbox service worker)
- **jsPDF** + **XLSX** for PDF/Excel report generation

### Route Structure

**Public:**
- `/` — Landing page (root)
- `/landing` — Alternate landing page (with server load)
- `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha` — Auth
- `/privacidade`, `/termos` — Legal pages

**Auth required:**
- `/perfil` — Company profile setup
- `/assinatura` — Subscription/billing page

**Active subscription required:**
- `/app` — **Main POS interface**
- `/gestao` — Management dashboard root
- `/gestao/pessoas` — Customer management
- `/gestao/fichario` — Fiado (credit) management
- `/gestao/produtos` — Product management
- `/gestao/categorias` — Category management
- `/gestao/estoque` — Inventory management
- `/gestao/caixa` — Cash register management
- `/gestao/cadastros` — General registrations/settings
- `/gestao/empresas` — Company management
- `/gestao/despesas` — Expenses tracking
- `/relatorios` — Reports

**API:**
- `/api/public-env` — Public environment variables
- `/api/billing/webhook` — Stripe webhook handler
- `/api/billing/create-checkout-session` — Stripe checkout session
- `/api/billing/create-portal-session` — Stripe billing portal session

### Auth & Subscription Guard (`src/lib/guards.js`)
Every protected page runs `ensureActiveSubscription()`, which checks in sequence:
1. User is authenticated (session exists)
2. Optionally: company profile is complete in `empresa_perfil` (when `requireProfile: true`)
3. `subscriptions` table has an active record (`status === 'active'` or `status === 'trialing'`, and `current_period_end` or `manually_extended_until` is in the future)

Redirect flow: no auth → `/login` | no/incomplete profile → `/perfil?msg=complete` | no subscription (new user) → `/assinatura?msg=subscribe` | expired subscription → `/assinatura?msg=expired`

`authReady` writable store signals when initial auth check is complete. Use `waitAuthReady()` before accessing auth state.

### Navigation Layout
Protected routes (`/app`, `/gestao/*`, `/relatorios`) use a **left sidebar** (`GestaoSidebar.svelte`) as the primary navigation — there is **no top navigation bar** on these pages. The root `+layout.svelte` top header only appears on public/marketing pages. On mobile the sidebar collapses and is toggled with a hamburger icon.

### Key Source Files
| File | Purpose |
|------|---------|
| `src/routes/+layout.svelte` | Root layout: auth listener, subscription check, top header (public pages only) |
| `src/routes/app/+layout.svelte` | POS layout: mounts `GestaoSidebar` as the left nav |
| `src/lib/components/GestaoSidebar.svelte` | Left sidebar navigation for all protected routes |
| `src/routes/app/+page.svelte` | Main POS: product grid, cart, checkout |
| `src/lib/supabaseClient.js` | Supabase singleton (anon key, frontend) |
| `src/lib/server/supabaseAdmin.js` | Supabase service role client (server only, bypasses RLS) |
| `src/lib/server/stripe.js` | Stripe singleton |
| `src/lib/authStore.js` | `authReady` and `waitAuthReady()` |
| `src/lib/offlineDb.js` | Dexie IndexedDB schema |
| `src/lib/guards.js` | `ensureActiveSubscription()` |
| `src/lib/stores/ui.js` | Toast notifications and confirm dialogs |
| `src/lib/stores/session.js` | User session store |
| `src/lib/stores/pdvCache.js` | POS system caching |
| `src/lib/profileUtils.js` | Company profile utilities |
| `src/lib/utils/excelReport.js` | Excel report generation (XLSX) |
| `src/lib/utils/pdfReport.js` | PDF report generation (jsPDF) |
| `src/routes/api/billing/webhook/+server.js` | Stripe webhook handler |

## Database (Supabase PostgreSQL)

All user tables enforce RLS: `auth.uid() = id_usuario`. **Exception:** `subscriptions` table has RLS disabled (webhook writes use service role key).

Key tables: `empresa_perfil`, `produtos`, `categorias`, `subcategorias`, `pessoas`, `caixas`, `vendas`, `vendas_itens`, `vendas_pagamentos`, `movimentacoes_caixa`, `subscriptions`.

**Critical constraint:** When `vendas.forma_pagamento = 'fiado'` or a multiplo sale includes fiado, `vendas.id_cliente` (FK → `pessoas.id`) **must** be set. This is what links the sale to the customer's credit balance (`pessoas.saldo_fiado`).

**Multiple payments:** When `forma_pagamento = 'multiplo'`, each payment method gets a row in `vendas_pagamentos`.

## Stripe Webhook Flow (`/api/billing/webhook`)

1. Verify Stripe signature with `STRIPE_WEBHOOK_SECRET`
2. Lookup user by `metadata.user_id` → fallback to customer email via `supabaseAdmin.auth.admin.listUsers()` → fallback to existing `subscriptions.stripe_customer_id`
3. SELECT existing subscription row → UPDATE if found, INSERT if not (no upsert — no UNIQUE constraint on `user_id`)
4. Uses `supabaseAdmin` (service role) to bypass RLS

Events handled: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.

## Theming System

**Files:**
- `src/theme.css` — imports theme files
- `src/themes/base.css` — navy/blue default theme (production)
- `src/themes/christmas.css` — seasonal override (activated via `.christmas-theme` class on root div)
- `src/themes/newyear.css` — New Year seasonal theme (activated via `.newyear-theme` class)
- `src/app.css` — Tailwind + theme-agnostic utilities

**Critical rule: NEVER hardcode hex colors in components.** Always use CSS variables:
```svelte
<!-- BAD -->
<div style="background: #0b1220; color: #e5e7eb">

<!-- GOOD -->
<div style="background: var(--bg-card); color: var(--text-label)">
```

Key variables: `--bg-app`, `--bg-panel`, `--bg-card`, `--bg-input`, `--text-main`, `--text-muted`, `--text-label`, `--primary`, `--primary-hover`, `--border-subtle`, `--border-card`, `--error`, `--success`, `--warning`.

To add a new CSS variable, define it in `base.css` **and** override it in **all theme files** (`christmas.css`, `newyear.css`).

## Notifications

```javascript
import { addToast, confirmAction } from '$lib/stores/ui'
addToast('Mensagem aqui', 'success') // 'success' | 'error' | 'info' | 'warning'
const ok = await confirmAction('Título', 'Mensagem de confirmação') // returns Promise<boolean>
```

## Environment Variables

**Frontend (SvelteKit PUBLIC_ prefix, with VITE_PUBLIC_ fallback):**
```
PUBLIC_SUPABASE_URL           # or VITE_PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY      # or VITE_PUBLIC_SUPABASE_ANON_KEY
VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY
VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL
PUBLIC_APP_URL
```

**Backend (server-only, Vercel env vars):**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   # Service role key — never expose to frontend
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_BILLING_PORTAL_CONFIGURATION_ID
```

Local dev: create `.env.local` (gitignored).

## Testing Stripe Webhooks Locally

```bash
stripe login
stripe listen --forward-to localhost:5173/api/billing/webhook
stripe trigger checkout.session.completed
```

## Additional Documentation

The `.ai/` directory contains detailed reference docs:
- `.ai/DEPLOYMENT.md` — Vercel deployment guide
- `.ai/STRIPE_SETUP.md` — Stripe dashboard configuration
- `.ai/CRON_SETUP.md` — Scheduled job setup (subscription expiration)

---

## SEO Strategy & Roadmap

> This section documents the SEO implementation plan for zelopdv.com.br.
> All tasks below are active backlog — implement when working on public/marketing routes.

### Product Positioning (important context for all SEO work)

O Zelo PDV resolve a dor do **backoffice simples de pequenos negócios de alimentação**. O público-alvo são donos de:
- Lanchonetes
- Hamburguerias
- Pequenos deliveries (próprios, sem iFood/WhatsMenu)
- MEIs e microempreendedores do setor de alimentação

**Proposta de valor central:** o cliente não tem R$ 100–200/mês para gastar em sistemas de delivery complexos (WhatsMenu, iFood PDV, KCMS). O Zelo resolve a dor do **backoffice**: lucro real, despesas, fiado organizado, fechamento de caixa — tudo simples e no navegador, sem instalar nada.

**NÃO use "quiosque"** em nenhum copy — o termo não ressoa com o público brasileiro. Use sempre: lanchonete, hamburgueria, delivery próprio, MEI, pequeno negócio.

---

### Current SEO State (March 2026)

**Technical SEO score: 7/10** — good foundation.
**Content/Authority score: 3/10** — main gap to fix.

**What's already done correctly:**
- `<title>` tag with primary keyword
- `<meta description>` with CTA
- Single H1 with primary keyword
- Open Graph tags (og:title, og:description, og:image, og:url)
- Twitter Card meta tags
- `SoftwareApplication` JSON-LD schema with AggregateRating (4.9, 38 reviews)
- Canonical URL
- `robots.txt` blocking private routes
- `sitemap.xml` at `/sitemap.xml`
- HTTPS + fast load (~380ms)

**What's missing (ordered by priority):**
1. `FAQPage` JSON-LD schema on homepage
2. Landing pages per segment (`/para-lanchonetes`, `/para-hamburguerias`, `/para-delivery`, `/para-mei`)
3. More body text on homepage (currently ~561 words; target 800–1200)
4. H2 tags rewritten to include keywords
5. Blog with educational content
6. Backlinks (directories, guest posts)
7. `sitemap.xml` updated as new pages are added

---

### Target Keywords

These are the keywords the ZeloPDV site must rank for. Group them by intent when writing copy.

**High-intent (transactional):**
- `sistema pdv para lanchonete`
- `pdv para lanchonete`
- `sistema pdv simples`
- `pdv simples para pequenos negócios`
- `sistema de caixa para lanchonete`
- `controle de caixa para lanchonete`
- `sistema para hamburgueria simples`
- `pdv online lanchonete`
- `sistema pdv gratis lanchonete`

**Long-tail / quick wins (easier to rank, high intent):**
- `como controlar caixa de lanchonete`
- `sistema pdv para hamburgueria barato`
- `controle de fiado digital para lanchonete`
- `como gerenciar lanchonete pequena`
- `pdv no navegador sem instalar`
- `sistema de gestão para MEI`
- `fechar caixa lanchonete sistema`
- `como calcular lucro real lanchonete`
- `controle de despesas lanchonete`

---

### Planned Routes (SEO)

These routes need to be created. Each is a standalone SSR page optimized for a specific segment keyword.

#### `/para-lanchonetes`
- **Primary keyword:** `sistema pdv para lanchonete`
- **H1:** Sistema PDV para Lanchonete: Caixa, Estoque e Fiado em Um Só Lugar
- **Target length:** 900–1200 words
- **Key sections:** what problem it solves for lanchonetes, how ZeloPDV works (step by step), testimonial from a lanchonete owner, pricing CTA, FAQ specific to lanchonetes
- **Schema:** `FAQPage` + `SoftwareApplication`

#### `/para-hamburguerias`
- **Primary keyword:** `sistema pdv para hamburgueria`
- **H1:** PDV para Hamburgueria: Controle Pedidos e Lucro Sem Complicação
- **Target length:** 900–1200 words
- **Key sections:** hamburguerias pain points (high volume, combo management), ZeloPDV features, testimonial, CTA
- **Schema:** `FAQPage` + `SoftwareApplication`

#### `/para-delivery`
- **Primary keyword:** `sistema para delivery próprio simples`
- **H1:** Sistema para Delivery Próprio: Gerencie Pedidos e Finanças Sem iFood
- **Target length:** 800–1000 words
- **Key angle:** positioned against expensive delivery platforms — ZeloPDV is for who does their own delivery without paying marketplace fees
- **Schema:** `FAQPage` + `SoftwareApplication`

#### `/para-mei`
- **Primary keyword:** `sistema de gestão para MEI`
- **H1:** Sistema de Gestão para MEI: Controle Caixa e Despesas no Celular
- **Target length:** 800–1000 words
- **Key sections:** MEI-specific pain points (no accountant, manual control), how ZeloPDV fits into MEI workflow, price comparison vs. complex tools
- **Schema:** `FAQPage` + `SoftwareApplication`

**SvelteKit implementation notes for these routes:**
- Create as `src/routes/para-lanchonetes/+page.svelte`, etc.
- Use `<svelte:head>` for all meta tags (title, description, canonical, og:*, twitter:*, JSON-LD)
- These are **public routes** — no auth guard, no subscription guard
- Add each URL to `static/sitemap.xml` after creation
- Use the same visual components/layout as `src/routes/+page.svelte` for design consistency

---

### Homepage SEO Improvements (to apply to `src/routes/+page.svelte`)

#### H2 rewrites
The current H2s are creative but not keyword-optimized. Apply these replacements:

| Current | Replace with |
|---|---|
| `Frente de Caixa Ágil. Sem Filas.` | `Frente de Caixa PDV para Lanchonetes: Registre Pedidos em Segundos` |
| `Lucro Líquido Real. Sem Achismos.` | `Gestão Financeira para Lanchonete: Veja Seu Lucro Real` |
| `Controle de Despesas. Saiba para onde vai o dinheiro.` | `Controle de Despesas para Pequenos Negócios` |
| `Carteira de Clientes. Fiado Organizado.` | `Controle de Fiado Digital: Acabe com o Caderninho` |

> Note: keep the creative subheadlines in smaller text if desired — just make the H2 itself keyword-rich.

#### FAQPage schema
Add the following JSON-LD block inside `<svelte:head>` on the homepage, below the existing `SoftwareApplication` schema:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Preciso de computador potente para usar o Zelo PDV?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Não! O Zelo PDV roda direto no navegador (Chrome, Edge). Funciona em qualquer computador ou notebook básico, e até em tablets."
      }
    },
    {
      "@type": "Question",
      "name": "Como funcionam os 7 dias grátis?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Você cria a conta e cadastra seu cartão para ativar o período de teste. A cobrança só inicia após 7 dias. Se cancelar antes, não paga nada."
      }
    },
    {
      "@type": "Question",
      "name": "O Zelo PDV emite Nota Fiscal?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "O Zelo PDV emite recibos e comprovantes de venda. Não emitimos NFC-e (Nota Fiscal ao Consumidor Eletrônica), sendo ideal para MEIs e pequenos negócios que fazem controle gerencial interno."
      }
    },
    {
      "@type": "Question",
      "name": "Tem suporte se eu tiver dúvidas?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim! Temos suporte direto via WhatsApp em horário comercial. A gente ajuda a configurar e tirar dúvidas na hora."
      }
    }
  ]
}
```

#### Body content to add
The homepage has ~561 words. Add a new section before the FAQ to reach ~900 words. Suggested section:

**Section title (H2):** "Para quem é o Zelo PDV?"

Content: a brief paragraph + visual cards (or text list) for each segment:
- 🍔 Lanchonetes — quem precisa registrar pedidos rápido no balcão
- 🍔 Hamburguerias — controle de combos, estoque e pico de movimento
- 🛵 Deliveries próprios — quem faz entrega por conta própria, sem marketplace
- 📱 MEIs e microempreendedores — controle simples sem planilha nem caderno

Each card should link to the corresponding segment landing page once they exist (e.g., `href="/para-lanchonetes"`).

---

### Blog (Medium-term: 1–3 months)

Create a blog at `/blog` with article pages at `/blog/[slug]`.

**SvelteKit implementation notes:**
- Articles can be MDsveX (`.svx` files) or a simple array of article objects in a `src/lib/blog/posts.js` file rendered by a `+page.svelte`
- Each article page must have: unique `<title>`, `<meta description>`, `canonical`, `og:*`, and `Article` JSON-LD schema
- Add blog articles to `sitemap.xml`

**Priority article queue:**

| Slug | Title | Primary Keyword | Est. Volume |
|------|-------|-----------------|-------------|
| `como-fechar-caixa-lanchonete` | Como fechar o caixa de uma lanchonete do jeito certo | como fechar caixa lanchonete | 300–800/mo |
| `controle-de-fiado-lanchonete` | Controle de fiado: como parar de perder dinheiro na lanchonete | controle de fiado lanchonete | 200–600/mo |
| `quanto-custa-sistema-pdv-lanchonete` | Quanto custa um sistema PDV para lanchonete? Guia completo | sistema pdv para lanchonete preço | 400–1k/mo |
| `pdv-no-navegador` | PDV no navegador: como funciona e quais as vantagens | pdv online navegador | 100–400/mo |
| `calcular-lucro-real-lanchonete` | Como calcular o lucro real de uma lanchonete | calcular lucro lanchonete | 500–1.5k/mo |
| `sistema-gestao-mei-alimentacao` | Sistema de gestão para MEI de alimentação: o que você precisa | sistema gestão MEI | 400–1k/mo |
| `como-organizar-despesas-lanchonete` | Como organizar as despesas de uma lanchonete | controle de despesas lanchonete | 200–600/mo |

Each article should be 1000–1500 words, structured as:
1. Intro (problem statement — identify with the reader)
2. Main content (educational, practical)
3. How ZeloPDV helps (soft pitch, 1–2 paragraphs)
4. CTA (link to `/cadastro` with "Testar 7 dias grátis")

---

### Sitemap maintenance

`static/sitemap.xml` must be updated whenever a new public route is created.

Current URLs in sitemap:
- `https://zelopdv.com.br/`
- `https://zelopdv.com.br/login`
- `https://zelopdv.com.br/cadastro`
- `https://zelopdv.com.br/pascoa`

URLs to add as they are created:
- `https://zelopdv.com.br/para-lanchonetes`
- `https://zelopdv.com.br/para-hamburguerias`
- `https://zelopdv.com.br/para-delivery`
- `https://zelopdv.com.br/para-mei`
- `https://zelopdv.com.br/blog`
- `https://zelopdv.com.br/blog/[slug]` (one entry per article)

Use `priority: 0.8` and `changefreq: monthly` for segment pages. Use `priority: 0.7` and `changefreq: monthly` for blog articles.

---

### Competitor context

These are the sites that currently outrank ZeloPDV for the target keywords. Use this context when writing copy — know what we're up against and where our differentiation lies.

| Competitor | Ranking position | Their strength | Our differentiation |
|---|---|---|---|
| Nextar (nextar.com.br) | Top 3 for most keywords | 200+ blog articles, old domain, strong backlinks | Simpler, single price, no complexity |
| Simpliza (simpliza.com.br) | Top 5 for lanchonete | Segment landing pages, free plan as lead magnet | More modern UX, WhatsApp support, focus on real profit |
| KCMS (kcms.com.br) | Top 3 for restaurant/PDV | Free plan, high domain authority | Simpler to use, no table/command complexity |
| PDV Flex (pdvflex.app.br) | Top 5–10 | Segment landing pages, cloud focus | More affordable, owner-focused proposition |
