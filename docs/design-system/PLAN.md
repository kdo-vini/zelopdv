> Plano aprovado da migração para o Design System Zelo (copiado do plano da sessão de 2026-09-25). Estado atual e próximos passos: `docs/HANDOFF-design-system.md`.

# Design System Zelo + migração de tema (todas as páginas)

## Context

A nova marca Zelo (PDF de branding) é **navy `#011F4A` + branco**. O app hoje é **"tema escuro único"** (slate‑900 `#0F172A` + sky‑500 `#0EA5E9`, regra em `docs/DESIGN_PATTERNS.md`). O sky não existe na marca nova e, além disso, **reprova em acessibilidade**: texto branco sobre sky‑500 dá 2,77:1 em todo `.btn-primary`, abaixo do mínimo WCAG AA de 4,5:1.

Nesta sessão validamos a direção com mockups: o vídeo de morph (versões clara e navy), `/app` desktop (escolhido: **claro com sidebar navy**) e `/app` mobile. O pedido agora tem duas partes:
1. Transformar o que construímos no **Design System Zelo**, o novo padrão oficial.
2. Migrar **todas as páginas**: as que o cliente final vê (site, blog, login) usam **navy como principal**; as telas internas usam **superfície clara com CTA navy**.

Resultado esperado: dois temas de superfície com uma única fonte de verdade de tokens, nenhum hex ou classe de paleta solta nas telas migradas, contraste AA medido e a documentação reescrita.

### Decisões confirmadas
| Tema | Decisão |
|---|---|
| Liberação | **Flag de prévia.** A produção continua escura até todas as telas internas estarem migradas; depois o padrão vira claro de uma vez. |
| Cozinha `/app/pedidos/cozinha` | **Clara**, como o resto das telas internas. |
| Login, cadastro, esqueci/redefinir senha, `/indica/[codigo]` | **Navy (marca)**, com o cartão do formulário claro por cima. |

---

## 1. O Design System Zelo (especificação)

A fonte das decisões são os artefatos desta sessão: `zelopdv-morph*.mp4/html`, `zelopdv-app-light.html` e `zelopdv-app-mobile.html` (em `scratchpad/deliver/`). Eles vão para o repositório como referência (Fase 0).

### 1.1 Duas superfícies, um vocabulário de tokens
O mesmo nome de token vale nas duas superfícies; muda só o valor. Os componentes nunca sabem em qual superfície estão.

| Token (nomes já usados no código) | `app` (interno, claro) | `brand` (cliente final, navy) |
|---|---|---|
| `--bg-app` | `#F5F4F1` | `#011F4A` |
| `--bg-panel` / `--bg-card` | `#FFFFFF` | `#163A73` + anel interno `rgba(255,255,255,.09)` |
| `--bg-sunken` (novo) | `#F0EEEA` | `rgba(255,255,255,.08)` |
| `--bg-input` | `#FFFFFF` | `#FFFFFF` (formulário é sempre um cartão claro) |
| `--text-main` | `#011F4A` (o navy é a tinta do texto) | `#FFFFFF` |
| `--text-label` | `#34455F` | `rgba(255,255,255,.80)` |
| `--text-muted` | `#5E6C80` | `rgba(255,255,255,.62)` |
| `--border-subtle` / `--border-card` | `#E5E2DC` / `#E8E5DF` | `rgba(255,255,255,.11)` |
| `--border-strong` | `#C9CFD8` | `rgba(255,255,255,.24)` |
| `--primary` / `--primary-hover` / `--primary-text` | `#011F4A` / `#0A2F66` / `#FFFFFF` | `#FFFFFF` / `#E8ECF3` / `#011F4A` |
| `--accent`, `--ring`, `--focus` | navy; foco `rgba(1,31,74,.28)` | branco; foco `rgba(255,255,255,.35)` |
| `--status-*` (success / warning / error) | `#146C43` sobre `#E9F5EE` · `#7A5200` sobre `#FFF5DE` · `#B42318` | mantêm os valores claros atuais de `base.css` (já pensados para fundo escuro) |
| Estrutura: `--sidebar-*` e cabeçalho mobile | navy `#011F4A`, texto branco a 74%, item ativo branco a 10% | — |

- **Contraste medido:** muted/branco 5,34 · muted/`#F5F4F1` 4,85 · branco 62%/navy 6,88 · branco 62%/`#163A73` 5,31 · navy/branco 16,2 · warning 6,38 · success 5,76 · error 6,57. **Proibido:** branco abaixo de 50% sobre navy para texto (46% dá 4,37) e placeholder `#8B97A8` (2,96); placeholder usa `--text-muted`.
- **Cores de estado são funcionais, não de marca.** Só aparecem em estado (offline, estoque baixo, erro, sucesso). Cores de produto (`--zelomenu-*`, `--zelochat-*`) continuam restritas às próprias páginas.
- **Uma cor de ação por superfície.** Navy sólido no `app` e branco sólido no `brand` ficam reservados para o CTA primário, para a seleção (aba ou segmento ativo, item na comanda) e para os selos. No `app`, o segundo bloco navy é só a estrutura (sidebar ou cabeçalho mobile), nunca junto do CTA.

### 1.2 Tipografia
- **Geist** (400, 500, 600) para a interface e **Geist Mono** (500) **só para números**: dinheiro, quantidades, códigos, atalhos, horários. Números sempre com `tabular-nums`.
- Hospedar os arquivos `.woff2` em `static/fonts/`, com `font-display: swap` e `preload` do Geist 500. Hoje o app não define fonte (usa a fonte de sistema do Tailwind).
- Escala: 12 / 13,5 / 14,5 (corpo) / 17 / 22 (título de página, 600, tracking −0,02em). Rótulo de seção: 10,5, maiúsculas, tracking 0,12em. Dinheiro em destaque: 20 a 32 em mono.
- Nome de produto em minúsculas normais, **não** em CAIXA ALTA (hoje o `VirtualProductGrid` usa `uppercase`).

### 1.3 Forma, espaço, elevação e movimento
- **Raios:** 9 (segmento) · 12 (input, botão) · 14 a 15 (card, tile) · 16 (CTA) · 22 a 26 (sheet, superfície) · 999 (pílula). Mapear para `--radius-*` no `@theme`.
- **Espaço:** grade de 4 px. Gutter de página 24 no desktop e 16 no mobile. Alvo de toque ≥ 44 px (CTA 60 a 64).
- **Elevação:** borda de 1 px como padrão. Sombra só para o que flutua (CTA, sheet, popover), com tom navy: `0 10px 24px -12px rgba(1,31,74,.7)`. **Proibido:** glow, gradiente em elementos de interface, `backdrop-blur` decorativo.
- **Movimento:** molas com no máximo um leve overshoot (ζ ≈ 0,82 a 0,9), duração de 150 a 320 ms, sem easing "bouncy". Troca de conteúdo com blur curto. Respeitar `prefers-reduced-motion`. Tokens `--ease-spring` e `--dur-*`.

### 1.4 Ícones
- `lucide-svelte` (já é dependência), com **`stroke-width` 1,75 em todo lugar**, tamanho 18 a 20 px e `currentColor`. Hoje o traço padrão do Lucide é 2 e há restos de SVG inline do Heroicons em `/app`.
- Ícones de mídia (play, pause etc.) preenchidos. Nunca misturar traços diferentes na mesma tela.

### 1.5 Catálogo de componentes (em `src/lib/components/ui/`, estendendo o shadcn/bits‑ui que já existe)
| Componente | Origem no mockup | Observação |
|---|---|---|
| `Button` (variantes `primary`, `outline`, `ghost`, `danger`; tamanhos `md`, `lg`, `cta`) | todos | `cta` = 60 a 64 px, total em mono e `Kbd` opcional |
| `Kbd` | F2, F4, F6, F9, ⌘K | chip mono |
| `Input` / `SearchField` | busca do `/app` | anel de foco de 4 px `--focus` |
| `Segmented` | Retirada/Delivery, tabelas de preço | segmento ativo = superfície com borda |
| `Tabs` (sublinhado) | categorias | indicador de 2 px `--primary` e contador em mono |
| `Tile` (produto) | grade do `/app` | estados: normal / na comanda (anel navy + `QtyBadge`) / estoque baixo |
| `QtyBadge`, `StatusPill`, `StatusDot` | contador, "Caixa #12 aberto", "1 venda offline" | |
| `Stepper` | comanda | 30 px no desktop, 40 px no mobile |
| `MoneyText` | todos os valores | formata em pt‑BR, mono, `R$` menor |
| `AppShell` + `Sidebar` (navy) + `PageHeader` (breadcrumb e título) | desktop | substitui o visual do `GestaoSidebar` |
| `MobileHeader` (navy) + `BottomNav` (claro) + `CartBar` + `Sheet` (com `SwipeRow`) | mobile | reestiliza o `MobileBottomNav` sem mudar a lógica |
| `Toast`, `Dialog`, `ConfirmDialog`, `CommandPalette` (⌘K), `Tooltip` | vídeo e global | |
| Gráficos | vídeo (linha, área e tooltip) | tokens `--chart-*` recalculados e espelhados em `chartColors.js` |

### 1.6 Onde o sistema vive
- `src/themes/tokens.css` (primitivos e escala), `src/themes/surface-app.css` e `src/themes/surface-brand.css` (valores semânticos por `[data-surface]`), mais um bloco `@theme inline` que expõe utilitários semânticos: `bg-app`, `bg-panel`, `bg-sunken`, `text-main`, `text-muted`, `border-subtle`, `bg-primary`, `text-primary-fg`.
- **`docs/DESIGN_SYSTEM.md`** vira o documento canônico (princípios, tokens, contraste, componentes, faça/não faça, capturas). O `docs/DESIGN_PATTERNS.md` é reescrito: sai a regra "Tema escuro único"; ficam shell, cabeçalho, formulários e checklist, agora apontando para o Design System.
- **Página viva `/dev/design-system`** (a rota `/dev/*` já é pública): renderiza os tokens das duas superfícies, a escala tipográfica e todos os componentes. Serve de verificação visual e de referência.
- **Referências** (vídeo, HTMLs, PNGs dos mockups) em `docs/design-system/reference/`.

---

## 2. Arquitetura de tema

1. **Atributo de superfície no `<html>`, definido no servidor (sem flash de tema):**
   - O `src/app.html` troca `class="dark"` por `data-surface="%zelo.surface%"`.
   - O `src/hooks.server.js` resolve o valor em `resolve(event, { transformPageChunk })` a partir do pathname e da flag. O ponto de entrada é o `resolve` na linha ~91.
   - O `+layout.svelte` atualiza o atributo nas navegações do cliente (`afterNavigate`).
2. **Mapa de superfícies** (`src/lib/theme/surface.js`, função pura e testada):
   - `app`: `/app/**` (inclui mesas, pedidos e cozinha), `/gestao/**`, `/relatorios`, `/perfil`, `/assinatura/**`, `/offline-shell`, `/ferramentas` (hub interno).
   - `brand`: `/`, `/para-*`, `/vs-*`, `/blog/**`, `/precificacao`, `/extensoes`, `/comparativos`, `/zelo-impressao`, `/sobre`, `/contato`, `/termos`, `/privacidade`, `/landing`, `/pascoa`, `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`, `/auth/callback`, `/indica/*`.
   - **A confirmar:** `/ferramentas/precificacao` e `/ferramentas/cardapio` não têm guard, então podem ser ferramentas públicas de SEO. Se forem, ficam em `brand`. O `PricingCalculator`, compartilhado, precisa funcionar nas duas superfícies.
3. **Flag de prévia (só para a superfície `app`):**
   - Cookie `zelo_ui=v2`, ligado por `?tema=novo` e desligado por `?tema=atual`. O hook lê o cookie para o SSR.
   - Sem a flag, as telas internas recebem `data-surface="legacy"`, que é exatamente o `base.css` atual.
   - As páginas `brand` **não** ficam atrás da flag, porque não mudam de claro para escuro, só trocam de paleta.
   - Na Fase 6, `legacy` é removido e o padrão vira `app`.
4. **Uma única fonte de verdade para os tokens.** Hoje `--primary` e `--accent` são definidos duas vezes (`base.css` em `layer(base)` e `app.css`, na linha ~464, fora de layer, que vence). O bloco shadcn passa a só apontar para os semânticos (`--background: var(--bg-app)` etc.), e o `base.css` é renomeado para `surface-legacy.css`.
5. **Superfícies sobrepostas locais:** `data-surface` pode ser aninhado. Um modal ou dropdown dentro do `brand` que precise ser claro, como o cartão de login, usa `data-surface="app"`. Isso resolve o formulário claro sobre navy sem criar exceções.
6. **Partes que não são DOM:**
   - `src/lib/theme/chartColors.js` passa a ter paletas por superfície, geradas a partir de uma tabela em JS que também escreve os `--chart-*`.
   - `src/lib/server/emailTemplates.js` e `adminCommunications.js` são rebrandeados para navy e branco.
   - Manifest do PWA (`vite.config.*`, `theme_color` `#0f172a` → `#011F4A`) e `<meta name="theme-color">` em `app.html` (`#0ea5e9` → `#011F4A`).
   - Favicon, ícones do PWA, `logo-horizontal*` e `og-image*` passam para o mascote novo. **Depende dos arquivos vetoriais da agência.**
   - `receipt.js` e impressão térmica ficam como estão (preto e branco é o correto).

---

## 3. Fases

Cada fase é um PR próprio. Em toda fase: `npm test`, `npm run check`, `npm run build` e as capturas visuais (ver Verificação).

**Fase 0 — Base e travas (sem mudança visual)**
- Criar `tokens.css`, `surface-*.css`, `surface.js` (com testes Vitest), o hook e o atributo, a flag, `@theme` semântico e as fontes Geist. `legacy` tem os mesmos valores de hoje, então nada muda na tela.
- Script `npm run check:ui` (`scripts/check-ui-tokens.mjs`): falha se aparecer classe de paleta (`slate|sky|gray|zinc|blue…-NNN`), `text-white`/`bg-black` ou hex solto em arquivos da lista "migrados". A lista cresce a cada fase. Entra no CI.
- Baseline de capturas com Playwright (`e2e/visual.spec.js`, `toHaveScreenshot`) para cerca de 25 rotas, em desktop (1440) e mobile (390), nas superfícies atuais.
- Adicionar `docs/DESIGN_SYSTEM.md` (rascunho), as referências dos mockups e a rota `/dev/design-system`.

**Fase 1 — Componentes do sistema**
- Construir ou atualizar os componentes da seção 1.5 usando só utilitários semânticos, cada um conferido em `/dev/design-system` nas duas superfícies.
- Migrar os componentes globais do layout raiz, que aparecem nas duas superfícies: `ConfirmDialog`, `OfflineStatus`, `OfflineCenter`, `OfflineAdjustments`, `UpdateAvailable`, `SupportChat`, toasts.
- Padronizar os ícones (traço 1,75 e trocar os SVGs Heroicons restantes pelo Lucide).

**Fase 2 — Superfície `brand` (vai direto ao ar, sem flag)**
- O shell público (`SiteHeader`, `MarketingFooter`, `components/marketing/*`: 9 arquivos, 84 classes de paleta e 57 de `white`/`black`) passa a usar os tokens `brand`. Os `--marketing-*` atuais viram apelidos dos semânticos `brand`.
- Rotas por ordem de tráfego: `/` → `/para-*` / `/vs-*` → `/precificacao` → `/extensoes` (48 de paleta, 53 de `white`/`black`) → `/vs-planilha` → `/comparativos` → `/zelo-impressao` → `/sobre`, `/contato`, `/termos`, `/privacidade` → `/blog/**`. O blog já tem superfície editorial clara (`--blog-*`); ela vira uma seção "papel" (`#ECEAE6`/branco) dentro do `brand`, porque leitura longa rende melhor em fundo claro.
- `/pascoa` é campanha sazonal (46 de paleta, 80 de `white`/`black`, 34 hex). Isolar num escopo próprio e migrar só se estiver ativa; se não estiver, marcar como legado.
- Revisar o texto do hero e o vídeo navy na home. O loop que já produzimos serve como peça de hero ou de redes.

**Fase 3 — Autenticação (`brand` com cartão `app`)**
- `AuthLayout.svelte`, `GoogleAuthButton`, `EmailSentHelper` e as 5 rotas de auth. O fundo navy leva o mascote; o formulário fica num cartão claro com `data-surface="app"` e CTA navy; o link secundário fica branco no fundo navy.

**Fase 4 — Superfície `app` (atrás da flag `zelo_ui=v2`)**
Ordem por uso diário e por risco:
1. **Estrutura:** reestilizar `GestaoSidebar` (sidebar navy), `MobileBottomNav` (claro com ativo navy e cabeçalho mobile navy) e `PageHeader`. A lógica de `appNavigation.js` não muda.
2. **`/app` (frente de caixa):**
   - Arquivos: `src/routes/app/+page.svelte` (hotspot: 58 de paleta, 31 rgba), `VirtualProductGrid.svelte` (`bg-slate-800/40`, `text-sky-400`, `uppercase`), a comanda e a `CartBar` mobile.
   - Seguir o mockup aprovado: F2/F4/F6/F9, `QtyBadge` e pílula de caixa.
   - **Os atalhos são novos:** implementá-los só se ainda não existirem, com testes, e sem conflitar com os campos de texto.
3. **Modais do PDV:** `ModalPagamento` (hotspot), `ModalSucesso`, `ModalQuantidade`, `ModalValorAvulso`, `ModalAbrirCaixa`, `ModalMovCaixa`, `ModalProdutoMontavel`, `ModalNovoProduto`, `payments/*`.
4. **Operação:** `/app/mesas` e `/app/mesas/[id]` (hotspot), `/app/pedidos`, `/app/pedidos/cozinha` (clara, com tipografia maior para leitura à distância), `orders/*`.
5. **Gestão:** `/gestao/*` (16 arquivos: 46 de paleta e 28 de status), começando por `/gestao/produtos` (hotspot), `caixa`, `estoque`, `pessoas`, `fichario`, `despesas`, `mesas`, `acessos`, `empresas`, `extensoes`, `indicacoes` e `gerente/*` (`components/gerente/*`).
6. **Relatórios e gráficos:** `/relatorios` (hotspot), `components/charts/*`, `chartColors.js`.
7. **Conta:** `/perfil` (hotspot), `/assinatura/**` (hotspot; ler o `[[BILLING]]` antes), `/ferramentas/**` (134 hex, principalmente em `tools/*`), `/offline-shell`.

**Padrão de migração, repetido em cada arquivo:**
- classe de paleta → utilitário semântico;
- `text-white` que significava "texto principal" → `text-main`;
- cor de status direta (`text-green-400`, `bg-red-500/10`…) → `StatusPill` ou tokens `--status-*`;
- hex ou rgba solto → token;
- botão ou markup legado → componente do sistema.

Nenhuma mudança de lógica nesses PRs: só apresentação. Os hotspots vão em PRs dedicados, com capturas antes e depois.

**Fase 5 — Partes que não são DOM e assets**
- E-mails transacionais (`emailTemplates.js`, testados com renderização de snapshot), PWA e `theme-color`, favicon, ícones, OG e logos (quando os vetores chegarem), `chartColors.js` para PDF e canvas.

**Fase 6 — Virada e limpeza**
- A superfície `app` vira padrão para todos; remover `legacy`, a flag e o `class="dark"`, e apagar os tokens mortos (`--sidebar-item-active-bg: #FFFFFF` e similares).
- O `check:ui` passa a valer para o repositório inteiro.
- Atualizar `[[CURRENT]]`, `[[FIXES_PROGRESS]]`, `[[ZeloPDV.memory]]`, `[[TRADEOFFS]]` e o `CLAUDE.md` (a seção "Convenções" deve apontar para o Design System).

---

## 4. Fora do escopo (acompanhamento separado)
- `admin-dashboard/`: app separado, uso interno; migrar depois reaproveitando os `tokens.css`.
- Identidades ZeloMenu (roxo) e ZeloChat (verde): continuam dentro das próprias páginas e componentes.
- Impressão térmica e recibos.

## 5. Riscos e como tratar
- **Arquivos grandes (hotspots) com lógica crítica** (`ModalPagamento`, `/app`, `mesas/[id]`): PR só de apresentação, e2e `pdv.spec.js` e `operational.spec.js` verdes, revisão com capturas.
- **Texto invisível depois da inversão** (`text-white` sobre branco): o `check:ui` barra, e as capturas por rota mostram.
- **Sistema misturado em produção:** resolvido pela flag. Só a superfície `brand` vai ao ar antes, e ela é consistente por si só.
- **Dependência de design:** o mascote e o logo em vetor vêm da agência. Até lá, usar o PNG atual.

## 6. Verificação
- **Unitário:** Vitest para `surface.js` (cada rota → superfície; flag ligada e desligada), para a tabela de cores dos gráficos (`chartColors` = `--chart-*`) e para os snapshots de e-mail.
- **Contraste:** um teste percorre os pares de tokens das duas superfícies e exige ≥ 4,5:1 para texto e ≥ 3:1 para elementos de interface.
- **Capturas:** `e2e/visual.spec.js` em 1440 e 390. As baselines são atualizadas por fase, de propósito, e a comparação fica no PR.
- **Funcional:** `npm run test:e2e` (`pdv`, `operational`, `auth`, `marketing-home`, `access-control`), `npm test`, `npm run check`, `npm run build`, `npm run check:ui`.
- **Manual:** `/dev/design-system` nas duas superfícies; percorrer `?tema=novo` em `/app` (venda completa em dinheiro, Pix e fiado; modo offline), mobile real (iOS e Android) e impressão.

---

## 7. Hierarquia tipográfica (adicionado em 2026-09-25, decisão do produto: "Mono como voz da marca")

**Por quê.** O PDF de marca usa **Geist Mono** em todo o texto (verificado nas fontes embutidas: `GeistMono-Regular` e `GeistMono-UltraBlack`, págs. 1–14). No código hoje não há hierarquia:
- 18 arquivos com `font-family` escrito à mão (`'Inter'` ×3, `monospace` ×5, `'Geist'`/`'Geist Mono'` literais ×5);
- 92 valores distintos de `font-size`;
- 937 classes de tamanho Tailwind, 49 delas arbitrárias (`text-[13px]`);
- 571 classes de peso;
- 25 atalhos `font:` inline.

Mono em tudo foi medido e descartado para as telas densas: o texto fica em média **17% mais largo** que em Geist (7% a 29%; "Bolo de cenoura (fatia)" +29%).

**Regra.** Geist Mono = voz da marca e números. Geist (irmã proporcional, mesma família) = texto corrido denso.

| Papel | Fonte | Tamanho / peso / entrelinha / tracking | Uso |
|---|---|---|---|
| `display` | Geist Mono | 40–56 / 500 / 1.05 / −0.03em | hero e chamadas do site (brand), momentos de marca |
| `title` | Geist Mono | 22 / 600 / 1.1 / −0.02em | título de página ("Frente de Caixa") |
| `heading` | Geist | 17–18 / 600 / 1.2 / −0.015em | título de card, modal, seção |
| `eyebrow` | Geist Mono | 10.5 / 500 / 1 / 0.12em, maiúsculas | rótulo de seção, breadcrumb |
| `body` | Geist | 14.5 / 400 / 1.4 | texto corrido |
| `body-strong` | Geist | 14.5 / 500 / 1.3 / −0.01em | nome de produto, item de lista |
| `label` | Geist | 13.5 / 500 / 1.2 | botões, navegação, campos |
| `caption` | Geist | 12 / 400 / 1.4 | apoio, dicas |
| `num-sm` · `num-md` · `num-lg` · `num-xl` | Geist Mono, `tabular-nums` | 13 · 14.5 · 20 · 32 / 500, tracking −0.02 a −0.03em | dinheiro, quantidades, códigos, horas |
| `kbd` | Geist Mono | 11 / 500 | atalhos |

No site (brand), a Mono também assume títulos de seção e CTAs principais, para dar mais cara de PDF. O texto corrido continua em Geist.

**Implementação**
1. Tokens `--type-<papel>-{font,size,weight,leading,tracking}` em `src/themes/tokens.css`, mais utilitários `@utility type-<papel>` em `app.css` (um papel = uma classe; nada de combinar tamanho, peso e fonte à mão).
2. `MoneyText`, `Kbd`, `UnderlineTabs`, `PageHeader` e os demais componentes zelo passam a usar os papéis. O `/app` troca o `h1` e o breadcrumb para `title`/`eyebrow` em Mono.
3. O `check:ui` passa a barrar, nos arquivos migrados: `font-family` literal, `font:` inline com tamanho literal, `text-[Npx]` arbitrário e `font-mono`. Tamanho e família só por papel.
4. **Na migração de cada tela** (fases 2–4): trocar tamanho, peso e família soltos pelo papel correspondente. Remover `'Inter'` e `monospace` genéricos. As 92 medidas colapsam nos 12 papéis acima.
5. Documentar em `DESIGN.md` (tipografia) e `docs/DESIGN_SYSTEM.md` (utilitários e regra do `check:ui`), com a escala visível em `/dev/design-system`.
6. **Ordem:** junto com a integração dos pacotes A–D (antes de migrar mais telas), para que as próximas já nasçam com os papéis.
