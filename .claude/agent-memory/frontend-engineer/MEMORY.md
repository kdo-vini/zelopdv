# ZeloPDV Frontend Engineer — Agent Memory

## Project Stack
- SvelteKit 5, TypeScript, Tailwind CSS (via PostCSS/app.css), CSS custom properties
- All theme colors via CSS variables from `src/themes/base.css` — NEVER hardcode hex values
- Dark navy design: `--bg-app: #0F172A`, `--bg-card: #0b1220`, `--primary: #0EA5E9` (sky-500)
- Global utility classes in `src/app.css`: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input-form`, `.bg-app-base`, `.text-main`, `.text-muted`, `.text-accent`

## Layout Constraint — Critical Pattern
The root layout `src/routes/+layout.svelte` wraps all non-app/non-landing slots in:
```
max-w-6xl px-4 py-6   (Tailwind — applied on the <main> element)
```
- Pages under `/app` and `/` get `max-w-full p-0` instead
- For legal/standalone pages that need full-bleed backgrounds, use negative margins to break out:
  ```css
  margin-left: -1rem; margin-right: -1rem; margin-top: -1.5rem;
  ```
  Then apply your own padding inside.

## Navigation
- Header is hidden on `pathname === '/'` and `pathname === '/landing'`
- Public paths (no auth redirect): `/`, `/login`, `/cadastro`, `/esqueci-senha`, `/landing`, `/assinatura`, `/perfil`, `/redefinir-senha`
- New legal pages (`/termos`, `/privacidade`) must be added to `publicPaths` in `+layout.svelte` if auth redirect should be suppressed

## CSS Variable Reference (base theme)
| Variable | Value | Usage |
|---|---|---|
| `--bg-app` | #0F172A | page background |
| `--bg-panel` | #1E293B | panels, dropdowns |
| `--bg-card` | #0b1220 | cards, aside |
| `--bg-input` | #0f172a | inputs |
| `--text-main` | #F8FAFC | headings, primary text |
| `--text-muted` | #94A3B8 | body text |
| `--text-label` | #cbd5e1 | form labels |
| `--primary` | #0EA5E9 | primary buttons |
| `--primary-hover` | #0284C7 | button hover |
| `--accent` | #0EA5E9 | links, highlights |
| `--accent-light` | rgba(14,165,233,0.1) | light tint backgrounds |
| `--border-card` | #1f2937 | card borders |
| `--border-subtle` | #334155 | panel borders |
| `--warning` | #f59e0b | amber warnings |
| `--error` | #ef4444 | errors |
| `--success` | #10b981 | success states |

## Reusable Patterns
- Sticky sidebar + prose layout: `display:flex` on desktop (lg), sidebar `position:sticky top:5rem`
- Section anchors: `scroll-margin-top: 6rem` to clear sticky header
- Notice/callout box: left-border + tinted background using `rgba()` of a status color
- Highlight cards for key metrics: icon + label + large value + sub text
- Contact grid: 3-column on mobile-wide+, card style with hover border accent

## Company Info
- Téchne Sistemas | techne.br@gmail.com | WhatsApp: +55 (14) 99153-7503
- Product: Zelo PDV | zelopdv.com.br | R$59/mês | 7-day free trial
- Payments: Stripe | Foro: Bauru/SP

## Routes Created
- `src/routes/termos/+page.svelte` — Terms of Use page (noindex, sticky TOC sidebar) — directory exists, page NOT yet created
- `src/routes/privacidade/+page.svelte` — Privacy Policy (LGPD-compliant), created March 2026

## Legal Pages Pattern (confirmed in privacidade implementation)
- `max-width: 56rem` container within the global `max-w-6xl` main — keeps prose readable
- Mobile: collapsible jump-link pills (flex-wrap); Desktop (>=768px): sticky aside TOC list
- `scroll-margin-top: 5.5rem` on sections to clear sticky header
- Aside sticky: `top: 5rem; max-height: calc(100vh - 6rem); overflow-y: auto`
- LGPD callout box: `border: 1px solid var(--accent); background-color: var(--accent-light)` with shield SVG icon
- Rights highlight box: `border-left: 4px solid var(--primary)` + `var(--bg-card)` background
- Tables: `.table-wrapper` with `overflow-x: auto` + `border: 1px solid var(--border-card)` + `border-collapse: collapse`; odd row zebra via `var(--bg-card)`
- Partner cards: `.partner-card` with `var(--bg-card)` + `var(--border-card)` border
- Contact grid: 1-col on mobile, 2-col on tablet+ via CSS Grid

## Public Paths (RESOLVED)
`/privacidade` and `/termos` now in `publicPaths` in `+layout.svelte` line 114 — no auth redirect for unauthenticated users.
