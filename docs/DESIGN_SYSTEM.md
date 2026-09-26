# Design System Zelo — implementação e migração

> Linguagem visual (cores, tipografia, componentes, faça/não faça): [`DESIGN.md`](../DESIGN.md) na raiz.
> Este documento: **como o sistema está implementado, as regras de código e o plano de migração.**
> Referência viva: `/dev/design-system` (local e previews da Vercel; 404 em produção).
> Referências de origem (mockups aprovados): `docs/design-system/reference/`.

## Estado

| Fase | Escopo | Status |
|---|---|---|
| 0 | Base: tokens, superfícies, flag, travas, documentação, componentes primitivos | **Entregue** — sem mudança visual (0 pixels em 16 rotas × 2 larguras) |
| 1 | Componentes do sistema + globais do layout raiz + ícones 1,75 | **Em andamento** — globais do layout (toasts, confirmação, offline, atualização, chats, bottom nav) atrás da flag |
| 2 | Superfície Brand no ar (site, landing, blog) | **Pronta atrás da flag** — Geist + títulos em Mono, tokens `mk-*` nas 8 páginas/componentes com paleta Tailwind, erro legível; legado idêntico (full page). Falta ligar `LIVE_SURFACES.brand` (decisão do dono) |
| 3 | Autenticação (Brand + cartão App) | **Pronta atrás da flag** — `AuthLayout` navy com cartão `data-surface="app"`, marca Zelo + título Mono; `.auth-*` restilizados só dentro do cartão; legado idêntico |
| 4 | Superfície App atrás da flag (estrutura → `/app` → modais → operação → gestão → relatórios → conta) | **Em andamento** — sidebar navy (métricas do mockup) e `/app` (desktop + mobile) no layout do mockup, com o sistema de movimento; modais do PDV (pagamento, sucesso, quantidade, avulso, caixa, montável, novo produto), toasts, confirmação, offline e bottom nav no sistema; mesas, pedidos, cozinha e gestão (dashboard, produtos, pessoas, estoque, despesas, fichário, cadastro de mesas) e relatórios reescritos (mockups 01–03 aprovados); demais telas internas legíveis pela camada de compatibilidade (`compat-app.css`), reescrita tela a tela pendente |
| 5 | E-mails, PWA/`theme-color`, favicon/OG/logos, `chartColors.js` | **Parcial** — e-mails (onboarding, nudge, convite, comunicados do admin) em navy/papel; `theme_color` do PWA e `<meta theme-color>` em `#011F4A`. Pendente: favicon/ícones/OG/logos (aguardam os vetores do mascote) ; `chartColors.js` entregue (paleta por superfície) |
| 6 | Virada: App padrão, remover legado/flag/`class="dark"`, `check:ui` no repo todo | Pendente |

## Superfícies

Cada página renderiza em uma superfície, escrita em `<html data-surface="…">` **no servidor** (sem flash):

| Superfície | Onde | Aparência |
|---|---|---|
| `app` | `/app/**` (inclui mesas, pedidos, cozinha), `/gestao/**`, `/relatorios`, `/perfil`, `/assinatura/**`, `/ferramentas/**`, `/offline-shell` | claro, tinta navy, ação navy |
| `brand` | todo o resto: `/`, `/para-*`, `/vs-*`, `/blog/**`, `/precificacao`, `/extensoes`, `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`, `/auth/*`, `/indica/*`… | navy, tinta branca, ação branca |
| `legacy` | qualquer rota cuja superfície ainda não está no ar | tema escuro pré-Zelo (slate + sky), valor por valor |

- Mapa: `src/lib/theme/surface.js` (`surfaceForPath`, `resolveSurface`, `LIVE_SURFACES`), testado em `tests/themeSurface.test.js`. `APP_SURFACE_PREFIXES` espelha `sidebarLayoutPrefixes` do `+layout.svelte`.
- Servidor: `src/hooks.server.js` troca `%zelo.surface%`, `%zelo.htmlclass%` e `%zelo.head%` de `src/app.html` (o `%zelo.head%` pré-carrega a Geist só fora do legado). Rotas pré-renderizadas são geradas com a superfície no ar e ressincronizadas no cliente.
- Cliente: `applySurfaceToDocument` roda no `afterNavigate` do layout raiz.
- **Aninhamento:** qualquer elemento pode declarar `data-surface`. Um cartão de login claro sobre o navy é `<div data-surface="app">`. Os tokens derivados (`src/themes/derived.css`) são redeclarados em cada fronteira de superfície de propósito — uma custom property que referencia outra é resolvida onde é declarada.
- `dark:` do Tailwind vale no legado e no Brand e **nunca** dentro de `data-surface="app"` (variante customizada em `src/app.css`).

### Prévia (flag)

- `?tema=novo` grava o cookie `zelo_ui=v2` (180 dias) e mostra as superfícies reais; `?tema=atual` apaga.
- Sem a flag, uma superfície que não está em `LIVE_SURFACES` renderiza como `legacy`. A Fase 2 liga `brand`; a Fase 6 liga `app` e remove o legado.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/themes/tokens.css` | Primitivos: paleta Zelo (`--zelo-*`), fontes, raios, molas/durações, constantes de layout (`--radius`, nav mobile), `@font-face` da Geist |
| `src/themes/surface-legacy.css` | Tema pré-Zelo, valores idênticos ao antigo `base.css` + nomes novos inertes (`--bg-sunken`, `--focus`, `--elevation-float`) + paleta shadcn |
| `src/themes/surface-app.css` / `surface-brand.css` | Valores semânticos por superfície (mesmos nomes de token que o código já usa: `--bg-app`, `--text-main`, `--primary`…) + paleta shadcn + aliases de marketing/blog |
| `src/themes/derived.css` | Séries de gráfico e sombra de modal, derivadas dos semânticos |
| `src/app.css` → `@theme inline` | Utilitários semânticos do Tailwind (abaixo) |
| `static/fonts/` | Geist / Geist Mono (`.woff2`, SIL OFL — `OFL.txt`) |
| `src/lib/components/zelo/` | Primitivos do sistema (catálogo abaixo) |
| `src/lib/motion/` | Movimento: molas em forma fechada, transições e indicador líquido (seção **Movimento**) |
| `src/lib/components/ui/button` | shadcn `Button` com variantes do sistema (`primary`, `outlined`, `quiet`, `danger`; tamanhos `md`, `touch`, `cta`, `icon-md`) — variantes antigas intactas |

### Utilitários semânticos (Tailwind)

Nomes próprios para não colidir com as classes legadas `.text-main`/`.text-muted` nem com os utilitários shadcn (onde `text-muted` = `--color-muted`, que é um **fundo**):

| Utilitário | Token |
|---|---|
| `bg-surface-app` · `-panel` · `-card` · `-sunken` · `-input` | `--bg-*` |
| `text-ink` · `text-ink-label` · `text-ink-muted` | `--text-main` / `--text-label` / `--text-muted` |
| `border-line` · `border-line-card` · `border-line-strong` | `--border-*` |
| `bg-action` · `hover:bg-action-hover` · `text-action-fg` | `--primary` / `--primary-hover` / `--primary-text` |
| `ring-focus` | `--focus` |
| `text-ok` `bg-ok-bg` `border-ok-line` · `…warn…` · `…danger…` | `--status-*` |
| `font-ui` · `font-num` | Geist / Geist Mono |
| `rounded-seg` `-control` `-card` `-cta` `-sheet` | raios do sistema |
| `shadow-float` | `--elevation-float` |

## Layout por superfície (telas em transição)

Quando a **estrutura** muda (não só a cor), a tela renderiza o layout novo só na superfície Zelo:
`{#if $zeloSurface} …layout novo… {:else} …markup legado intacto… {/if}` (store em `src/lib/theme/surface.js`).
A lógica (estado, funções, validações, offline) é a mesma nos dois ramos — só a marcação muda.
O ramo legado é apagado na Fase 6. Feito assim hoje: `src/routes/app/+page.svelte`,
`VirtualProductGrid` (prop `zelo`), `GestaoSidebar` (aside vira `data-surface="brand"` na superfície app),
`ModalPagamento`, `ModalSucesso`, `PaymentMethodGrid`/`PaymentMethodSelect` (prop `zelo`) e os modais do PDV
sobre o `Sheet` (`ModalQuantidade`, `ModalValorAvulso`, `ModalMovCaixa`, `ModalAbrirCaixa`, `ModalProdutoMontavel`, `ModalNovoProduto`).

Quando só o **estilo** muda num componente global (sempre montado, inclusive no SSR), o CSS novo fica
escopado ao ancestral da superfície — `:global(:is([data-surface="app"], [data-surface="brand"])) .x { … }`
(ou só `[data-surface="app"]` quando o componente só existe no sistema interno) — e a marcação legada
não muda. Assim a primeira pintura já sai certa, sem depender do store no cliente.

### Globais do layout (Fase 1, atrás da flag)

| Peça | Superfícies Zelo | Legado |
|---|---|---|
| Toasts (`addToast`) | `zelo/ZeloToaster.svelte`: bloco na cor de ação (navy no app, branco no brand), ícone por tom, título + detalhe (a primeira frase curta vira título), filete de tempo que pausa com hover/foco/aba oculta; até 3, repetidos reiniciam o tempo. Centro-inferior em `--toast-offset`; no `/app` mobile sobe acima da barra "Ver comanda" (`--mobile-bottom-nav-offset + 86px`) e 52px acima da pílula offline quando ela aparece; no mobile com sheet aberto (`[aria-modal]`) vai para o topo | svelte-sonner |
| `ConfirmDialog` (`confirmAction(título, texto, { confirmLabel, cancelLabel, destructive })`) | painel claro (`data-surface="app"` também no brand), raio de sheet, Cancelar `quiet` + Confirmar `primary` (ou perigo com `destructive`); sheet inferior ≤ 640px | igual |
| `OfflineStatus` / `OfflineCenter` / `OfflineAdjustments` / `UpdateAvailable` | pílula de estado (neutra/atenção/erro pelos tokens de status), diálogo e cartão do sistema | igual |
| `SupportChat`, `InAppSupportChat`, `AssistantChat` | painel do sistema, balões por token, lançador circular na cor de ação sem brilho | igual |
| `InlineHelper` | neutro rebaixado; tons `warning`/`success`/`error` pelos tokens de status | igual |
| `MobileBottomNav` (só app) | barra clara com filete, ativo navy com pílula 8% atrás do ícone, rótulo 11px, selo mono; painéis em sheet do sistema | igual |

Atalhos do caixa (só na superfície Zelo, ignorados com modal aberto): **F2** busca, **F4** item avulso, **F9** receber; `/` e Ctrl+T continuam.

## Catálogo de componentes

| Componente | Local | Status |
|---|---|---|
| `Button` (variantes do sistema) | `ui/button` | Fase 0 |
| `Kbd`, `MoneyText`, `StatusPill`, `QtyBadge`, `Segmented`, `UnderlineTabs`, `Stepper`, `ProductTile`, `SearchField`, `ZeloMark` | `zelo/` | Fase 0 (usados no `/app`); com movimento desde a Fase 4 |
| `MorphButton` (botão → carregando → check) | `zelo/` | Fase 4 — "Confirmar" do `ModalPagamento` |
| `Sheet` (contêiner de modal: painel central no desktop, bottom sheet no mobile; classes de campo `.z-input`, `.z-money`, `.z-label`…) | `zelo/Sheet.svelte` | Fase 4 — usado pelos modais do PDV (`ModalQuantidade`, `ModalValorAvulso`, `ModalMovCaixa`, `ModalAbrirCaixa`, `ModalProdutoMontavel`, `ModalNovoProduto`) no ramo `{#if $zeloSurface}` |
| `AppShell`/`Sidebar` navy, `PageHeader`, `MobileHeader`, `BottomNav`, `CartBar`, `SwipeRow` | — | Fase 1/4 |
| `ZeloToaster` (via `addToast`), `ConfirmDialog` (via `confirmAction`) | `zelo/`, `ConfirmDialog.svelte` | Fase 1 (atrás da flag) |
| `Dialog` genérico, `CommandPalette` (⌘K), `Tooltip`, gráficos | — | Fase 1/4 |

## Movimento

Padrão aprovado pelo produto: `docs/design-system/reference/zelopdv-morph.html` (leia o `seek(t)`).
Tudo é **mola**, com no máximo um leve overshoot; a mesma matemática existe em CSS (tokens) e em JS (`src/lib/motion/`).

### Tokens (`src/themes/tokens.css`)

| Token | Valor | Uso |
|---|---|---|
| `--zelo-ease-spring` | `linear()` amostrado da mola ζ 0,84 (overshoot 0,8%) | toda transição de forma: tamanho, posição, raio, sheet |
| `--zelo-ease-out` | `cubic-bezier(.2,.9,.25,1)` | cor/fundo quando mola não faz sentido |
| `--zelo-dur-fast` · `-base` · `-slow` | 150 · 220 · 320 ms | aperto · cor · forma |
| `--zelo-press-scale` | `0.965` | aperto (squash) |

Utilitários Tailwind: `ease-spring`, `duration-(--zelo-dur-slow)`, `active:scale-(--zelo-press-scale)`.

### Primitivos (`src/lib/motion/`, testados em `tests/motionSpring.test.js`)

| Primitivo | Arquivo | Quando usar |
|---|---|---|
| `springStep(t, ω, ζ)`, `springState(d0, v0, t, ω, ζ)`, `springValue`, `springSettleTime`, `springEasing`, `springLinear`, `springSamples` | `spring.js` (puro) | Resposta ao degrau em forma fechada, igual ao vídeo. `springEasing` vira `easing` de transição Svelte; `springLinear` gera um `linear()` CSS; `springSettleTime` dá a duração |
| Presets `SPRING_SHAPE` (ω 18 ζ .84), `SPRING_LEAD` (ω 34), `SPRING_TRAIL` (ω 15), `SPRING_ENTER` (ω 34 ζ 1), `SPRING_EXIT` (ω 55 ζ 1), `SPRING_COUNT` (ω 16 ζ 1), `SPRING_POP` (ω 30 ζ .78) | `spring.js` | Não invente ω/ζ: escolha um preset |
| `blurSwap` | `transitions.js` | Conteúdo que troca ou entra/sai: saída ~90% em ~70 ms (blur → 8 px, opacidade → 0), entrada 70 ms depois (blur 8 → 0, escala .96 → 1). Nunca se sobrepõem. `{ collapse: true }` anima também a altura (linhas de lista) |
| `rise` | `transitions.js` | Barra/cartão que surge de baixo (barra "Ver comanda") |
| `drawStroke` | `transitions.js` | Traço que se desenha (check) |
| `animateSpring(el, frame, spring)`, `pop(el)` | `transitions.js` | Animação única via Web Animations (badge que aparece ou muda de número) |
| `SpringValue` | `liquid.svelte.js` | Número reativo com mola; redirecionar no meio preserva posição e velocidade |
| `LiquidIndicator` | `liquid.svelte.js` | Indicador de aba/segmento com bordas em molas diferentes: a borda na direção do movimento é rígida (ω 34), a outra macia (ω 15) — estica e alcança. Usado por `Segmented` e `UnderlineTabs`; o knob do futuro `Toggle` usa o mesmo helper |

Nos componentes:

- **Aperto (squash):** `:active { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast) }` sobre uma transição base de `transform var(--zelo-dur-slow) var(--zelo-ease-spring)` — entra rápido, volta com mola. Já em `ProductTile`, `Segmented`, `UnderlineTabs`, `Stepper` (0,9 em alvo pequeno), `MorphButton` e nas variantes **do sistema** do `Button` (`primary|outlined|quiet|danger`; as variantes antigas continuam com o `translate-y-px`).
- **`MoneyText animate`:** conta até o novo valor (mola crítica, nunca passa do valor); leitor de tela recebe só o valor final.
- **`QtyBadge`:** pop com mola ao aparecer e ao mudar o número (não no primeiro render).
- **`MorphButton`** (`state: 'idle' | 'loading' | 'success' | 'error'`, o pai controla): a forma encolhe até um círculo (`left/right` + raio com `--zelo-ease-spring`), o arco gira, o check se desenha; `error` volta à largura cheia em `--destructive`. Mantém nome acessível (`aria-label` com o texto do estado), `aria-busy`, `aria-disabled` + clique ignorado em loading/success, e região `role="status"`. Tamanhos `md|touch|cta`; `align="start"` para CTA com total à direita. Em tamanhos inline, mantenha `errorLabel` curto (a largura acompanha o texto).

### Onde está aplicado (`/app`, superfície Zelo)

Indicador líquido nas categorias, na tabela de preço e em Retirada/Delivery; squash nos tiles, "Valor avulso", botões e subcategorias; `QtyBadge` com pop; linhas da comanda entram/saem com `blurSwap` + colapso de altura (o vazio também troca com blur); total, CTA "Receber" e barra "Ver comanda" contam; sheet da comanda e barra "Ver comanda" com `--zelo-ease-spring` (`rise`).

**Pagamento → sucesso.** O "Confirmar" do `ModalPagamento` é um `MorphButton` em `loading` enquanto `salvandoVenda`
(o mesmo `setSalvando`/`setErro`/`resetState` de sempre; erro volta a `idle` e aparece no alerta do rodapé). Quando a
venda salva, o `/app` fecha o pagamento e abre o `ModalSucesso` no mesmo tick — o **check** vive ali: o círculo de 64 px
com o traço se desenhando (`drawStroke`) cresce até a pílula "Venda aprovada · R$ X" (conteúdo com `blurSwap`, 460 ms
depois). O fluxo da venda não ganhou espera: botões e Enter do sucesso respondem desde o primeiro quadro.

### Movimento reduzido

- CSS: `prefers-reduced-motion: reduce` zera `--zelo-dur-*` e leva `--zelo-press-scale` a 1 (sem transição e sem squash).
- JS: todo primitivo consulta `reducedMotion()` (`prefersReducedMotion` do `svelte/motion`) e devolve duração 0 / pula a animação; `SpringValue` salta direto ao alvo; `MoneyText` mostra o valor final.
- Exceção: o spinner do `MorphButton` continua girando (mais devagar, sem o arco "respirando") porque comunica progresso.
- Harness de screenshots (`scripts/app-mock-screens.mjs`) roda com movimento reduzido para imagens estáveis.

## Páginas públicas (Fase 2)

- **Fonte:** `--marketing-font` (landing) e `--font-sans` (Tailwind `font-sans`, blog/segmentos) viram Geist no Brand. `--font-sans` é declarado **fora de camada** em `src/app.css`: `src/themes/` entra em `layer(base)` antes de o Tailwind declarar as camadas, então `base` fica antes de `theme` e não sobrescreveria o `:root` do tema.
- **Voz da marca:** `[data-surface="brand"] :where(h1, h2)` em Geist Mono (especificidade zero; cartões aninhados `data-surface="app"` ficam em Geist). Geist Mono 700/900 adicionadas para títulos pesados.
- **Tokens `mk-*`** (`--color-mk-*` no `@theme inline`): substituem a paleta Tailwind nas páginas públicas (`mk-accent`, `mk-accent-strong`, `mk-highlight`, `mk-muted`, `mk-ink`, `mk-on-accent`, `mk-ok|warn|danger`…). No legado cada um **é** a cor Tailwind que substituiu (`var(--color-sky-500)`…), então o legado fica idêntico; no Brand apontam para tokens da marca. `text-white` sobre fundo de ação vira `text-mk-on-accent` (navy no Brand, branco no legado). Literais `rgba()` que existiam viram tokens com o literal no legado (`--mk-accent-wash`…): `color-mix()` arredonda diferente em gradiente e quebraria o pixel.
- Arquivos: `vs-planilha`, `extensoes`, `zelo-impressao`, `comparativos`, `precificacao`, `SegmentLandingPage`, `CompetitorComparison`, `MarketingPriceSection`. Landing, blog, sobre, contato e jurídicos já usavam tokens.
- Verificação: `visual:diff` só compara a primeira dobra; a Fase 2 foi conferida também com captura de **página inteira** contra `main` (ruído medido rodando `main` duas vezes).
- **Ligar:** `LIVE_SURFACES.brand = true` em `src/lib/theme/surface.js` + `tests/themeSurface.test.js`. Isso muda produção para todo visitante — fica para o dono decidir depois de ver com `?tema=novo`.

## Fase 4 — camada de compatibilidade do `app`

`src/themes/compat-app.css` (importado **fora de camada** em `app.css`) remapeia, só em `[data-surface="app"]`, as variáveis da paleta Tailwind que as telas ainda não reescritas usam: escala `slate/gray/zinc/neutral` invertida (texto claro → tinta, preenchimento escuro → painel/fundo, 600–700 → linhas), `sky/blue/cyan` → ação, `emerald/green` · `red/rose` · `amber/yellow/orange` → status. Ilhas `data-surface="brand"` dentro do app (sidebar) redeclaram o mesmo mapa com seus tokens.

- É **transitória**: dá a todas as telas internas uma leitura coerente atrás da flag sem tocar em markup. Cada tela reescrita na Fase 4 deixa de depender dela; a Fase 6 apaga o arquivo.
- `white`/`black` não são remapeados (texto branco sobre ação precisa continuar branco). Tela que ainda pinta texto corrido com `text-white` precisa de ajuste próprio.
- O legado nunca tem `data-surface="app"`: conferido com o harness em mesas, pedidos, cozinha, gestão (dashboard, produtos, caixa, estoque, pessoas, despesas, fichário), relatórios, perfil, assinatura e ferramentas.

## Autenticação (Fase 3)

- `AuthLayout` tem ramo `{#if $zeloSurface}`: página navy (superfície brand), sino + "Zelo" em Mono acima, cartão claro `data-surface="app"` (raio de sheet, sombra flutuante), título em `title` (Mono), subtítulo `body`. No celular o cartão vira folha que ocupa a tela abaixo da marca.
- `.auth-input`, `.auth-btn`, `.auth-label`, `.auth-link`, `.auth-divider`… (globais em `app.css`) ganham regras só sob `.auth-card[data-surface="app"]`: campo 48 px, botão de ação navy com squash, foco com `--focus`. O legado não tem esse atributo e fica como está.
- `GoogleAuthButton` e `EmailSentHelper` já usavam tokens e seguem o cartão sem mudança. `/indica/[codigo]` não usa `AuthLayout`; ficou no visual Brand da Fase 2 (fundo navy, título Mono).



Decisão do produto: **Geist Mono é a voz da marca**; Geist carrega o texto denso. Papéis, usos e medidas: `DESIGN.md` → Tipografia (e `PLAN.md` §7). A escala viva está em `/dev/design-system`.

| Onde | O quê |
|---|---|
| `src/themes/tokens.css` | Por papel: `--type-<papel>-{font,size,weight,leading,tracking}` e o atalho `--type-<papel>` (valor pronto para `font:`) |
| `src/app.css` | `@utility type-<papel>`: `font` + `letter-spacing` (+ `tabular-nums` nos `num-*`, maiúsculas no `eyebrow`) |
| `static/fonts/` | Geist 400/500/600 e Geist Mono 400/500/600 (a 600 do Mono veio do pacote `geist` 1.7.2, mesma versão das demais) |

Uso:

- **Markup:** `class="type-title"`, `class="type-num-md"`… Um papel = uma classe; não combine com `text-*`/`font-*` de tamanho, peso ou família.
- **CSS de componente:** `font: var(--type-label); letter-spacing: var(--type-label-tracking);`. O atalho `font` zera `font-variant-numeric`: nos papéis `num-*` escreva `font-variant-numeric: tabular-nums` **depois**.
- **Classe dinâmica não funciona:** o Tailwind só gera utilitários que aparecem literais no código. `class="type-{papel}"` não gera nada; guarde o nome inteiro (`'type-heading'`) no dado.
- Ajuste pontual derivado do papel é aceito quando o papel não cobre o caso (ex.: o `R$` do `MoneyText` é `0.55em` do número, em Geist; o "Confirmar" usa `label` com peso 600).

Aplicado hoje: componentes `zelo/` (inclui `Sheet`, `ZeloToaster`, `MoneyText` → `num-md|lg|xl`), `PaymentMethodGrid`, sidebar (rótulos de seção em `eyebrow`), bottom nav, `ModalPagamento` (título `heading`, rótulos `eyebrow`) e o `/app` (`h1` em `title`, breadcrumb em `eyebrow`, números em `num-*`).

## Regras do dono para a Fase 4 em diante

  - Todo mockup (`docs/design-system/mockups/`) e toda tela implementada **já nascem com o movimento** de `docs/design-system/reference/zelopdv-morph.html` (molas, troca com blur curto, squash no clique, indicador líquido, botão → loader → check, números que contam; `src/lib/motion/` no app, `_mk.py` → `MOTION_CSS`/`MOTION_JS`/`morph_cta` nos mockups). Não é preciso o dono pedir.
  - Mockup por tela, aprovação do dono uma a uma antes de implementar.
  - Bottom nav original do celular (`MobileBottomNav`: PDV, Gestão, Financeiro, Outros, Perfil) — nunca trocar.
  - Pedidos do iFood com a logo na moldura redonda (`OrderSourceBadge`, `static/ifood-logo.png`).
  - Só apresentação; sem leituras/escritas novas sem o dono aprovar. Legado pixel-idêntico a `main` sem `?tema=novo`.

## Regras de código

1. **Cor só por token.** Arquivos em `scripts/ui-migrated.json` não podem ter classe de paleta Tailwind, `text-white`/`bg-black`, hex nem `rgb()/rgba()/hsl()`. `npm run check:ui` (no CI) barra. Exceção pontual: comentário `ui-allow: <motivo>` na linha.
2. **Translúcidos moram em `src/themes/`.** Se precisa de um branco a 12%, é um token (ou `color-mix` com um token).
3. **Componentes não conhecem a superfície.** Nada de `if brand`: o mesmo componente funciona nas três.
4. **Contraste é teste.** Mudou um valor em `surface-*.css`? `tests/themeContrast.test.js` recalcula a partir do CSS real (resolve `var()` e compõe alfa sobre o fundo).
5. **Ícones:** `lucide-svelte`, `strokeWidth={1.75}`, 18–20 px.
6. **Números:** `MoneyText` ou um papel `num-*` (tabular).
7. **Movimento:** só pelos tokens e por `src/lib/motion/` (seção Movimento). Nada de `ease-in-out`/durações soltas em código novo.
8. **Tipografia só por papel** (seção Tipografia). `check:ui` barra, nos arquivos migrados, `font-family` literal (só `var(--…)`/`inherit`), `font:` com tamanho literal, `text-[Npx]` e `font-mono`.

## Migração — padrão por arquivo

Somente apresentação; zero mudança de lógica no mesmo PR.

| Antes | Depois |
|---|---|
| `bg-slate-800/40`, `bg-slate-900` | `bg-surface-card` / `bg-surface-panel` |
| `text-slate-100`, `text-white` (texto principal) | `text-ink` |
| `text-slate-400` | `text-ink-muted` |
| `border-slate-700/50` | `border-line` / `border-line-card` |
| `text-sky-400`, `bg-sky-500` | `text-ink` / `bg-action` + `text-action-fg` |
| `text-green-400`, `bg-red-500/10`… | `StatusPill` ou `text-ok` / `bg-danger-bg`… |
| `style="background: var(--accent); color: white"` | `Button variant="primary"` |
| hex/rgba solto | token |
| `uppercase` em nome de produto | caixa normal |

Ao terminar um arquivo: adicionar em `scripts/ui-migrated.json`.

### Verificação por fase

- `npm test`, `npm run check`, `npm run check:ui`, `npm run build`.
- **Diff visual entre deploys** (produção × preview, ou dois servidores locais):
  ```bash
  BASE_URL=https://zelopdv.com.br HEAD_URL=https://<preview>.vercel.app npm run visual:diff            # fases "sem mudança": EXPECT=same (padrão)
  BASE_URL=… HEAD_URL=… HEAD_QUERY=tema=novo EXPECT=change npm run visual:diff                          # ver o antes/depois de uma superfície
  ```
  Mede o ruído carregando a base duas vezes; imagens de diff em `.visual-diff/`. `CHROMIUM_PATH` opcional.
- Manual: `/dev/design-system`; percorrer `?tema=novo` (venda em dinheiro, Pix e fiado; offline); mobile real; impressão.

### Ordem e riscos (resumo do plano aprovado)

- Fase 4 segue a ordem de uso diário: estrutura → `/app` → modais do PDV (`ModalPagamento` é hotspot) → mesas/pedidos/cozinha → gestão → relatórios → perfil/assinatura (ler `[[BILLING]]`)/ferramentas.
- Hotspots vão em PRs próprios com diff visual e e2e (`pdv.spec.js`, `operational.spec.js`).
- Fora do escopo: `admin-dashboard/` (depois, reaproveitando `tokens.css`), impressão térmica, identidades ZeloMenu/ZeloChat.
- Dependência externa: mascote/logo em vetor (favicon, PWA, OG). Até lá, PNG atual.

## Correção registrada

O plano original afirmava que todo `.btn-primary` reprovava em contraste. Medido no código: `.btn-primary` usa `--primary-text: #0F172A` sobre sky (6,44:1, **passa**). Reprovam apenas o shadcn `Button` padrão (`--primary-foreground: #FFF` sobre sky, **2,77:1**) e os botões com `background: var(--accent); color: white` inline (3 ocorrências, ex.: "Novo Item Avulso"). A Fase 4 resolve os dois.
