# Handoff — Perfil, Assinatura, Ferramentas e o caminho até o fim da migração

> Branch `claude/admiring-thompson-1jk0tr` (kdo-vini/zelopdv). Escrito em 2026-09-26.
> Um segundo agente trabalha **em paralelo** nesta branch no onboarding
> (`docs/HANDOFF-onboarding-design-system.md`). Ver "Convivência".

## Prompt

Continue a migração do Design System Zelo na branch `claude/admiring-thompson-1jk0tr`
de kdo-vini/zelopdv. O mockup 05 (Perfil, Assinatura, Pix e Ferramentas, desktop e
celular) foi **aprovado pelo dono**. Implemente-o e depois siga a lista "Próximos
passos até o fim" deste arquivo, em ordem, até onde for possível sem decisão do dono.

Leia antes: `CLAUDE.md`, `DESIGN.md`, `docs/DESIGN_SYSTEM.md` (Movimento, Tipografia,
Regras do dono para a Fase 4, tabela Estado), `docs/HANDOFF-design-system.md`,
`docs/DESIGN_PATTERNS.md`, `docs/BILLING.md` (obrigatório: Assinatura é cobrança),
este arquivo inteiro e o mockup `docs/design-system/mockups/05-conta.html`
(builder `_build-05-conta.py`). Veja como as telas já migradas foram feitas:
`src/routes/gestao/+page.svelte` (ramo `$zeloSurface`), `src/routes/gestao/produtos/+page.svelte`
e `src/routes/relatorios/+page.svelte` (CSS escopado no fim do `<style>`).

## Estado em 2026-09-26

Pronto atrás da flag (`?tema=novo`), legado idêntico a `main`:
- Fases 0–3 (base, globais, brand, auth). Fase 4: estrutura/sidebar, `/app` e modais do
  PDV, Mesas (01), Pedidos e Cozinha (02), Gestão inteira (03: dashboard, produtos,
  pessoas, estoque, despesas, fichário, cadastro de mesas), Relatórios (04, com a
  paleta de gráficos e `chartColors.js` por superfície).
- `app.css` já tem: cabeçalho interno (eyebrow `p.uppercase.tracking-[0.2em]` + título
  `h1.text-xl.tracking-tight` em Mono) para todas as telas internas, e
  `--sidebar-item-*` em tons de papel dentro de `main` e diálogos.
- Mockup 05 aprovado (desktop e celular), **não implementado** — é o seu trabalho.
- Pendente de decisão do dono: `LIVE_SURFACES.brand = true` (Fase 2 no ar) e a
  virada da Fase 6. Não faça nenhum dos dois sem ele pedir.

## Parte 1 — implementar o mockup 05

Ordem: **Ferramentas** (hub, pequeno) → **Perfil** (hotspot, 1.6 mil linhas) →
**Assinatura** (hotspot, 2.9 mil linhas, cobrança) → Pix → `/assinatura/sucesso`.

- `src/routes/ferramentas/+page.svelte`: cartões com aperto no toque, selo
  Grátis/Incluso/Em breve. Depois `ferramentas/precificacao` e `ferramentas/cardapio`
  nos padrões já aprovados (tabela em cartão, busca, valores em Mono, interruptores
  com mola) — sem mockup próprio, o dono aceitou seguir os padrões.
- `src/routes/perfil/+page.svelte`: as 5 abas (Perfil, Empresa, Assinatura,
  Preferências, Integrações) como `UnderlineTabs` (indicador líquido) + troca com
  `blurSwap`; cartões por assunto; "Salvar alterações" como `MorphButton`
  (`state={saving ? 'loading' : 'idle'}`; o check vem do estado de sucesso se já
  existir um sinal — não invente um); interruptores com mola; zona de perigo
  recolhida; versão do subusuário ("Seus dados" + "Operação offline"); Zelo
  Impressão nos três estados atuais. **Não edite o bloco que monta o
  `OnboardingWizard`** (é do outro agente).
- `src/routes/assinatura/+page.svelte`: avisos de origem (Mesas, Acessos, upgrade),
  status ativo/teste, 3 etapas como abas (o wizard já tem `checkoutStep`,
  `goToCheckoutStep`), cartões de pacote com seleção navy, extensões com "Já incluso"
  e `EntitlementLossWarning`, revisão com vencimento, CPF/CNPJ só quando
  `needsDocumento`, Pix/Cartão, resumo com total contando (`MoneyText animate`),
  barra fixa no celular (`mobile-sticky-summary`), cancelar. Pix: sheet de baixo no
  celular, QR, contagem em Mono, copiar com check, "Já paguei".
  **Nenhuma regra de cobrança muda**: mesmos handlers (`handlePlanSelection`,
  `toggleAddonSelection`, `gerarPix`, `assinar`, `cancelarAssinatura`,
  `atualizarPixStatus`), mesmos textos de preço vindos de `pricing.js`, mesmos
  endpoints. Na dúvida sobre qualquer comportamento de billing, pergunte ao dono.

Técnica (a mesma que funcionou nas telas anteriores):
- Layout que muda → `{#if $zeloSurface} … {:else} legado {/if}` com os mesmos
  handlers. Só visual → CSS no fim do `<style>` com `:global([data-surface="app"]) .classe`.
- Estilo inline `style="color: var(--x)"` se corrige redefinindo `--x` num ancestral
  dentro do escopo App (ex.: o cartão navy de Relatórios), sem `!important`.
- Cuidado com transições em Svelte 5: são locais; use `|global` quando o bloco que
  muda não é o pai direto, e desligue fora do tema novo (`get(zeloSurface) ? blurSwap(node) : { duration: 0 }`).
- Componentes: `src/lib/components/zelo/` (`MorphButton`, `MoneyText`, `Segmented`
  com `onselect`, `UnderlineTabs`, `Sheet`, `StatusPill`…), `Button` de
  `$lib/components/ui/button` (variants `primary|outlined|quiet|danger`, sizes
  `md|touch|cta`), movimento em `src/lib/motion/`.

## Parte 2 — próximos passos até o fim (em ordem)

1. **Sobras da Fase 4** (sem mockup; padrões aprovados):
   - Telas internas ainda só com a camada de compatibilidade: `/gestao/caixa`
     (Fechar Caixa), `/gestao/acessos`, `/gestao/empresas`, `/gestao/extensoes`,
     `/gestao/indicacoes`, `/gestao/gerente/**` (Zelinho), `/assinatura/sucesso`.
     Liste com `grep -L zeloSurface` + capturas `?tema=novo` e aplique os padrões.
     Se alguma pedir layout novo (não só restilo), gere mockup e peça aprovação.
   - Relatórios no celular: a tabela "Vendas do caixa" ainda rola para o lado.
2. **Revisão de celular** de tudo que foi migrado (o dono prioriza celular):
   capturas 390×844 de cada rota com `?tema=novo`, corrigir sobreposição com a
   bottom nav, campos < 16px (zoom do iOS) e alvos < 44px.
3. **Fase 5 — restante**: favicon, ícones do PWA, OG e logos quando o dono entregar
   os vetores do mascote. Sem os vetores, não faça; registre como bloqueado.
4. **Capturas da landing com a UI nova** (decisão do dono: por último). Refazer as
   imagens de produto da landing (hero, "Vendeu bem…", cards, `PhoneShot`) a partir
   das telas novas, com os dados do harness.
5. **Decisões do dono** (pergunte, não execute sozinho): ligar
   `LIVE_SURFACES.brand`; virada da **Fase 6** (App padrão para todos, remover
   legado, flag e `class="dark"`, `check:ui` no repo todo). O plano da Fase 6 está
   em `docs/DESIGN_SYSTEM.md` e `docs/design-system/PLAN.md`; prepare a lista do que
   será removido e peça o ok.

A cada item: atualize a tabela Estado em `docs/DESIGN_SYSTEM.md` e a seção da
sessão em `docs/CURRENT.md`.

## Regras permanentes do dono

- Todo mockup e toda tela **já nascem com o movimento** de
  `docs/design-system/reference/zelopdv-morph.html` (molas, blur curto, squash,
  indicador líquido, botão → loader → check, números que contam).
- Mockup por tela, aprovação do dono antes de implementar (telas sem layout novo
  seguem os padrões aprovados).
- Bottom nav original do celular (`MobileBottomNav`) — nunca trocar.
- Pedidos do iFood com a logo na moldura redonda (`OrderSourceBadge`).
- **Só apresentação**: nenhuma leitura/escrita nova sem o dono aprovar.
- **Legado pixel-idêntico a `main` sem `?tema=novo`.**
- Cores só por token; nada de hex em componente.

## Verificação (em cada passo)

```
npm run check        # 0 erros; 1 aviso antigo em relatorios (.card-panel)
npm run check:ui
npx vitest run       # baseline 2313 passed / 3 skipped
npm run build
```

Paridade do legado com o harness (`scripts/app-mock-screens.mjs`):
- Worktree da main: `git worktree add ../main-wt origin/main` e `npm ci` nela.
- Suba **um** servidor por vez (porta 5181) com
  `VITE_PUBLIC_SUPABASE_URL=https://mockproj.supabase.co VITE_PUBLIC_SUPABASE_ANON_KEY=anon node_modules/.bin/vite dev --port 5181`,
  rode o harness com `BASE=http://localhost:5181 QS="" CHROMIUM_PATH=/opt/pw-browsers/chromium ROUTE=/perfil VP=390x844 OUT=<dir>/perfil-390`,
  derrube pelo PID; repita na main; compare com
  `node scripts/compare-screens.mjs <dirMain> <dirBranch>`.
- Flags do harness: `DASH=1` (vendas do caixa), `LISTS=1` (pessoas, despesas,
  fiado), `MESAS=1`, `ORDERS=1`, `EMPTY=1`, `NO_CAIXA=1`, `STEPS=click:…,key:…,wait:…`
  (clica tab/radio/button/menuitem pelo nome), `MOTION=1`, `EVAL=<js>` (imprime o
  resultado; útil para medir larguras). Para Perfil/Assinatura talvez precise
  acrescentar dados (`subscriptions`, `billing_payments`) ao harness — faça como
  `DASH`/`LISTS`, atrás de uma flag nova.
- Ruído conhecido: botão de recolher da sidebar (até ~24 px), animações em curso
  (FAB), bordas arredondadas em execuções diferentes e textos com hora ("Xh ativo").
  Confirme ruído comparando a main com ela mesma antes de concluir que é regressão.

## Máquina e convivência

- 4 CPUs: **um** dev server/build/navegador headless por vez; desligue o que iniciar;
  mate só por PID (nunca `pkill -f`).
- O agente do onboarding edita: `src/routes/cadastro/**`, `src/routes/auth/**`,
  `OnboardingWizard.svelte`, `OnboardingChecklist.svelte`, `ModalNovoProduto.svelte`,
  estados de primeiro uso em `/app`, `VirtualProductGrid.svelte`, `ModalAbrirCaixa`.
  **Não edite esses arquivos.** Ele não edita perfil, assinatura nem ferramentas.
- `git pull --rebase origin claude/admiring-thompson-1jk0tr` antes de cada commit;
  commits pequenos, um por tela; em conflito em `docs/CURRENT.md` ou
  `docs/DESIGN_SYSTEM.md`, mantenha as duas entradas.
- Commit + push a cada passo. Não abra PR sem o dono pedir.

## Pronto quando

Perfil, Assinatura (com Pix) e Ferramentas estão no Design System com `?tema=novo`,
em celular e desktop, com o movimento; o legado segue idêntico a `main`; as sobras
da Fase 4 e a revisão de celular estão feitas; o que depende do dono (vetores,
`LIVE_SURFACES.brand`, Fase 6) está listado para ele com o que falta.
