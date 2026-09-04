---
name: ZeloPDV
description: Operational PDV and gestão for Brazilian small businesses — calm dark workshop, one bright sky, every number tabular.
colors:
  primary: "#0EA5E9"
  primary-hover: "#0284C7"
  primary-foreground: "#FFFFFF"
  ink-primary: "#F8FAFC"
  ink-label: "#CBD5E1"
  ink-muted: "#94A3B8"
  ink-quiet: "#64748B"
  surface-lifted: "#1E293B"
  surface-mid: "#0F172A"
  surface-recessed: "#0B1220"
  surface-input: "#0F172A"
  border-card: "#1F2937"
  border-subtle: "#334155"
  border-strong: "#475569"
  link: "#93C5FD"
  link-hover: "#60A5FA"
  status-success: "#4ADE80"
  status-success-bg: "#0A2E1F"
  status-success-border: "#166534"
  status-error: "#F87171"
  status-error-bg: "#2A1010"
  status-error-border: "#7F1D1D"
  status-warning: "#FBBF24"
  status-warning-bg: "#2A1D08"
  status-warning-border: "#78350F"
  sidebar-active-bg: "#FFFFFF"
  sidebar-active-ink: "#0F172A"
  sidebar-hover-bg: "#334155"
  blog-bg: "#F7F8FB"
  blog-surface: "#FFFFFF"
  blog-ink: "#0F2B46"
  blog-ink-muted: "#6B7280"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-lg:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body-touch:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  body-reading:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.2em"
  data:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "'tnum' on, 'lnum' on"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  2xl: "16px"
  3xl: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-lifted}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-destructive:
    backgroundColor: "{colors.status-error-bg}"
    textColor: "{colors.status-error}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-label}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  input-text:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card-recessed:
    backgroundColor: "{colors.surface-recessed}"
    textColor: "{colors.ink-label}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-lifted:
    backgroundColor: "{colors.surface-lifted}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "20px"
  chip-status-success:
    backgroundColor: "{colors.status-success-bg}"
    textColor: "{colors.status-success}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  sidebar-item-active:
    backgroundColor: "{colors.sidebar-active-bg}"
    textColor: "{colors.sidebar-active-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: ZeloPDV

## 1. Overview: O Balcão Bem Iluminado

**Creative North Star: "O Balcão Bem Iluminado" — The Well-Lit Counter.**

ZeloPDV is a calm dark workshop with one bright thing at a time. The room is **slate-900 navy** — quiet, dark enough that a 14-hour-shift owner closing the caixa at 11pm doesn't get glare bouncing back at them — and the **sky-500** accent is the lamp over the workbench. It points to what matters next: the primary action, the current selection, the live state. Everything else stays in the dim.

The system is **committed-dark, not flat-dark.** The body is a real navy with hue, not a gray pretending to be dark. Three tonal layers — *lifted* sidebar (`#1E293B`), *mid* page (`#0F172A`), *recessed* card (`#0B1220`) — give depth without shadows; shadows are reserved for **state** (the hover lift on a CTA, the focus ring on the next field). This is the opposite of legacy Brazilian ERPs (gray-blue everything, identical depth on every panel) and the opposite of consumer fintech (purple gradients, animated emoji, motion-on-every-element). The warmth in ZeloPDV is carried by the *words* (plain Brazilian Portuguese, no startup-English) and the *numbers* (always tabular, totals always visible) — not by tinting the body bg.

The product surface (`/app`, `/gestao`, `/relatorios`) is the default register. The marketing surface (`/`, `/para-*`, `/vs-*`, blog) shares the same palette and the same restraint but scales up the type and section rhythm. Blog posts are the **single light surface** in the system — a bright editorial reading-room used only for long-form prose; the application itself never goes light.

**Key Characteristics:**
- Single dark theme. No light mode in the product. (Blog is the documented exception.)
- One saturated accent: sky-500. Used for primary actions, current selection, focus rings, link text. Nothing else gets that brightness.
- Three-layer tonal depth (`lifted / mid / recessed`); shadows reserved for state, not decoration.
- System sans only — no display font, no serif. Hierarchy through size and weight, not face.
- All numbers are tabular-nums. Money never wobbles.
- Mobile-first viewport; same complete experience scales up. No "lite" mobile build.
- Reduced-motion friendly by default: transitions on opacity/transform only, ≤300ms.
- WCAG AA contrast floor on every text-on-surface pair, including placeholders and status pills.

## 2. Colors: A Paleta do Balcão

A committed dark palette: one saturated brand color, three tonal navy surfaces, a disciplined ink ramp, and three status hues that exist only to communicate state. Nothing else.

### Primary

- **Sky Sinal** (`#0EA5E9`, sky-500): the only saturated color in the system. Primary buttons, current selection, focus rings, active links, the "now" tick on a step. Hover state is **Sky Profundo** (`#0284C7`, sky-600). Sky Sinal is the lamp over the workbench; rarity is the point.

### Neutral — Three Surfaces

- **Sala Iluminada** (`#1E293B`, slate-800): the *lifted* layer. Sidebar, modal background, popover, command palette. Sits forward of the page.
- **A Sala** (`#0F172A`, slate-900): the *mid* layer. The page itself. Where the operator's eye lives. Also the default header bar.
- **A Gaveta** (`#0B1220`): the *recessed* layer. Cards, panels-within-panels, the gaveta-do-balcão container that holds grouped data. Sits behind the page so the data inside it reads as the foreground.

### Neutral — Ink

- **Texto Principal** (`#F8FAFC`, slate-50): primary body text, page titles, button labels on dark.
- **Rótulo** (`#CBD5E1`, slate-300): form labels, secondary text, link text in body copy.
- **Texto Discreto** (`#94A3B8`, slate-400): muted body text, metadata, breadcrumb tail. WCAG-AA legible against all three surfaces.
- **Texto Sussurrado** (`#64748B`, slate-500): only for tertiary metadata where missing it is fine (timestamps, low-priority counts, placeholder text on inputs that have a label above them).

### Neutral — Borders

- **Borda da Gaveta** (`#1F2937`, gray-800): the soft 1px line that defines a recessed card against the page. Almost invisible; the contrast is in the surface tone, not the border.
- **Borda Discreta** (`#334155`, slate-700): standard interactive border (inputs at rest, secondary buttons, separator lines).
- **Borda Firme** (`#475569`, slate-600): emphasized border for hover states on inputs, themed-checkbox at rest.

### Status

Three semantic colors, each used in three roles (text, background tint at ~10%, border at ~40%). Never decoratively.

- **Status Sucesso** (`#4ADE80`, green-400) on `#0A2E1F` bg with `#166534` border. Caixa fechado, venda confirmada, pagamento Pix recebido, conta ativa.
- **Status Erro** (`#F87171`, red-400) on `#2A1010` bg with `#7F1D1D` border. Falha de pagamento, sync offline com erro, validação rejeitada, destrutiva.
- **Status Aviso** (`#FBBF24`, amber-400) on `#2A1D08` bg with `#78350F` border. Assinatura próxima do fim, comanda aberta há muito tempo, ação reversível mas notável.

### Links

- **Link** (`#93C5FD`, blue-300) → **Link Hover** (`#60A5FA`, blue-400). Distinct from Sky Sinal; links are blue, primary actions are sky.

### Sidebar — The Inverted Active State

The sidebar's active item is the **only** time white is used as a background in the entire product. `#FFFFFF` bg + `#0F172A` ink. Hover sits at `#334155` (slate-700). This single inversion makes "where am I right now in the nav" unmissable without using the sky accent (which is reserved for actions).

### Blog — The One Light Surface

The blog (and only the blog) inverts the system into a light editorial reading-room: `#F7F8FB` bg, `#FFFFFF` cards, `#0F2B46` ink. This is documented, not stripped — long-form prose reads better light. The product app itself never uses these tokens.

### Named Rules

**The One Voice Rule.** *Sky Sinal* is the only saturated color in the product. It marks one of: the primary action, the current selection, the focus ring, the active link. If you reach for a second saturated color to decorate something, the answer is no — use a tonal surface or a tone of ink instead.

**The Three Layers Rule.** Every surface is one of *Sala Iluminada* (lifted), *A Sala* (mid), or *A Gaveta* (recessed). There is no fourth layer. Nested cards inside cards are forbidden; if the data needs more grouping, use a divider or whitespace.

**The Status-Only Rule.** Green, red, and amber exist to communicate state. They are never decorative, never used to "add some color." If a screen is feeling flat, the answer is hierarchy, not color.

## 3. Typography: One Voice, Many Sizes

**Display Font:** the platform's system sans stack (`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`). No webfont is loaded. Brazilian operators on cheap Android tablets get instant first paint; the brand voice lives in the words and the weight, not in the typeface.

**Body Font:** same family.

**Label/Mono Font:** the system mono stack, used decoratively in exactly one place (the marketing hero's fake URL bar). Never in product UI.

**Character:** one disciplined sans across the whole product. Hierarchy is built from **size, weight, and tracking** alone — display has tight negative tracking, body sits at normal, labels are uppercase with wide positive tracking. Roman numerals into one face. Reads like the operator's own handwriting, not like a startup's deck.

### Hierarchy

Product UI uses a **fixed rem scale, not a fluid clamp**, because operators view at consistent DPI and a heading that shrinks inside a sidebar looks worse, not better. Marketing surfaces use a responsive `text-Nxl md:text-(N+2)xl` step instead of clamp.

- **Display** (700, `2.25rem` → `3.75rem` at `md:`, line-height `1.0–1.1`, letter-spacing `-0.02em`): marketing hero only. Never used in product UI.
- **Headline** (700, `1.875rem`, line-height `1.15`, letter-spacing `-0.015em`): marketing section heading. Internal screens do not use this size.
- **Title** (700, `1.25rem` = `text-xl`, line-height `1.25`, letter-spacing `-0.01em`, color `#F8FAFC`): the canonical **product page H1**. Every gestão screen, every internal route. Do not vary.
- **Body** (400, `0.875rem` = `text-sm`, line-height `1.55`): default product body, table rows, form values.
- **Body Reading** (400, `1.125rem` = `text-lg`, line-height `1.65`, max 65–75ch): marketing prose, blog body, long-form support content only.
- **Label** (700, `0.625rem` = `text-[10px]`, `letter-spacing: 0.2em`, uppercase, color `#64748B`): the **product breadcrumb** above the H1, the form `field-label`, the table `col-header`. **This is a signature pattern; it must look identical every time.**
- **Data** (500, `0.875rem`, `font-feature-settings: 'tnum' on, 'lnum' on`): every number in the system — totals, contagens, money, percentages, contagens em listas. Right-aligned in tables.

### Named Rules

**The Tabular Rule.** Every numeric value in product UI uses `tabular-nums`. Money never wobbles when a digit changes; row counts align cleanly down a table. If you write a `<span>R$ 0,00</span>`, it carries `tabular-nums`. Non-negotiable.

**The Eyebrow Exception.** The uppercase tracked Label style is reserved for **one named pattern** — the breadcrumb above a page Title (`Gestão / Cadastros` → `Pessoas`) and form field labels. It is *not* the saturated-AI eyebrow-above-every-section trope. If you find yourself putting a uppercase tracked label above a marketing section, stop; the section heading is enough.

**The One Family Rule.** One sans family across the whole product. Display + body pairing is a brand-register move; ZeloPDV is product-register. If a moment wants emphasis, the answer is weight or size, not a second face.

## 4. Elevation: Tonal Layers, Not Shadows

ZeloPDV builds depth from **three tonal surfaces**, not from drop shadows. The page itself sits in the middle; the sidebar/modal/popover layer lifts forward (lighter navy); the card layer recedes backward (darker navy, almost black). Shadows enter the system only as a **response to state** — the hover lift on a marketing CTA, the focus ring on the next input, the elevation when a draggable item is being held.

The result is calm: the operator's screen doesn't have eight competing shadows for attention. The data is the foreground because it sits on the mid layer; the card behind it falls quietly away.

### Shadow Vocabulary

Use these and only these. Each has a name and a single role.

- **Focus Ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, #0EA5E9 22%, transparent)`): every focusable control on keyboard focus. Never on hover.
- **Sky Lift** (`box-shadow: 0 12px 24px -8px rgba(2, 132, 199, 0.40)`): the marketing CTA's hover state, paired with `translateY(-2px)`. Sky-tinted, not neutral — the lift is the brand color saying "press me."
- **State Pop** (`box-shadow: 0 0 0 3px color-mix(in srgb, #0EA5E9 16%, transparent)`): a soft glow when a themed-checkbox toggles on, when a Pix QR enters the success state, when a comanda transitions to "paga." Briefly, then gone.

That's the entire shadow vocabulary. No ambient resting shadows under cards. No layered "soft, soft, medium, large" elevation ramp.

### Named Rules

**The Recessed Card Rule.** Cards are *darker* than the page they sit on (`#0B1220` card on `#0F172A` page). The card is a well that holds grouped data; the data is the foreground. This is intentional and the opposite of most dark themes. **Never invert it** — a card lighter than the page implies "this is the active layer," which is reserved for the Lifted Exception below.

**The Lifted Exception Rule.** *One* surface per screen may use the lifted treatment (`#1E293B` background, optional 1px subtle border, no shadow) to signal "this is the active focus": the currently-open mesa, the comanda being recebida, the active step in onboarding, the modal/popover backdrop. The promotion is structural, not decorative. If two things are "lifted" on the same screen, pick one.

**The No-Resting-Shadow Rule.** Surfaces are flat at rest. Drop shadows only appear in response to state (hover, focus, drag, success-pop). If a card needs a shadow to look "real," it doesn't — give it a border, or trust the tonal contrast.

## 5. Components

The product runs on **shadcn-svelte** primitives (`Button`, `Select`, `AlertDialog`, `Separator`, `Spinner`, `Toaster`) layered on `bits-ui`, with a tail of **legacy CSS classes** (`.btn-primary`, `.field-input`, `.themed-checkbox`, `.auth-input`) that still drive hotspot surfaces (`/app/mesas/[id]`, `/app`, `/relatorios`, `/gestao/produtos`, `/assinatura`). Both vocabularies are valid; new code uses shadcn, legacy code stays legacy unless we're inside it for another reason.

Icons are **`lucide-svelte` only**. Never inline SVG.

### Buttons

- **Shape:** `border-radius: 8px` (`--radius-lg` / shadcn `rounded-lg`); marketing CTAs go pill (`9999px`) when they sit alone in a hero.
- **Primary:** `#0EA5E9` background, white ink, no border, no resting shadow. Hover darkens to `#0284C7`. Active translates 1px down (no scale, no bounce). Padding `8px 14px` at `default` size (`h-8`); `8px 10px` at `sm` (`h-7`); `8px 14px` at `lg` (`h-9`). The shadcn `Button` covers this in new code; `.btn-primary` covers it in legacy.
- **Secondary / Outline:** transparent over `--bg-input` with a `#334155` border. Hover swaps to `#1E293B` background. Used for "Cancelar," "Voltar," secondary actions.
- **Destructive:** `#2A1010` tint background, `#F87171` ink, no border. Used for "Excluir," "Cancelar assinatura." Never the primary-blue treatment.
- **Ghost:** transparent, ink at `#CBD5E1`. Hover gets `#1E293B` background. Used in toolbars, inside modals, anywhere a button needs to recede until pointed at.
- **Icon button (legacy `.icon-btn`):** square 34px, ghost-styled, 16px lucide icon centered. Use shadcn `size="icon"` (32px) for new code.
- **Focus:** every variant carries the **Focus Ring** treatment on keyboard focus. Mouse focus is suppressed (`:focus-visible`, not `:focus`).

### Inputs / Fields

- **Style:** `.field-input` is the canonical control. `0.5rem 0.75rem` padding, `border-radius: 8px`, background `#0F172A` at 60% opacity over the card, border `#334155` at 60% opacity, ink `#F8FAFC`.
- **Label:** the **Label typography** sits *above* the input with `0.375rem` gap. Always present; placeholders are for example values, not for replacing labels.
- **Placeholder:** `#64748B` (slate-500) — the *Texto Sussurrado* ink. Held to WCAG AA against the input background.
- **Focus:** the **Focus Ring** treatment + border swaps to `#0EA5E9`. No box-shadow on hover.
- **Error / Disabled:** error state borrows the **Status Erro** vocabulary (red-400 border + bg tint). Disabled drops opacity to 0.55 and removes the cursor; do not also gray out the border (it loses contrast).
- **Authentication pages (`.auth-input`):** a denser variant with a `0.5rem 0.875rem` pad and a subtle gradient on the submit button (`.auth-btn`). This is the **single decorative gradient** in the product; never replicate elsewhere.

### Themed Checkbox

The product's signature form primitive — a custom-painted checkbox so that the check state carries the brand color. `1.125rem` square, `0.3rem` corner, `1.5px` border `#475569`, transitions on background/border-color/box-shadow only. **Never** use `accent-color: var(--primary)` — that ships an inconsistent native control across browsers.

### Cards / Containers

- **Recessed Card (default):** `background: #0B1220` (`--bg-card`), `border: 1px solid #1F2937`, `border-radius: 12px`, padding `1.25rem`. Used for any grouped data container — a perfil block, a relatório panel, a marketing feature card.
- **Lifted Card (signature):** `background: #1E293B`, `border-radius: 12–16px`, optional `1px` subtle border, no shadow. Used at most once per screen, for the active mesa / current comanda / focused step. See the Lifted Exception Rule.
- **Marketing Card (variant):** the recessed card scaled up — `rounded-3xl` (24px), `p-7` or `p-10` for testimonials/CTAs, `border-color: var(--border-card)`. The marketing surface uses the same color tokens as product, just with larger radius and padding.
- **Internal Padding:** `1.25rem` (`p-5`) in product UI; `1.75rem` (`p-7`) in marketing; modal interiors at `1.5–2rem`.
- **Never nest cards.** If you find yourself inside a recessed card and need to group something further, use a `Separator` or whitespace.

### Status Chips

- **Style:** pill (`border-radius: 9999px`), `0.125rem 0.625rem` padding, label sized ~`0.75rem` (`text-xs`), weight 500.
- **Tokenized:** uses the `--status-{success|error|warning}-{bg|border|text}` triplet. **Never** invent a fourth color (no purple "info," no pink "premium" — use ink hierarchy if the meaning isn't one of the three statuses).
- **Carry text + icon, never icon alone.** Color independence: a colorblind operator must be able to tell a Pix that succeeded from one that failed without the hue.

### Page Header (signature pattern)

The **canonical product page header** is non-negotiable. Every gestão screen opens with:

```svelte
<div class="mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4">
  <div>
    <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">
      Gestão / Cadastros
    </p>
    <h1 class="text-xl font-bold text-slate-100 tracking-tight">Pessoas</h1>
  </div>
  <span class="text-xs text-slate-500 tabular-nums">{count} registros</span>
</div>
```

The breadcrumb uses the **Label** typography. The H1 uses **Title**. The right-hand metadata is **Body** at `text-xs` with `tabular-nums`. **Do not vary** — different sizes, different weights, alternative components — across pages. Sub-pages of a hub (`/ferramentas/*`) substitute the breadcrumb for a `<BackLink>` component; the H1 stays identical.

### Sidebar Item

- **Default:** `1px` rounded rectangle, transparent background, ink `#CBD5E1`, 16px lucide icon at left, gap `0.625rem`.
- **Hover:** background `#334155`, ink `#F8FAFC`.
- **Active:** background `#FFFFFF`, ink `#0F172A`. The system's only white-on-anything moment. This is what makes "where am I" unmissable without spending the sky accent.

### Modals & Dialogs

- **Confirm dialogs** go through `confirmAction(title, message)` from `$lib/stores/ui` (returns `Promise<boolean>`) — backed by shadcn `AlertDialog`. **Never** roll a custom confirm.
- **Backdrop:** `bg-black/60 backdrop-blur` (the *one* glassmorphism moment in the product — purposeful, behind-the-modal only).
- **Surface:** lifted card treatment (`#1E293B` over the backdrop), `border-radius: 14px`, `max-width: 460px` default.
- **Modals are the last resort.** Inline edit > slide-over > modal. If the question can be answered in place, answer it in place.

### Feedback

- **Toasts:** `addToast(msg, 'success' | 'error' | 'warning' | 'info')` from `$lib/stores/ui`; wraps `svelte-sonner` with the `<Toaster />` mounted at root. The status colors above drive the toast accent.
- **Spinner:** the `<Spinner />` component, sizes `sm` / `md` / `lg`. Spinners go on **buttons during an action** (auth submit, Pix create), **not** in the middle of a page where a skeleton belongs.
- **Skeletons** for loading rows in tables and content blocks. Skeleton color = `surface-recessed` with a soft 1.2s shimmer between `#0B1220` and `#1E293B`.
- **Empty state:** dashed-border centered card (`1px dashed #334155`), lucide icon at 56px, Title + Body Reading description, primary CTA. The Empty state teaches the interface — never just says "Nada aqui."

## 6. Do's and Don'ts

### Do:

- **Do** use **Sky Sinal** (`#0EA5E9`) for the primary action, the current selection, the focus ring, and the active link — and nothing else.
- **Do** keep cards *recessed* (`#0B1220`, darker than the page) by default. Promote one surface to *lifted* (`#1E293B`) per screen when something genuinely deserves "this is the active focus."
- **Do** write every number with `tabular-nums`. Money, contagens, totals, percentages. Non-negotiable.
- **Do** open every internal page with the canonical Page Header pattern: breadcrumb Label, Title H1, right-aligned metadata. No alternative components.
- **Do** use the shadcn `Button` / `Select` / `AlertDialog` / `Spinner` primitives in new code. Use the legacy `.btn-primary` / `.field-input` / `.themed-checkbox` in code that already uses them — migration is gradual, not retrofit.
- **Do** import all icons from **`lucide-svelte`**. Use `size-4` (16px) inline, `size-5` (20px) in sidebar/avatars, none-specified when nested in a shadcn `Button`.
- **Do** write all user-visible strings in Brazilian Portuguese. Plain operator voice, no startup-English jargon ("dashboard" → "painel", "checkout" → "finalizar venda", "onboarding" → "primeiros passos").
- **Do** ship every animation with a `@media (prefers-reduced-motion: reduce)` fallback that crossfades or jumps instantly. Brazilian operators on older Androids will not see your motion anyway.
- **Do** test heading copy at 360px width before shipping. If a marketing H1 overflows on iPhone SE, the design is wrong.
- **Do** keep `cn()` from `$lib/utils` as the only way to compose conditional classes. Never inline a `${condition ? 'a' : 'b'}` template literal in `class=`.

### Don't:

- **Don't** introduce a second saturated color. If the screen wants emphasis, the answer is tonal hierarchy (one Lifted surface, one Sky Sinal action) — not a purple accent, not a magenta gradient, not a teal "info" pill.
- **Don't** nest cards. A card inside a card is always wrong; use a divider, whitespace, or a single Lifted surface instead.
- **Don't** lift a card with a drop shadow at rest. Shadows in this system are **state-only** (hover, focus, drag, success-pop). The tonal layer carries the depth.
- **Don't** ship `border-left: 3px solid var(--primary)` as a "colored stripe" callout. It's the side-stripe ban; rewrite with a full border, a background tint, or a leading icon.
- **Don't** use gradient text (`background-clip: text` + gradient bg). The single auth submit gradient (`linear-gradient(135deg, #0EA5E9, #0284C7)`) is the documented exception — do not extend it.
- **Don't** use glassmorphism decoratively. The modal backdrop blur is the one purposeful use; new "frosted" cards are forbidden.
- **Don't** scaffold marketing sections with the saturated-AI eyebrow-above-every-section trope. The Label typography is reserved for the breadcrumb above a Title and for form field labels. Marketing section headings carry their own weight at `text-3xl md:text-4xl` and do not need an "ABOUT" eyebrow.
- **Don't** number marketing sections `01 / 02 / 03` as scaffolding. Numbers earn their place when the section IS a sequence (a real 3-step process); not as default page furniture.
- **Don't** roll a custom confirm dialog. Use `confirmAction()` from `$lib/stores/ui`. Every "Tem certeza?" goes through the same component.
- **Don't** hardcode hex in a component. Tokens live in `src/themes/base.css` and shadcn variables; if a color isn't in the tokens, add it to the tokens, don't write `#0EA5E9` in a `.svelte` file.
- **Don't** use a `<select>` native element in new code. Use the shadcn `Select` from `$lib/components/ui/select`.
- **Don't** use `space-x-*` / `space-y-*` for child spacing. Use `gap-*`.
- **Don't** use `accent-color: var(--primary)` on a native checkbox. Use the `.themed-checkbox` class.
- **Don't** write user-facing English. "Add to cart" is not Brazilian; "adicionar à venda" is. The brand voice is operador-brasileiro, not Bay-Area-product.
- **Don't** ship purple gradients, animated emoji, or "🎉 boa! 🎉" copy. The brand is warm, but it is not consumer fintech. Warmth lives in the words, not the motion.
- **Don't** clone the legacy Brazilian ERP chrome — dense gray-blue toolbars, three-row navigation stacks, 12-column data tables at 14px Verdana. ZeloPDV is what those products would look like if they were redesigned in 2026 by someone who respects the operator's eyes.
