# Design System Zelo — implementação e migração

> Linguagem visual (cores, tipografia, componentes, faça/não faça): [`DESIGN.md`](../DESIGN.md) na raiz.
> Este documento: **como o sistema está implementado, as regras de código e o plano de migração.**
> Referência viva: `/dev/design-system` (local e previews da Vercel; 404 em produção).
> Referências de origem (mockups aprovados): `docs/design-system/reference/`.

## Estado

| Fase | Escopo | Status |
|---|---|---|
| 0 | Base: tokens, superfícies, flag, travas, documentação, componentes primitivos | **Entregue** — sem mudança visual (0 pixels em 16 rotas × 2 larguras) |
| 1 | Componentes do sistema + globais do layout raiz + ícones 1,75 | Pendente |
| 2 | Superfície Brand no ar (site, landing, blog) | Pendente |
| 3 | Autenticação (Brand + cartão App) | Pendente |
| 4 | Superfície App atrás da flag (estrutura → `/app` → modais → operação → gestão → relatórios → conta) | Pendente |
| 5 | E-mails, PWA/`theme-color`, favicon/OG/logos, `chartColors.js` | Pendente |
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

## Catálogo de componentes

| Componente | Local | Status |
|---|---|---|
| `Button` (variantes do sistema) | `ui/button` | Fase 0 |
| `Kbd`, `MoneyText`, `StatusPill`, `QtyBadge`, `Segmented`, `UnderlineTabs`, `Stepper`, `ProductTile`, `SearchField` | `zelo/` | Fase 0 |
| `AppShell`/`Sidebar` navy, `PageHeader`, `MobileHeader`, `BottomNav`, `CartBar`, `Sheet` + `SwipeRow` | — | Fase 1/4 |
| `Toast`, `Dialog`/`ConfirmDialog`, `CommandPalette` (⌘K), `Tooltip`, gráficos | — | Fase 1/4 |

## Regras de código

1. **Cor só por token.** Arquivos em `scripts/ui-migrated.json` não podem ter classe de paleta Tailwind, `text-white`/`bg-black`, hex nem `rgb()/rgba()/hsl()`. `npm run check:ui` (no CI) barra. Exceção pontual: comentário `ui-allow: <motivo>` na linha.
2. **Translúcidos moram em `src/themes/`.** Se precisa de um branco a 12%, é um token (ou `color-mix` com um token).
3. **Componentes não conhecem a superfície.** Nada de `if brand`: o mesmo componente funciona nas três.
4. **Contraste é teste.** Mudou um valor em `surface-*.css`? `tests/themeContrast.test.js` recalcula a partir do CSS real (resolve `var()` e compõe alfa sobre o fundo).
5. **Ícones:** `lucide-svelte`, `strokeWidth={1.75}`, 18–20 px.
6. **Números:** `MoneyText` ou `font-num` + `tabular-nums`.

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
