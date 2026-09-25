---
name: Zelo
description: Design System Zelo — navy e branco. O sistema interno é um balcão claro onde só a ação é navy; tudo que o cliente vê antes de entrar é navy com ação branca. Todo número em mono tabular.
colors:
  # Brand primitives (medidas no PDF de marca, págs. 12–15)
  navy: "#011F4A"
  navy-hover: "#0A2F66"
  navy-raised: "#163A73"
  navy-track: "#2F4B7C"
  white: "#FFFFFF"
  # Surface APP — sistema interno (claro)
  app-bg: "#F5F4F1"
  app-panel: "#FFFFFF"
  app-sunken: "#F0EEEA"
  app-ink: "#011F4A"
  app-ink-label: "#34455F"
  app-ink-muted: "#5E6C80"
  app-line: "#E5E2DC"
  app-line-card: "#E8E5DF"
  app-line-strong: "#C9CFD8"
  app-action: "#011F4A"
  app-action-hover: "#0A2F66"
  app-action-ink: "#FFFFFF"
  app-focus: "rgba(1,31,74,0.28)"
  app-success: "#146C43"
  app-success-bg: "#E9F5EE"
  app-warning: "#7A5200"
  app-warning-bg: "#FFF5DE"
  app-error: "#B42318"
  app-error-bg: "#FDECEA"
  # Surface BRAND — o que o cliente final vê (navy)
  brand-bg: "#011F4A"
  brand-panel: "#163A73"
  brand-sunken: "rgba(255,255,255,0.08)"
  brand-ink: "#FFFFFF"
  brand-ink-label: "rgba(255,255,255,0.80)"
  brand-ink-muted: "rgba(255,255,255,0.62)"
  brand-line: "rgba(255,255,255,0.11)"
  brand-action: "#FFFFFF"
  brand-action-hover: "#E8ECF3"
  brand-action-ink: "#011F4A"
  brand-success: "#4ADE80"
  brand-warning: "#FBBF24"
  brand-error: "#FCA5A5"
  # Canvas for marketing/motion pieces
  canvas-warm: "#ECEAE6"
typography:
  display:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "clamp(2.5rem, 3.2vw + 0.875rem, 3.5rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  eyebrow:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "0.65625rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.12em"
    textTransform: uppercase
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.90625rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  body-strong:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.90625rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.84375rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  num-sm:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' on"
  num-md:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "0.90625rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' on"
  num-lg:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' on"
  num-xl:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' on"
  kbd:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  segment: "9px"
  control: "12px"
  card: "14px"
  cta: "16px"
  sheet: "24px"
  pill: "9999px"
spacing:
  unit: "4px"
  gutter-mobile: "16px"
  gutter-desktop: "24px"
  touch-min: "44px"
  cta-height: "64px"
components:
  button-primary:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-action-ink}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  button-outlined:
    backgroundColor: "{colors.app-panel}"
    textColor: "{colors.app-ink}"
    border: "1px solid {colors.app-line}"
    rounded: "{rounded.control}"
    height: "40px"
  button-cta:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-action-ink}"
    rounded: "{rounded.cta}"
    height: "64px"
    shadow: "0 10px 24px -12px rgba(1,31,74,0.7)"
  input-search:
    backgroundColor: "{colors.app-panel}"
    textColor: "{colors.app-ink}"
    border: "1px solid {colors.app-line}"
    focusRing: "0 0 0 4px {colors.app-focus}"
    rounded: "{rounded.control}"
    height: "48px"
  segmented:
    backgroundColor: "{colors.app-sunken}"
    selectedBackground: "{colors.app-panel}"
    rounded: "{rounded.control}"
  tabs-underline:
    indicator: "2px {colors.app-action}"
  product-tile:
    backgroundColor: "{colors.app-panel}"
    border: "1px solid {colors.app-line-card}"
    selectedRing: "2px {colors.app-action}"
    rounded: "{rounded.card}"
    minHeight: "118px"
  qty-badge:
    backgroundColor: "{colors.app-action}"
    textColor: "{colors.app-action-ink}"
    rounded: "{rounded.pill}"
  sidebar:
    backgroundColor: "{colors.navy}"
    textColor: "rgba(255,255,255,0.74)"
    activeBackground: "rgba(255,255,255,0.10)"
---

# Design System: Zelo

> Implementação, arquitetura de superfícies, regras de código e migração: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
> Referência viva (fora de produção): `/dev/design-system`.
> Estado atual: a produção ainda mostra o tema legado (slate + sky) nas telas não migradas — ver a tabela de fases em `docs/DESIGN_SYSTEM.md`.

## 1. Visão geral: navy e branco, uma cor de ação por superfície

A marca Zelo é navy `#011F4A` e branco. O sistema aplica essa dupla em duas **superfícies** que compartilham o mesmo vocabulário de componentes e tokens:

- **App** (sistema interno — PDV, gestão, relatórios, perfil, assinatura): superfícies claras e quentes, texto navy, **ação navy**. A estrutura (sidebar no desktop, cabeçalho no mobile) é navy e ancora a marca; o CTA primário é o único outro bloco navy sólido, e fica sempre longe da estrutura.
- **Brand** (tudo que o cliente final vê antes de entrar — site, landing pages, blog, login, cadastro): fundo navy, cartões navy elevado, texto branco, **ação branca com texto navy**. Formulários claros e leitura longa aninham uma superfície App.

Por que claro por dentro: operação de caixa acontece em loja iluminada, por horas, lendo preços e totais. Texto escuro em fundo claro lê melhor nessas condições (efeito de polaridade positiva — Buchner & Baumgartner 2007; Piepenbrock et al. 2013), e deixa o navy livre para significar uma coisa só: "aqui é a ação".

## 2. Cores

### Regras nomeadas
- **Uma cor de ação por superfície.** Navy sólido (App) ou branco sólido (Brand) só em: CTA primário, seleção (aba, segmento, item na comanda) e selos de contagem.
- **O navy é a tinta.** No App o texto é navy `#011F4A`, não preto nem cinza neutro.
- **Estado não é marca.** Verde, âmbar e vermelho só aparecem para estado (sucesso, atenção, erro). Nunca decoram.
- **Cores de produto ficam em casa.** ZeloMenu (roxo) e ZeloChat (verde) só nas próprias páginas e selos de canal.
- **Contraste medido, não estimado.** Texto ≥ 4,5:1, limites de controle ≥ 3:1 — verificado em teste (`tests/themeContrast.test.js`). Números: navy/branco 16,2 · apoio App 5,34 (branco) / 4,85 (fundo) · apoio Brand 6,88 (navy) / 5,31 (navy elevado).
- **Branco translúcido sobre navy nunca abaixo de 50% para texto** (46% = 4,37:1, reprova).

## 3. Tipografia

**Geist Mono é a voz da marca** (o PDF de marca é todo em Mono): títulos de página, rótulos de seção/breadcrumb, números e, no site, títulos de seção e CTAs principais. **Geist**, a irmã proporcional da mesma família, carrega o texto denso: nomes de produto, listas, formulários, botões. Mono em tudo foi medido e descartado nas telas densas (+17% de largura em média, até +29%).

| Papel | Fonte | Tamanho / peso / entrelinha / tracking | Uso |
|---|---|---|---|
| `display` | Mono | 40–56 / 500 / 1,05 / −0,03em | hero, momentos de marca |
| `title` | Mono | 22 / 600 / 1,1 / −0,02em | título de página ("Frente de Caixa") |
| `heading` | Geist | 18 / 600 / 1,2 / −0,015em | título de card, modal, seção |
| `eyebrow` | Mono | 10,5 / 500 / 1 / 0,12em, maiúsculas | rótulo de seção, breadcrumb |
| `body` | Geist | 14,5 / 400 / 1,4 | texto corrido, campos |
| `body-strong` | Geist | 14,5 / 500 / 1,3 | nome de produto, item de lista |
| `label` | Geist | 13,5 / 500 / 1,2 | botões, navegação, rótulos de campo |
| `caption` | Geist | 12 / 400 / 1,4 | apoio, dicas |
| `num-sm` · `num-md` · `num-lg` · `num-xl` | Mono, tabular | 13 · 14,5 · 20 · 32 / 500 | dinheiro, quantidades, códigos, horas |
| `kbd` | Mono | 11 / 500 | atalhos e contadores |

- Dinheiro: `R$` pequeno em Geist + valor em Mono (`num-lg` no tile, `num-xl` no total).
- Nome de produto em caixa normal, nunca CAIXA ALTA.
- Números nunca em Geist proporcional em listas ou tabelas.
- Nada de tamanho, peso ou família soltos: cada texto tem um papel (implementação: `docs/DESIGN_SYSTEM.md` → Tipografia).

## 4. Forma, espaço, elevação e movimento

- **Raios:** segmento 9 · controle (input, botão) 12 · card/tile 14 · CTA 16 · sheet 24 · pílula.
- **Espaço:** grade de 4 px; gutter 16 (mobile) / 24 (desktop); alvo de toque ≥ 44 px; CTA 60–64 px.
- **Elevação:** borda de 1 px é o padrão. Sombra só no que flutua (CTA, sheet, popover), tingida de navy. Sem glow, sem gradiente em interface, sem blur decorativo.
- **Movimento** (padrão: `docs/design-system/reference/zelopdv-morph.html`; implementação: `docs/DESIGN_SYSTEM.md` → Movimento):
  - molas em tudo, no máximo um leve overshoot (`--zelo-ease-spring`, ζ 0,84, 0,8%), 150–320 ms;
  - **uma forma que se transforma** (tamanho, raio, cor) e o conteúdo dentro troca com **blur curto**: sai ~90% em 70 ms, entra 70 ms depois, nunca juntos;
  - **aperto**: escala 0,965 ao pressionar, volta com mola;
  - **indicador líquido** em abas e segmentos: a borda que lidera é rígida, a que segue é macia — estica e alcança;
  - **botão → carregando → check** (`MorphButton`) para ações assíncronas; **números contam** em vez de pular;
  - `prefers-reduced-motion` zera as durações.

## 5. Componentes

| Componente | Anatomia |
|---|---|
| **Botão** (`primary`, `outlined`, `quiet`, `danger`; `md` 40, `touch` 48, `cta` 64) | CTA: rótulo à esquerda, atalho `Kbd`, total em Mono à direita |
| **SearchField** | ícone de busca, campo 15px, atalho à direita; foco = anel de 4px |
| **Segmented** | trilho rebaixado; segmento ativo = superfície com borda |
| **Tabs (sublinhado)** | indicador 2px na cor de ação; contador em Mono |
| **ProductTile** | nome (caixa normal), meta, preço em Mono; na comanda: anel de ação + `QtyBadge`; estoque baixo: ponto âmbar + "N restantes" |
| **StatusPill** | neutra (com ponto), ok, atenção, erro |
| **Stepper** | 30px desktop / 40px toque |
| **Estrutura** | Desktop: sidebar navy + área clara. Mobile: cabeçalho navy + área clara com cantos 22 + barra inferior clara (ativo navy) + CartBar navy flutuante + comanda em sheet |

## 6. Faça e não faça

### Faça
- Use os tokens semânticos (`var(--text-muted)`, `bg-surface-panel`, `text-ink-muted`, `bg-action`…).
- Use Lucide com traço **1,75** em todo lugar, 18–20 px, `currentColor`.
- Mostre atalhos de teclado nas ações frequentes do caixa.
- Aninhe `data-surface="app"` para um cartão claro dentro do Brand.

### Não faça
- Não escreva hex, `rgb()`, classes de paleta Tailwind (`bg-slate-800`, `text-sky-400`) ou `text-white` em arquivos migrados — `npm run check:ui` barra.
- Não coloque dois blocos navy sólidos lado a lado (ex.: barra inferior navy + CartBar navy).
- Não use sky/azul-claro: não existe na marca.
- Não misture espessuras de traço de ícone na mesma tela.
- Não use easing "bouncy", glow, gradiente em interface ou partículas.
