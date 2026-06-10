# Product

## Register

product

## Users

Brazilian small-business owners and their employees — restaurants, lanchonetes, padarias, mercadinhos, salões, food trucks, oficinas. They use ZeloPDV as their daily operating system: cash register at the front counter, table service in the dining area, kitchen orders, day-close in the back office, billing on a laptop late at night.

They run on **mixed hardware**: cheap Android tablets behind the counter, a personal phone in the owner's pocket, an older Windows desktop in the back room. Internet is unreliable enough that offline contingency had to be built into the PDV (Dexie/IndexedDB replay). They speak Portuguese, work long shifts, and are not in the mood to be patronized by software.

The primary job-to-be-done at the counter is **"don't make me think, just let me close this sale"**; the primary job-to-be-done at the office is **"show me whether today made money, and what to do about it tomorrow"**.

## Product Purpose

ZeloPDV is the operational backbone for a small Brazilian business: PDV, gestão, mesas, pedidos, comandas, relatórios, assinatura, subusuários. It exists because the alternatives are either spreadsheets (which break the moment the business grows past one person) or legacy Brazilian ERPs (which assume the user has an IT department).

Success looks like: at 11pm, after a busy Friday shift, the owner closes the day in the dashboard, sees the totals match what's in the drawer, and goes home feeling **tudo sob controle**. They didn't have to chase a number. They didn't have to fight the software. The next day reopens cleanly.

The marketing surface (`/`, `/para-*`, `/vs-*`, `/precificacao`, blog) exists to convert that same operator persona — usually evaluating ZeloPDV on a phone, between shifts, against a planilha or a competitor. Marketing pages carry the brand voice, but the product surface is the default register for design work.

## Brand Personality

**Warm. Operador. Brasileiro.**

Voice: a Brazilian small-business operator talking to another operator. Plain Portuguese, second person ("você"), no startup-English jargon ("growth", "stack", "dashboard insights"), no consultoria-speak ("solução integrada", "gestão 360°"). When something goes wrong, the copy apologizes like a person, not like a chatbot.

Emotional goals, in order of priority:
1. **Calm** — the user should feel in control of the numbers, not chased by them.
2. **Respect** — the software should never imply the user is dumb. No condescending tooltips, no "did you mean…" rewrites of clear input.
3. **Speed** — the cash-register loop should feel like muscle memory, not a wizard.
4. **Warmth** — the brand should feel like a person, not an enterprise — but a competent person, not a mascot.

The voice can be **colloquial without being cute**: "Caixa fechado" is warm; "🎉 Boa! Você arrasou hoje 🎉" is not. The brand is Brazilian small-business, not Brazilian fintech-for-Gen-Z.

## Anti-references

ZeloPDV is **not** any of these, and the design must refuse the visual reflexes that come with each:

- **Legacy Brazilian ERPs** (TOTVS, Bling, Omie, Conta Azul). No dense gray-blue toolbars, no 2000s desktop-app layouts with twelve-column data tables and a 14px Verdana ceiling, no breadcrumb-nav-then-toolbar-then-tabs three-row chrome stack. The "ERP smell" is the single biggest aesthetic risk in this category.
- **Generic SaaS templates** (the Vercel-clone family). No gradient hero with a hero-metric template, no identical icon-card grids of three or six features, no tiny uppercase tracked eyebrow above every section, no "01 / 02 / 03" numbered scaffolding by reflex. The brand has its own voice; it doesn't borrow Y Combinator's.
- **Loud consumer fintech** (the over-animated Nubank-imitator family). No purple gradients, no big animated emoji, no motion-on-every-element, no ultra-casual marketing copy that treats the owner like a teenager. The warmth lives in the words, not the animation.
- **Bland enterprise dashboards** (the SAP/Salesforce admin-panel family). No flat gray-on-gray, no anonymous Inter at every size, no accent-free palette, no identical data tables that all look the same. The product is dark and disciplined, but it's *committed* dark — navy with a real sky-500 accent — not "I gave up and shipped slate-700".

## Design Principles

These are the strategic principles. Visual rules (tokens, type, components) live in DESIGN.md and `docs/DESIGN_PATTERNS.md`.

1. **Tudo sob controle.** Every screen should answer "where am I, what just happened, what's next, do the numbers add up?" without scrolling and without a second thought. Totals visible. State always knowable. Numbers tabular-nums and never ambiguous. If a number on screen could be misread, fix the screen, not the user.

2. **Português de operador, não de startup.** Copy in plain Brazilian Portuguese as a small-business operator would speak it. No English jargon ("dashboard", "checkout", "onboarding") in user-visible text where a Portuguese word fits ("painel", "finalizar venda", "primeiros passos"). Errors apologize like a person. Empty states explain like a coworker. Marketing copy makes a specific claim instead of staging an ironic strawman.

3. **Mobile-first, sem versão capada.** The PDV is mostly used on phones and cheap Android tablets, but desktop is real (gestão, relatórios, admin work). Don't ship a stripped-down mobile experience and a "real" desktop one; ship the same complete experience that scales up. The cash-register loop must be thumb-reachable; the relatório must be readable on a 13" laptop.

4. **Restrained dark, not flat dark.** The committed-dark navy palette is the brand. Resist the reflex to "lighten it up for warmth" — warmth is carried by typography, copy, and microinteractions, not by tinting the body bg. Sky-500 is the only saturated accent; if a screen needs a second color, it's probably status (success / error / warning), not decoration.

5. **Fewer modals, fewer wizards, fewer surprises.** Operators are mid-task. Don't interrupt them with a modal when an inline edit would do. Don't gate a setting behind a five-step wizard when the form is two fields. Don't ask "are you sure?" for actions that are trivially undoable. Reserve the interruption for the things that genuinely deserve it (delete account, close caixa, charge the card).

## Accessibility & Inclusion

**Floor: WCAG AA, mobile-first, real-hardware-aware.**

- **Contrast.** Body text ≥4.5:1 against its background; large/bold text ≥3:1. Placeholder text held to the same 4.5:1 (not the muted-gray default). Status pills (success/error/warning) already shipped at WCAG-AA on the dark surface — keep that floor when adding new statuses.
- **Touch.** Primary touch targets ≥44×44px. Critical PDV actions (add item, confirm sale, finalizar pagamento) bigger than that. Avoid hover-only affordances; everything must work with a tap.
- **Mobile-first responsiveness.** Design every new screen on a 360–390px viewport first, then scale up. Test heading copy at every breakpoint; if it overflows, the design is wrong, not the device.
- **Reduced motion.** Every animation that ships needs a `@media (prefers-reduced-motion: reduce)` alternative — typically a crossfade or instant transition. Brazilian operators on older Androids will not get the motion anyway; reduce-motion is the floor, not a polish item.
- **Color independence.** No information conveyed by color alone (status pills carry text and an icon, not just a tint).
- **Real-hardware reality.** Some operators are on 3–4 year old Android tablets with slow CPUs. Avoid heavy backdrop-filter / blur / large box-shadow stacks in primary loops. Performance is an accessibility feature.
- **Portuguese-first.** All user-facing strings are Brazilian Portuguese. English in user-visible UI is a bug, not a placeholder.
