# AGENTS.md — ZeloPDV Subagent Reference

Quick reference for using subagents in the ZeloPDV codebase.

---

## Mandatory read before any task

1. Read [[CURRENT]] first.
2. For anything beyond a tiny local edit, read [[ZeloPDV.memory]] next.
3. For billing, subscription guards, offline sales, account deletion, referrals, or admin flows, read [[CLAUDE]] and [[CODE_REVIEW]] before touching code.
4. After any fix or feature that changes behavior, update:
   - [[CURRENT]] if the sprint/state changed
   - [[FIXES_PROGRESS]] if a bug/risk moved
   - [[INCIDENTS]] if the change came from a real outage or production failure mode
   - [[ZeloPDV.memory]] only if a fact became worth carrying across sessions

## Critical write surfaces

Before editing these files, read the adjacent operational docs first:

- `src/routes/api/billing/*` → [[BILLING]] + [[CODE_REVIEW]]
- `src/lib/guards.js` → [[CLAUDE]] + [[CURRENT]]
- `src/lib/finance/saleOps.js`, `src/lib/offlineDb.js`, `src/routes/app/+page.svelte` → [[CLAUDE]] + `docs/operations/OFFLINE.md`
- `src/lib/server/accessControl.js`, `src/lib/accessControl.js`, `src/routes/api/access/*`, `src/routes/gestao/acessos/+page.svelte` → [[CLAUDE]] + `docs/modules/ACESSOS.md` + `docs/data/SCHEMA_RLS.md`
- `src/routes/app/mesas/*`, `src/routes/gestao/mesas/+page.svelte` → [[CLAUDE]] + `docs/modules/MESAS.md`
- `src/routes/relatorios/+page.svelte`, `src/routes/gestao/despesas/+page.svelte`, `src/lib/components/AdminLock.svelte` → [[CODE_REVIEW]] + `docs/data/SCHEMA_RLS.md`
- `admin-dashboard/*` → [[CLAUDE]] + [[CODE_REVIEW]]

## Documentation contract

- Do not leave behavior changes undocumented.
- Prefer updating an existing doc over creating a sibling doc.
- If a doc becomes historical, mark it explicitly at the top instead of leaving it looking current.
- If tests or validation commands are red, record that in [[CURRENT]] rather than pretending the branch is green.
- Do not call a tracker in `docs/projects/` "live" unless it still matches the code; prefer `docs/modules/*` for current module behavior.

---

## Agent Type Guide

### `frontend-engineer`
Use for UI/UX work on public-facing and marketing pages.

- Landing page design, layout, and copy (`src/routes/+page.svelte`, `/para-*`, `/pascoa`)
- Segment landing page content changes (`src/lib/data/segmentLandingPages.js`)
- Blog page UI and article list view (`src/routes/blog/`)
- New marketing components (`src/lib/components/marketing/`)
- `BlogCoverArt`, `MarketingHeader`, `MarketingFooter` changes

### `feature-engineer`
Use for backend logic, POS functionality, integrations, and blog content data.

- POS features: cart, checkout, fiado flow (`src/routes/app/`)
- Supabase queries and RLS-aware data access
- Stripe webhook handler (`src/routes/api/billing/webhook/+server.js`)
- Subscription guard changes (`src/lib/guards.js`)
- New blog article content — add entries to `src/lib/blog/posts.js`
- Sitemap updates (`static/sitemap.xml`)
- Offline DB schema changes (`src/lib/offlineDb.js`)

### `senior-code-reviewer`
Use before merging any changes that touch:

- Payment flows (Stripe webhook, checkout session, billing portal)
- Subscription guard (`guards.js`) — wrong logic here locks out users or gives free access
- RLS-adjacent queries — especially anything using `supabaseAdmin`
- `vendas`, `vendas_pagamentos`, `pessoas.saldo_fiado` — critical financial data

### `qa-test-engineer`
Use after implementing new POS features.

- After changes to `src/routes/app/+page.svelte` (checkout, cart, payment modes)
- After fiado flow changes (must verify `id_cliente` is set when `forma_pagamento = 'fiado'`)
- After subscription guard changes

### `software-architect`
Use for structural decisions, not routine work.

- Redesigning subscription flow
- Adding a new major route group
- Evaluating offline-first strategy changes (Dexie / service worker)
- Admin dashboard (`admin-dashboard/`) architecture questions

---

## SEO Work Patterns

### JSON-LD — always use `{@html}`

Svelte does **not** interpolate expressions inside `<script>` tags. This breaks silently.

```svelte
<!-- WRONG — Svelte will not render the variable -->
<script type="application/ld+json">{JSON.stringify(schema)}</script>

<!-- CORRECT -->
{@html `<script type="application/ld+json">${JSON.stringify(schema)}</script>`}
```

Both blog article schemas (`Article`, `BreadcrumbList`) in `src/routes/blog/[slug]/+page.svelte` already use the correct pattern. Follow it exactly.

### Never touch `app.html` for meta tags

`src/app.html` is the bare HTML shell. Do **not** add default `<meta name="description">` or `<link rel="canonical">` here — they will bleed into every route and break per-page SEO. Every route must define its own in `<svelte:head>`.

### Where content lives

| What | File |
|------|------|
| Segment page data (hero, FAQs, features, testimonial) | `src/lib/data/segmentLandingPages.js` |
| Shared segment page schema objects | `src/lib/data/segmentLandingPages.js` (top of file) |
| Blog article content and metadata | `src/lib/blog/posts.js` |
| Shared segment page UI component | `src/lib/components/marketing/SegmentLandingPage.svelte` |
| Blog article page renderer | `src/routes/blog/[slug]/+page.svelte` |
| Sitemap | `static/sitemap.xml` |

### Sitemap maintenance

Add a new `<url>` block to `static/sitemap.xml` for every new public route. Use these values:

- Segment pages (`/para-*`): `priority 0.8`, `changefreq monthly`
- Blog articles: `priority 0.7`, `changefreq monthly`
- Add `<lastmod>YYYY-MM-DD</lastmod>` for blog articles

---

## Adding a Blog Article

All articles live in `src/lib/blog/posts.js` as objects in the `posts` array. Add new articles at the top of the array (newest first).

Required fields:

```js
{
  slug: 'slug-da-url',           // must match the URL: /blog/slug-da-url
  title: 'Título do artigo',
  description: 'Meta description — 140–160 chars, ends with a clear benefit.',
  keyword: 'keyword principal',   // used for internal tracking only
  coverVariant: 'aqua',          // see options below
  publishedAt: 'YYYY-MM-DD',
  readingTime: '6 min',
  content: `                     // raw HTML string, NO Svelte expressions
    <p>...</p>
    <h2>...</h2>
  `
}
```

Available `coverVariant` values: `aqua`, `sunrise`, `violet`, `ember`, `orbital`, `linen`

Content rules:
- Use only `<p>`, `<h2>`, `<ul>`, `<li>`, `<strong>` inside `content` — the article page styles target these via `:global()` selectors
- No `<h1>` inside content (the page already renders `post.title` as H1)
- Pitch ZeloPDV softly in the last 1–2 paragraphs — do not start with a sales pitch
- Never use "quiosque" — use: lanchonete, hamburgueria, delivery próprio, MEI, pequeno negócio
- Target 1000–1500 words per article

After adding the article, also add its URL to `static/sitemap.xml`.

---

## Remaining Blog Content Opportunities

These slugs are in the CLAUDE.md roadmap but not yet written in `posts.js`:

| Slug | Primary Keyword | Est. Monthly Volume |
|------|-----------------|---------------------|
| `quanto-custa-sistema-pdv-lanchonete` | sistema pdv para lanchonete preço | 400–1k |
| `pdv-no-navegador` | pdv online navegador | 100–400 |
| `calcular-lucro-real-lanchonete` | calcular lucro lanchonete | 500–1.5k |
| `sistema-gestao-mei-alimentacao` | sistema gestão MEI | 400–1k |
| `como-organizar-despesas-lanchonete` | controle de despesas lanchonete | 200–600 |

Assign these to a `feature-engineer` agent. Follow the structure of existing articles in `posts.js` as the template.

---

## CSS Rules (applies to all agents)

Never hardcode hex colors in components. Always use CSS variables:

```svelte
<!-- WRONG -->
<div style="background: #0b1220; color: #e5e7eb">

<!-- CORRECT -->
<div style="background: var(--bg-card); color: var(--text-label)">
```

If you need to add a new CSS variable, define it in `src/themes/base.css`.

The blog pages use a separate set of CSS variables (prefixed `--blog-*`) defined in the same theme files. Do not mix blog variables into non-blog components.
