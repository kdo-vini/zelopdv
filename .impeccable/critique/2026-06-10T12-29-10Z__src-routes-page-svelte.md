---
target: public marketing surfaces (home + precificacao + vs-planilha + shared marketing components driving /para-* and /vs-* farms)
total_score: 23
p0_count: 2
p1_count: 2
timestamp: 2026-06-10T12-29-10Z
slug: src-routes-page-svelte
---
# Critique: ZeloPDV public/marketing surfaces

Scope: home (`src/routes/+page.svelte`), `precificacao`, `vs-planilha`, the shared marketing components (`SiteHeader`, `MarketingFooter`, `MarketingPriceSection`, `SegmentLandingPage`, `CompetitorComparison`) which render across all 4 `/para-*` and 12 `/vs-*` pages. Internal/product routes deliberately excluded per user request.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|------:|-----------|
| 1 | Visibility of System Status | 3 | Anchor nav works; no scroll progress on the 9-section home. |
| 2 | Match System / Real World | **1** | Brand register fails: gradient H1, rotating conic border, sky-pink-purple Easter banner, eyebrow-on-every-section. Reads as generic SaaS template, not warm-operador-brasileiro. |
| 3 | User Control and Freedom | 3 | CTAs consistent; FAQ details/summary accessible; lightbox `Escape` works. |
| 4 | Consistency and Standards | 2 | Two parallel architectures (bespoke home/precificacao/vs-planilha vs templated SegmentLandingPage/CompetitorComparison) diverge in hero, FAQ, and price treatments. |
| 5 | Error Prevention | 3 | Marketing has little error surface; contato form fine. |
| 6 | Recognition Rather Than Recall | 3 | Pricing repeats `R$ 59` legibly; add-ons table is clear. |
| 7 | Flexibility and Efficiency | 2 | No jump-to-pricing affordance on a long home; mobile menu is bare. |
| 8 | Aesthetic and Minimalist Design | **1** | Eight colored glows on the home, four hue-tinted feature sections, gradient banner, gradient hero text, animated rotating border. The promised "calm dark workshop with one bright thing" is six bright things at once. |
| 9 | Help Users Recognize/Recover Errors | 2 | Marketing surface; n/a for most flows. |
| 10 | Help and Documentation | 3 | FAQ is honest about NFC-e gap (good); precificacao embeds a real calculator. |
| **Total** | | **23/40** | **Acceptable — brand-register weak**. Most heuristics solid; aesthetics and brand-match are the failure axis. |

## Anti-Patterns Verdict

**Yes — these surfaces read as AI-generated SaaS scaffolding at a glance.** The fingerprints are concrete and stacked, and they violate rules that are *already* documented in your own DESIGN.md.

**LLM assessment.** Three reflexes dominate the home:

1. **Gradient text + rotating conic border + 8 colored glows** — every absolute ban in one fold. `+page.svelte:275` ships a `bg-clip-text bg-linear-to-r from-sky-400 via-blue-400 to-sky-400 animate-gradient` heading; `:1190-1202` runs a rotating `conic-gradient(...) #0ea5e9` border 4s linear infinite around the pricing card; `:438, 478, 513, 568, 586` paint emerald/purple/amber/rose `blur-[80–120px]` glows under feature sections. DESIGN.md you just wrote forbids all three by name.
2. **The saturated-AI eyebrow-above-every-section trope at template scale.** `SegmentLandingPage.svelte:84, 108, 134, 160, 184, 210` and `CompetitorComparison.svelte:74, 96, 110, 145, 165, 178, 202, 234, 271` each prepend `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">` before the section heading. Instantiated ~30 times across two templates × 16 pages = ~120 site-wide. DESIGN.md's named **Eyebrow Exception Rule** explicitly forbids exactly this.
3. **Sky-500 dilution by decorative status hues.** Green/purple/amber/rose used as ambient color under features (the home) and as a tri-color gradient on the Easter banner (`:249`). DESIGN.md's **One Voice Rule** + **Status-Only Rule** say sky-500 is the only saturated color and green/red/amber are *never* decorative.

The cumulative effect: the brand's intended Brazilian-operador voice — which leaks through correctly in `/precificacao`'s embedded calculator and in `/vs-planilha`'s honest table — is buried under a Vercel-template aesthetic. The home, ironically, is the *least* on-brand surface in your public marketing.

**Deterministic scan (`detect.mjs --json` on all 8 public files).** Clean: `[]`. None of the deterministic heuristics fired — no detected gradient-text via the matcher's CSS pattern, no side-stripe borders, no glassmorphism-as-default, no codex `border + heavy box-shadow` pair. The slop here is **compositional and template-level**, not single-property. The detector is calibrated for property-level tells; the offenses on these surfaces are scaffold-level ones the LLM review surfaces and the detector can't.

**Visual overlays.** Not available this run — no dev server launched, no browser injection. Findings are source-anchored with file:line evidence instead.

## Overall Impression

The bones are right: tokenized colors (when honored), shadcn primitives, lucide icons, a calm 3-layer tonal navy palette, data-driven `/para-*` and `/vs-*` templates that *would* let one tasteful redesign propagate across 16 pages. The problem is that the marketing layer was built **before** PRODUCT.md / DESIGN.md existed, and it carries 2023-2024 SaaS-landing reflexes that the new strategic docs explicitly reject. The single biggest opportunity is not redoing 16 pages — it's editing **two shared components** (`SegmentLandingPage`, `CompetitorComparison`) plus the home hero, and the entire `/para-*` + `/vs-*` farm shifts in one pass.

The home is the loudest offender (8 colored glows, gradient text, rotating border, repeated price card with twin Easter banner). The templates are the highest-leverage fixes (delete the eyebrow trope from the templates and 16 pages improve). `/precificacao` is the surface to **emulate**, not fix.

## What's Working

1. **`/precificacao` is the quiet hero of the surface.** No badge, no gradient, no glow above the H1 — just `text-3xl font-bold mb-3` + a subtitle (`precificacao:113-117`). The page embeds an **actual margin calculator** instead of marketing copy: the page IS a tool. This is the warm-operador register PRODUCT.md asks for, executed well. It's also the only public page that visibly delivers value *before* asking for a signup.
2. **`/vs-planilha`'s honesty paragraph + comparison table** (`vs-planilha:198-245`). Uses real `<CircleX>` / `<CircleCheckBig>` lucide icons, not inline SVG. The "Grátis — mas custa seu tempo" subtitle is operador-voice in the right key. Numerical contrast (`R$ 0` vs `R$ 59/mês` per row) is legible.
3. **Template-driven architecture for `/vs-*` and `/para-*`** is the right call. One source of truth, tokenized colors, lucide throughout, data files at `src/lib/data/*`. Foundation is correct; the execution sits on top of two components, which means fixes are leveraged not scattered.

## Priority Issues

### [P0] Saturated-AI eyebrow-above-every-section across both marketing templates
- **Where**: `SegmentLandingPage.svelte:84, 108, 134, 160, 184, 210`; `CompetitorComparison.svelte:74, 96, 110, 145, 165, 178, 202, 234, 271`. Each instance: `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Problema | Funcionalidades | Como funciona | Depoimento | FAQ</p>` then `<h2>`. ~30 hits in two components × 16 instantiated pages = ~120 site-wide.
- **Why it matters**: This is the single most diagnostic AI-template tell of 2024-2026. DESIGN.md's **Eyebrow Exception Rule** (which *you just signed off on*) explicitly forbids it. PRODUCT.md anti-reference #2 calls it out by name. The labels add zero information — "Problema" before a `<h2>` titled "Sua planilha não acompanha o ritmo do balcão" is scaffolding, not signage.
- **Fix**: Delete the eyebrow `<p>` everywhere it sits above a section heading in both templates. The `text-3xl md:text-4xl font-bold` heading carries its own weight. Keep eyebrows only when they convey real metadata (e.g. "Depoimento — Patrícia, lanchonete em Sorocaba"); even there, the metadata belongs *inside* the testimonial card, not as a section header.
- **Command**: `$impeccable distill src/lib/components/marketing/SegmentLandingPage.svelte src/lib/components/marketing/CompetitorComparison.svelte`

### [P0] Sky-500 dilution by 8 decorative status-color glows + Easter tri-color banner on the home
- **Where**: `src/routes/+page.svelte:249` (banner `from-amber-500 via-pink-500 to-purple-600`), `:438` (emerald glow), `:478` (purple glow), `:513` (amber glow), `:568, 586` (rose/amber), `:614` (sky glow), `:261, 420, 495, 615, 677, 893` (more blur-80–120px backdrops).
- **Why it matters**: DESIGN.md's **One Voice Rule** ("Sky Sinal is the only saturated color in the product") and **Status-Only Rule** ("green/red/amber are never decorative") are systematically violated. Each feature section painted a different hue ships PRODUCT.md anti-ref #3 (loud consumer fintech) and #2 (generic SaaS templates). The visitor sees the same screen six different colors fighting for the lamp role.
- **Fix**: Strip the colored ambient glows under feature blocks. Keep at most one sky glow per fold. The Easter banner becomes a single tonal pill (sky-500 over `--bg-panel`) — or, if the Easter campaign needs distinct chrome, it gets its own dedicated `/pascoa` surface and the gradient stays out of the global header.
- **Command**: `$impeccable quieter src/routes/+page.svelte` (then `colorize` for any sections that need real sky-positive reinforcement after the strip).

### [P1] Gradient text H1 + rotating conic border are the documented anti-pattern
- **Where**: `+page.svelte:275` (gradient H1 on "para Lanchonetes"); `:1186-1203` (`animate-border-gradient` conic rotating 4s linear infinite around the pricing card, with hardcoded `#0ea5e9`); same border + gradient checklist in `MarketingPriceSection.svelte`.
- **Why it matters**: DESIGN.md Don't list, verbatim: *"Don't use gradient text (background-clip: text + gradient bg). The single auth submit gradient is the documented exception — do not extend it."* The rotating conic border is the Vercel/template aesthetic the brand is explicitly anti. Together, on the most visible CTA card, they signal "AI made this" louder than any other single element.
- **Fix**: Solid `text-sky-400` on "para Lanchonetes" (no gradient, no `animate-gradient` keyframes). Replace the conic border with a static `1px solid var(--primary)` + an on-hover sky-tinted soft shadow (DESIGN.md's documented **Sky Lift**, `0 12px 24px -8px rgba(2, 132, 199, 0.40)`).
- **Command**: `$impeccable harden src/routes/+page.svelte src/lib/components/marketing/MarketingPriceSection.svelte`

### [P1] Voice slips into startup-deck Portuguese, not operador-brasileiro
- **Where**: `+page.svelte:624, 631, 885`; `vs-planilha:153`; `SegmentLandingPage.svelte:184`.
- **Evidence**: "Inteligência Artificial para Pequenos Negócios" (`:624`), "Não é um chatbot genérico" (`:631`), "Sem pegadinhas, sem taxas extras de surpresa" (`:885`), "Funcionalidade por funcionalidade, sem enrolação" (`vs-planilha:153`). The Zelinho chat mockup uses "Parceiro IA · online" with an "ativo" pill — corporate-SaaS chat header, not warm-operador.
- **Why it matters**: PRODUCT.md commits to "Brazilian small-business operator talking to another operator. Plain Portuguese, second person (você), no startup-English jargon, no consultoria-speak." The current voice sits in the gap between operador and consultoria — the consultoria-speak corner that PRODUCT.md anti-ref calls out ("solução integrada", "gestão 360°"). "Inteligência Artificial para Pequenos Negócios" is a sibling.
- **Fix**: Rewrite the AI section header: "O Zelinho lê o seu caixa" or "Pergunte 'Quanto lucrei essa semana?' — ele responde". Replace "Sem pegadinhas" with "Um preço, uma cobrança. Sem letra miúda." Replace "Sem enrolação" with "Sem firula." Run every uppercase eyebrow string through "would Marcos da lanchonete say this out loud?"
- **Command**: `$impeccable clarify` (scoped to the home + the two templates).

### [P2] Three near-identical hero scaffolds across home/segment/competitor pages
- **Where**: Home (`+page.svelte:259-332`), SegmentLandingPage (`:25-79`), CompetitorComparison (`:29-91`), vs-planilha (`:141-168`), precificacao (`:112-120`, the calm exception).
- **Evidence**: All five use: sky-pill badge → big H1 → grey subtitle → two pill CTAs ("Testar grátis" + "Ver como funciona"/"Falar com especialista"). The same `bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1` button signature appears in every hero.
- **Why it matters**: Brand-register failure of consistency-without-distinction. A visitor opening `/vs-saipos` after `/para-delivery` after `/` sees the same page architecture with different copy. DESIGN.md says marketing should give *each* surface a distinguishable identity; product UI is where sameness is the virtue.
- **Fix**: Differentiate the three hero archetypes structurally — home stays centered with the product mockup right; segment heroes pivot to an asymmetric grid with operator imagery + 3-highlight column (no badge); competitor heroes lead with an editorial pull-quote ("Saí da planilha em 2 dias" — Marcos, padaria SP) + a small comparison snapshot. Drop the badge pill on at least two of three.
- **Command**: `$impeccable shape` (decide the three archetypes) then `$impeccable adapt` (execute structurally per template).

### [P2] Inline SVG icons + hardcoded hex sprinkled through the home, despite project-wide rules
- **Where**: `+page.svelte` — inline SVG decorations at `:569, 579, 587, 597, 605, 641, 651, 661, 671, 727` and 5× repeated star path `:757-799` (15× across 3 testimonials), `:1096-1144` (more inline SVG). Hex/rgba at `:302 #0d1117`, `:315 #161b22`, `:325 #0B0F19`, `:348 #0d1117`, `:422/440/497/515/678/895 #121620`, `:680/724/1045/1140 #0B0F19`, `:1196 #0ea5e9` (in CSS), and `precificacao:171-174` redefines `--bg-app/--bg-panel/--bg-card` *locally* with different hex.
- **Why it matters**: `docs/DESIGN_PATTERNS.md` and DESIGN.md both explicitly say "Nunca SVG inline" and "Nunca hardcode hex em componente." precificacao's local token redefinition is the most dangerous — it makes `--bg-card` mean two different things on two pages.
- **Fix**: Replace stars with `<Star fill="currentColor" />`, chevrons with `<ChevronDown />`, the chat/feature decorations with their lucide equivalents (already imported). Move every hardcoded hex to a token. Delete the local `:root` override in `precificacao/+page.svelte:171-174`.
- **Command**: `$impeccable audit` (this is technical-quality work, not visual).

### [P3] The pricing card renders 3× on every /vs-*page, 2× on every /para-*, plus the home
- **Where**: `+page.svelte:881-1042` + `MarketingPriceSection.svelte` rendered inside `CompetitorComparison` and `SegmentLandingPage`.
- **Evidence**: Visitor on `/vs-saipos` sees a price-anchor card at the top, the full comparison table mid-page, then `<MarketingPriceSection />` again as a third price block. The rotating conic border animation fires three times on a single scroll.
- **Why it matters**: Aesthetic dilution and motion overload on lower-end Androids. Three identical animations on one scroll undermine the "Balcão Bem Iluminado" calmness.
- **Fix**: On `/vs-*` and `/para-*`, drop the full `<MarketingPriceSection />`. Replace with a one-line tile: "Preço único — R$ 59/mês. Ver plano completo →" linking to `/precificacao#plano`. The animated border earns its place once site-wide (or zero times, per [P1]).
- **Command**: `$impeccable distill src/lib/components/marketing/CompetitorComparison.svelte src/lib/components/marketing/SegmentLandingPage.svelte`

## Sameness Map (the signature finding for this brief)

The slop spans all public routes because **5 patterns are identical across pages**, and the templating multiplies them.

1. **Pill-badge → display-H1 → muted-subtitle → two-pill-CTAs hero.** 5 pages, 1 recipe. Same `bg-sky-500/10 border-sky-500/30 rounded-full` badge. Same `bg-sky-600 ... rounded-full font-semibold shadow-xl shadow-sky-900/30 hover:-translate-y-1` button signature. (`+page.svelte:259-289`, `SegmentLandingPage:31-65`, `CompetitorComparison:35-69`, `vs-planilha:141-167`, `precificacao:112-120`.)
2. **Uppercase tracked eyebrow above every section.** `text-sm uppercase tracking-[0.25em] text-sky-300 mb-4` is the most-grep-able fingerprint in the codebase. ~30 hits in 2 components × 16 pages.
3. **The recessed-card-with-icon-tile-top feature/reasons block.** `rounded-3xl border p-7` + `w-14 h-14 rounded-2xl bg-sky-500/10 border-sky-500/20` icon tile + H3 + muted body. Lives in `SegmentLandingPage:117-125`, `CompetitorComparison:151-159`, and the home's Zelinho section. Identical card, 3 different pretexts.
4. **The final-CTA card** with `rounded-4xl` + uppercase eyebrow + display H2 + two pills + "Falar com especialista" link. Bottom of every `/para-*` and `/vs-*` — literally the same block with different strings.
5. **The animated conic border + Plano Único pill + 4-bullet checklist** in `MarketingPriceSection`. Rendered 17 times site-wide.

**Editing these 5 patterns in the 2 shared components shifts the entire public surface.** That's the leverage.

## Persona Red Flags

**Jordan (first-time visitor, scrolling on mobile)**
- Lands on `/`, sees the Easter gradient banner + animate-gradient H1 + rotating conic border in the first 3 seconds. Mental tag: "generic SaaS site." (PRODUCT.md anti-target landed direct hit.)
- The trust strip (`:339-342`) renders `<Sandwich>` lucide icon **twice** in adjacent slots (Lanchonetes + Hamburguerias share the same icon). Reads as careless.
- "Inteligência Artificial para Pequenos Negócios" (`:624`) sounds like a press release header. Doesn't speak operador. Jordan, who runs a real lanchonete, doesn't think of himself as a "small business" — he thinks of himself as Marcos with two funcionários.

**Riley (stress-tester, opens 3 /vs-* pages in a row)**
- `/vs-saipos`, `/vs-bling`, `/vs-conta-azul` are literally the same page with column-2 text swapped. The data-driven design is correct in principle but Riley correctly intuits "this is templated/SEO doorway." Page count multiplies the suspicion.
- Price renders 3× per `/vs-*` page (anchor, comparison row, `<MarketingPriceSection />`). The rotating border animation fires 3 times per scroll. Repetition without depth.
- Sources block (`CompetitorComparison:268-283`) says "Fontes (consultadas em {priceCheckedAt})" — Riley clicks one source, the date is data-driven, and there's no prominent "última verificação" callout. If a competitor changes price and the data file isn't updated, the page lies — currently undefended.

**Casey (mobile thumb, iPhone SE / cheap Android)**
- Home: `pt-32 pb-40` hero padding (`+page.svelte:259`) = 256px of empty space before the H1 reaches a 568px iPhone SE viewport. Casey thumb-scrolls a full screen before reading the headline.
- SiteHeader logo is `h-32 md:h-40` (`SiteHeader.svelte:22`) — **128px tall** at mobile. With the Easter banner pushing the header down 36px more, the visible content area shrinks to ~360px on iPhone SE before any scroll. The header is bigger than the content fold.
- 8 `blur-[80–120px]` glow elements on the home + the `animate-gradient` H1 background-position keyframe + the `animate-border-gradient` 4s loop = constant GPU work on a cheap Android. PRODUCT.md Accessibility commits: "Avoid heavy backdrop-filter / blur / large box-shadow stacks in primary loops" — directly violated.

## Minor Observations (Hardcoded Hex / Token Drift Backlog)

For a separate `$impeccable audit` pass. These don't change the design verdict but they're brittle and they break the tokenization promise:

| File : line | Hex | Should be |
|---|---|---|
| `+page.svelte:302, 348` | `#0d1117` (browser toolbar chrome) | new token (`--bg-chrome`) or `--bg-panel` |
| `+page.svelte:315` | `#161b22` (mockup) | token |
| `+page.svelte:325, 680, 724, 1045, 1140` | `#0B0F19` | `var(--bg-app)` |
| `+page.svelte:422, 440, 497, 515, 678, 895` | `#121620` (6×) | `var(--bg-card)` |
| `+page.svelte:1196` | `#0ea5e9` (in conic CSS) | `var(--primary)` |
| `precificacao/+page.svelte:171-174` | **local redefine** of `--bg-app/--bg-panel/--bg-card` | delete; rely on global. Comment literally says "Align with main landing page" — the home is the divergent one |
| `vs-planilha:137` | `bg-[#0B0F19] text-slate-300` | tokens |
| `+page.svelte:249` | `from-amber-500 via-pink-500 to-purple-600` Easter banner | single tonal pill or dedicated `/pascoa` chrome |

Also: 5-star testimonial path repeated 15× as inline SVG (`+page.svelte:757-799`). Replace with `<Star fill="currentColor" />` × 5.

## Questions to Consider

1. **If you deleted every uppercase tracked eyebrow from `SegmentLandingPage` and `CompetitorComparison`, would visitors lose any information** — or would the section H2s suddenly be the loudest thing in their slot, which is the point? Hypothesis: zero information loss, +20% perceived brand confidence.

2. **What does `/vs-saipos` show a visitor that `/vs-bling` doesn't?** If the answer is "different table rows and a different competitor name," the 12 pages are SEO doorways pretending to be design surfaces. Should the visual register for *vs* pages specifically pivot to **editorial** (a small dossier with a pull-quote, a real "sendo justo" note, sources visible at the top) — closer to a magazine comparison than a landing page — so the 12 feel like a *series*, not a templated farm?

3. **The home's "Zelinho" section is the only place where Brazilian smallness leaks through** (the name, the operator question "Quanto lucrei essa semana?"). If "warm-Brazilian-operador" is the brand, why isn't the *whole* home that voice — and what would it cost to rewrite the hero as a one-screen mock of an actual Zelinho conversation (no animated gradient, no rotating border, no eight-glow background), letting the product's voice be the first thing a visitor meets?
