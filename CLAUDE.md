# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zelo PDV is a SaaS POS (Point of Sale) system for Brazilian lanchonetes (quick-service restaurants). It is a PWA with offline-first capabilities, built on SvelteKit 5 + Supabase + Stripe. Production: https://zelopdv.com.br

## Commands

```bash
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Production build
npm run preview   # Preview production build
npm run test      # Run tests with Vitest
```

Node version: 20.x (see `.nvmrc`).

There are two separate apps:
- **Root** (`/`) — main POS app, deployed as main Vercel project
- **`admin-dashboard/`** — separate Svelte 4 admin portal, deployed as a separate Vercel project

To develop `admin-dashboard/`, run `npm run dev` from inside that directory.

## Architecture

### Framework & Stack
- **SvelteKit 5** (SSR + SPA hybrid) with `@sveltejs/adapter-vercel` in prod, `adapter-node` in dev (auto-detected via `VERCEL` env var)
- **Supabase** for PostgreSQL database, authentication, and storage
- **Stripe** for recurring subscriptions
- **Dexie.js** (IndexedDB) for offline data caching
- **Tailwind CSS** + CSS Variables for styling
- **PWA** via `@vite-pwa/sveltekit` (Workbox service worker)

### Route Structure
- `/` — Landing page (public)
- `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha` — Auth (public)
- `/perfil` — Company profile setup (auth required)
- `/assinatura` — Subscription/billing page
- `/app` — **Main POS interface** (active subscription required)
- `/admin/*` — Admin dashboard: `pessoas`, `fichario`, `produtos`, `estoque`, `caixa`
- `/relatorios` — Reports
- `/api/billing/` — Server-side Stripe API routes

### Auth & Subscription Guard (`src/lib/guards.js`)
Every protected page runs `ensureActiveSubscription()`, which checks in sequence:
1. User is authenticated
2. Company profile exists in `empresa_perfil`
3. `subscriptions` table has an active record (`status === 'active'` and `current_period_end` or `manually_extended_until` is in the future)

Redirect flow: no auth → `/login` | no profile → `/perfil?msg=complete` | no sub → `/assinatura?msg=expired`

`authReady` writable store signals when initial auth check is complete. Use `waitAuthReady()` before accessing auth state.

### Key Source Files
| File | Purpose |
|------|---------|
| `src/routes/+layout.svelte` | Root layout: auth listener, subscription check, navigation |
| `src/routes/app/+page.svelte` | Main POS: product grid, cart, checkout |
| `src/lib/supabaseClient.js` | Supabase singleton (anon key, frontend) |
| `src/lib/server/supabaseAdmin.js` | Supabase service role client (server only, bypasses RLS) |
| `src/lib/server/stripe.js` | Stripe singleton |
| `src/lib/authStore.js` | `authReady` and `waitAuthReady()` |
| `src/lib/offlineDb.js` | Dexie IndexedDB schema |
| `src/lib/guards.js` | `ensureActiveSubscription()` |
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
- `src/themes/newyear.css` — New Year seasonal theme
- `src/app.css` — Tailwind + theme-agnostic utilities

**Critical rule: NEVER hardcode hex colors in components.** Always use CSS variables:
```svelte
<!-- BAD -->
<div style="background: #0b1220; color: #e5e7eb">

<!-- GOOD -->
<div style="background: var(--bg-card); color: var(--text-label)">
```

Key variables: `--bg-app`, `--bg-panel`, `--bg-card`, `--bg-input`, `--text-main`, `--text-muted`, `--text-label`, `--primary`, `--primary-hover`, `--border-subtle`, `--border-card`, `--error`, `--success`, `--warning`.

To add a new CSS variable, define it in `base.css` **and** override it in `christmas.css`.

## Notifications

```javascript
import { addToast } from '$lib/toastStore'
addToast({ message: 'Saved!', type: 'success' }) // 'success' | 'error' | 'info'

import { confirmAction } from '$lib/toastStore'
const ok = await confirmAction({ title: '...', message: '...', confirmText: 'Yes' })
```

## Environment Variables

**Frontend (Vite prefix):**
```
VITE_PUBLIC_SUPABASE_URL
VITE_PUBLIC_SUPABASE_ANON_KEY
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
- `.ai/CODEBASE_CONTEXT.md` — complete technical reference (theming, DB schema, Stripe flow)
- `.ai/DEPLOYMENT.md` — Vercel deployment guide
- `.ai/STRIPE_SETUP.md` — Stripe dashboard configuration
- `.ai/CRON_SETUP.md` — Scheduled job setup (subscription expiration)
