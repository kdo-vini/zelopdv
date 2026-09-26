# Handoff — Design System Zelo (continuação)

> Prompt pronto para outro agente. Branch: `claude/admiring-thompson-1jk0tr` (repo `kdo-vini/zelopdv`).
> Plano aprovado completo: `docs/design-system/PLAN.md`. Implementação e regras: `docs/DESIGN_SYSTEM.md`. Linguagem visual: `DESIGN.md`.

---

## Prompt

Você vai continuar a migração do ZeloPDV para o **Design System Zelo** na branch `claude/admiring-thompson-1jk0tr`. Trabalhe **uma tarefa por vez, em sequência** (a máquina tem 4 CPUs: nunca rode mais de um dev server/build/navegador headless ao mesmo tempo, e encerre o que abriu ao terminar cada etapa). Antes de começar, leia `CLAUDE.md`, `DESIGN.md`, `docs/DESIGN_SYSTEM.md` e `docs/design-system/PLAN.md`.

### O que já está pronto (não refazer)
- **Fase 0** completa:
  - superfícies `legacy` / `app` / `brand` em `<html data-surface>`, definidas no servidor (`src/lib/theme/surface.js` + `src/hooks.server.js`);
  - flag de prévia `?tema=novo` (cookie `zelo_ui=v2`) / `?tema=atual`;
  - tokens em `src/themes/` (`tokens.css`, `surface-legacy|app|brand.css`, `derived.css`), utilitários semânticos no `@theme` de `src/app.css`;
  - primitivos em `src/lib/components/zelo/`, variantes do sistema no `Button`;
  - `npm run check:ui` (no CI), `npm run visual:diff`, testes de contraste e superfície;
  - `/dev/design-system` (404 em produção).
- **`/app` (Frente de Caixa)** refeito no layout do mockup aprovado, desktop e mobile, atrás da flag. Branch `{#if $zeloSurface}` em `src/routes/app/+page.svelte`; `VirtualProductGrid` com prop `zelo`; `GestaoSidebar` navy (o aside vira `data-surface="brand"` na superfície app). Aprovado pelo dono do produto.
- `origin/main` foi mergeada na branch em 2026-09-25 (landing nova com Ink/Paper, precificação, R$ pt-BR). **Sem a flag, a branch é pixel-idêntica a `main`** — isso é invariante: toda etapa precisa manter.
- Harness para ver telas logadas sem Supabase real: `scripts/app-mock-screens.mjs` (leia o cabeçalho).

### Regras que valem para tudo
- **Regras permanentes do dono (2026-09-26):**
  - Todo mockup (`docs/design-system/mockups/`) e toda tela implementada **já nascem com o movimento** de `docs/design-system/reference/zelopdv-morph.html` (molas, troca com blur curto, squash no clique, indicador líquido, botão → loader → check, números que contam; `src/lib/motion/` no app, `_mk.py` → `MOTION_CSS`/`MOTION_JS`/`morph_cta` nos mockups). Não é preciso o dono pedir.
  - Mockup por tela, aprovação do dono uma a uma antes de implementar.
  - Bottom nav original do celular (`MobileBottomNav`: PDV, Gestão, Financeiro, Outros, Perfil) — nunca trocar.
  - Pedidos do iFood com a logo na moldura redonda (`OrderSourceBadge`, `static/ifood-logo.png`).
  - Só apresentação; sem leituras/escritas novas sem o dono aprovar. Legado pixel-idêntico a `main` sem `?tema=novo`.

- **Legado intacto.** Mudança de estrutura só dentro de `{#if $zeloSurface}` (ou `$currentSurface`); o markup antigo fica no `{:else}` até a Fase 6. Mudança só de cor é via token.
- **Cor só por token** (utilitários `bg-surface-*`, `text-ink*`, `border-line*`, `bg-action`, `text-action-fg`, `ring-focus`, `text-ok|warn|danger` e `-bg`/`-line`, ou `var(--…)`). Nada de hex, `rgb()`, classes de paleta Tailwind, `text-white` em código novo. Sombras e overlays usam `--shadow-color`/`--elevation-float`, **nunca** `--text-inverse` (fica branco na superfície clara).
- Só apresentação nos PRs de migração: **zero mudança de lógica** (venda, offline, estoque, pagamento, permissões).
- **Armadilhas já encontradas:**
  - O `Button` shadcn é runes: use `onclick`, não `on:click`.
  - Em componentes runes, `$bindable()` **sem fallback** se o pai pode passar `undefined` (senão `props_invalid_value` derruba a tela).
  - Não reutilize nomes de chave que já existem no `Button` (o `lg` do shadcn já existe).
  - Custom property que referencia outra precisa ser declarada em `[data-surface]` (veja o `derived.css`).
  - `text-muted` do shadcn é uma cor de **fundo**: use `text-ink-muted`.
  - Não mate processos por padrão (`pkill -f` mata o próprio shell); só por PID.
  - O Vite só expõe `VITE_*` do ambiente (o mock usa `VITE_PUBLIC_SUPABASE_URL`).

### Verificação obrigatória em cada etapa
1. `npm run check` (0 erros; 1 warning conhecido em `relatorios`), `npm run check:ui`, `npx vitest run` (base: 2278 passaram / 3 pulados), `npm run build`.
2. **Legado pixel-idêntico:**
   - Rotas públicas: `npm run build`, sirva com `npx vite preview --port 4311`, e compare com um build de `origin/main` (worktree separada) via `BASE_URL=… HEAD_URL=… CHROMIUM_PATH=/opt/pw-browsers/chromium npm run visual:diff` → precisa dar "0 changed".
   - Telas logadas: compare screenshots do harness com `QS=""` entre a sua branch e `origin/main` (dois dev servers com `VITE_PUBLIC_SUPABASE_URL=https://mockproj.supabase.co VITE_PUBLIC_SUPABASE_ANON_KEY=anon`, um de cada vez se a máquina estiver lenta).
3. **Tela nova conferida por você:** screenshots do harness com `?tema=novo` em 1440×900 e 390×844, olhando cada estado.
4. Commit claro por etapa e `git push -u origin claude/admiring-thompson-1jk0tr`. Atualize a tabela "Estado" em `docs/DESIGN_SYSTEM.md` e o `docs/CURRENT.md`.

### Tarefas, nesta ordem

**1. Terminar os 4 pacotes de trabalho parcial** (`docs/design-system/wip/*.patch`). São WIP **não verificado**, feito por agentes interrompidos no meio. Aplique um por vez (`git apply docs/design-system/wip/<x>.patch`), revise o diff inteiro, termine o que faltar, verifique e commite. Depois apague o `.patch`. Arquivos tocados por mais de um patch: `docs/DESIGN_SYSTEM.md`, `scripts/ui-migrated.json`, `src/lib/components/zelo/index.js` (resolva ao aplicar o segundo).
   - **A — `A-motion-app-sidebar.patch`: sistema de movimento + `/app` + sidebar.**
     - A referência de movimento é `docs/design-system/reference/zelopdv-morph.html`, que é **o novo padrão do produto**:
       - molas com no máximo um leve overshoot;
       - forma única que muda de tamanho e raio;
       - troca de conteúdo com blur curto (saída ~70ms, entrada depois, sem sobrepor);
       - squash no clique (~0,965);
       - indicador "líquido" com as duas bordas em molas diferentes (a da frente rígida, a de trás macia);
       - botão → loader → check;
       - números que contam.
     - O patch traz `src/lib/motion/`, `MorphButton`, testes da mola, e aplicações em `Segmented`, `UnderlineTabs`, `QtyBadge`, `MoneyText`, `ProductTile`, `Stepper`, `/app` e `/dev/design-system`.
     - Tipografia da sidebar **como no mockup** (`docs/design-system/reference/zelopdv-app-light.html`, `.sb a`/`.sb h6`: itens 13,5px/500, altura 38px, ícone 18px, gap 11px; rótulos 10,5px/600, tracking 0,12em; largura 244px). Só com `$currentSurface === 'app'` (classe `zelo-sidebar`). Feedback do dono: hoje está maior que o mockup.
     - Respeitar `prefers-reduced-motion`.
   - **B — `B-pagamento-sucesso.patch`: `ModalPagamento` (hotspot) e `ModalSucesso` no Design System.**
     - Resumo com total grande em mono; formas de pagamento como tiles com a letra do atalho em `Kbd`; recebido/troco; pagamento dividido; fiado; imprimir recibo; bottom sheet no mobile.
     - `ModalSucesso` vira o momento "Venda aprovada · R$ X" da peça de marca.
     - Todos os atalhos, a divisão, o desconto, as taxas de plataforma e o fluxo de confirmação/retry (`setSalvando`/`setErro`/`resetState`) **idênticos**.
     - **Depois do A**, troque o "Confirmar" pelo `MorphButton` (estado loading enquanto salva, success antes de abrir o sucesso).
   - **C — `C-modais-pdv.patch`: `ModalQuantidade`, `ModalValorAvulso`, `ModalMovCaixa`, `ModalAbrirCaixa`, `ModalProdutoMontavel`, `ModalNovoProduto`** com um shell comum (`src/lib/components/zelo/Sheet.svelte`, no patch); bottom sheet no mobile. Para abrir cada um no harness: F4; "Movimentar caixa"; caixa fechado (`caixas: []`); produto `por_unidade`; pizza/modificadores; catálogo vazio → "Cadastrar primeiro produto".
   - **D — `D-globais-bottomnav.patch`: componentes globais.**
     - Toasts no estilo do toast "Caixa fechado" da peça: `ZeloToaster` + testes no patch; navy no app e branco no brand, com a linha de progresso.
     - Também: `ConfirmDialog`, `OfflineStatus`/`OfflineCenter`/`OfflineAdjustments`/`UpdateAvailable`, `SupportChat`/`InAppSupportChat`/`AssistantChat`, `InlineHelper`.
     - `MobileBottomNav` claro com o ativo navy (mockup `zelopdv-app-mobile.html`).
     - Toasts não podem cobrir a barra "Ver comanda" no mobile.

**2. Hierarquia tipográfica** (plano, seção 7; decisão do dono: **Geist Mono é a voz da marca**; o PDF de marca usa só Geist Mono).
   - **Geist Mono:** números (dinheiro, quantidades, códigos, horas), título de página, rótulo de seção/breadcrumb e, no site, títulos/CTAs.
   - **Geist:** texto denso (nomes de produto, listas, formulários, botões). Mono em tudo foi medido: +17% de largura em média, até 29%.
   - **Papéis:**

     | Papel | Fonte | Tamanho / peso / entrelinha / tracking |
     |---|---|---|
     | `display` | Mono | 40–56 / 500 / 1.05 / −0.03em |
     | `title` | Mono | 22 / 600 / 1.1 / −0.02em |
     | `heading` | Geist | 17–18 / 600 / 1.2 |
     | `eyebrow` | Mono | 10.5 / 500 / 0.12em, maiúsculas |
     | `body` | Geist | 14.5 / 400 / 1.4 |
     | `body-strong` | Geist | 14.5 / 500 |
     | `label` | Geist | 13.5 / 500 |
     | `caption` | Geist | 12 / 400 |
     | `num-sm` · `num-md` · `num-lg` · `num-xl` | Mono, `tabular-nums` | 13 · 14.5 · 20 · 32 / 500 |
     | `kbd` | Mono | 11 / 500 |

   - **Implementação:** tokens `--type-*` em `tokens.css`; `@utility type-<papel>` em `app.css`; componentes zelo e `/app` usando os papéis (o `h1` e o breadcrumb do `/app` passam a ser Mono); `check:ui` passando a barrar `font-family` literal, `font:` com tamanho literal, `text-[Npx]` e `font-mono` nos arquivos migrados; documentar em `DESIGN.md`/`DESIGN_SYSTEM.md` e mostrar a escala em `/dev/design-system`.
   - **Inventário atual:** 18 arquivos com `font-family` à mão (`'Inter'` ×3, `monospace` ×5), 92 `font-size` distintos, 49 `text-[…]` arbitrários.

**3. Fase 2 — superfície Brand no ar** (sem flag).
   - Migrar o shell público (`SiteHeader`, `MarketingFooter`, `src/lib/components/marketing/*`) e as rotas públicas para os tokens brand. A landing nova de `main` usa `--marketing-*`, que já têm aliases na superfície brand.
   - Conferir com `?tema=novo` e, quando tudo estiver bom, ligar `LIVE_SURFACES.brand = true` em `src/lib/theme/surface.js` (atualizar `tests/themeSurface.test.js`).
   - `/pascoa` agora redireciona para `/`: não migrar.

**4. Fase 3 — autenticação:** `AuthLayout`, `GoogleAuthButton`, `EmailSentHelper` e as rotas `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`, `/indica/[codigo]`. Fundo navy, formulário num cartão `data-surface="app"`.

**5. Fase 4 — resto do sistema** (atrás da flag, na ordem):
   - `/app/mesas` e `/app/mesas/[id]` (hotspot), `/app/pedidos`, `/app/pedidos/cozinha` (clara, tipografia maior para leitura à distância);
   - `/gestao/*` (começando por `produtos`, hotspot);
   - `/relatorios` (hotspot) + `components/charts/*` + `src/lib/theme/chartColors.js`;
   - `/perfil`, `/assinatura/**` (ler `docs/BILLING.md`), `/ferramentas/**`.

**6. Fase 5 — o que não é DOM:**
   - `src/lib/server/emailTemplates.js`/`adminCommunications.js` em navy/branco;
   - `theme_color` do PWA (`vite.config.*`) e `<meta name="theme-color">` para `#011F4A`;
   - favicon, ícones do PWA, OG e logos quando os vetores do mascote chegarem;
   - recibos/impressão térmica ficam como estão.

**7. Fase 6 — virada:** `LIVE_SURFACES.app = true`, remover `legacy`, a flag, os ramos `{:else}`, `class="dark"` e os tokens mortos; `check:ui` no repo todo; atualizar `CLAUDE.md`, `DESIGN_PATTERNS.md`, `CURRENT.md`, `ZeloPDV.memory.md`, `TRADEOFFS.md`.

### Pendências de produto (não implementar sem o dono pedir)
- "Consumidor final · adicionar cliente" na comanda (hoje o cliente só é escolhido no pagamento, para fiado).
- Imprimir a comanda antes do pagamento.
