# Handoff — Onboarding (cadastro → primeira venda) no Design System Zelo

> Para um agente trabalhando **em paralelo** na branch `claude/admiring-thompson-1jk0tr`.
> Outro agente segue migrando Perfil, Assinatura e Ferramentas na mesma branch.

## Prompt

Continue a migração do Design System Zelo na branch `claude/admiring-thompson-1jk0tr`
de kdo-vini/zelopdv. Sua parte: **o onboarding completo, do cadastro até o fim da
primeira venda**, que foi refatorado recentemente e ainda está no visual antigo.

Antes de qualquer código, leia nesta ordem: `CLAUDE.md`, `DESIGN.md`,
`docs/DESIGN_SYSTEM.md` (inclusive "Movimento", "Tipografia", "Regras do dono para a
Fase 4 em diante" e a tabela Estado), `docs/HANDOFF-design-system.md`,
`docs/DESIGN_PATTERNS.md`, `docs/projects/onboarding-dois-passos.md` e, em
`docs/CURRENT.md`, as seções "Chegada no produto: boas-vindas e primeira venda",
"Polish do primeiro uso no PDV (iPhone)" e a da ativação mínima da primeira venda
(eventos `onboarding_wizard_completed` → `first_sale_completed`). Abra
`docs/design-system/reference/zelopdv-morph.html` e os mockups aprovados
`docs/design-system/mockups/01..05-*.html` para o vocabulário visual e de movimento.

### Escopo (o caminho real do usuário)

1. `/cadastro` (`src/routes/cadastro/+page.svelte`, já dentro do `AuthLayout` migrado na
   Fase 3) e as telas de confirmação/retorno de e-mail em `src/routes/auth/`.
2. Wizard de 2 passos + boas-vindas (`src/lib/components/OnboardingWizard.svelte`,
   montado por `src/routes/perfil/+page.svelte`): nome da loja, WhatsApp, card de
   chegada com "Fazer primeira venda" e "Ajuda no WhatsApp".
3. Primeiro uso da Frente de Caixa (`/app`): estado vazio da grade, cadastro rápido
   (`src/lib/components/modals/ModalNovoProduto.svelte` modo `compact`), dica/coachmark
   do primeiro produto (`VirtualProductGrid.svelte`, `helperPrimeiroClickProdutoId`),
   barreira de caixa só no pagamento (`src/lib/pdv/firstUseCaixaGate.js`,
   `ModalAbrirCaixa`), pagamento e sucesso da primeira venda.
4. `OnboardingChecklist.svelte` ("Terminar de configurar", usado no Dashboard).

Verifique o que já tem ramo `$zeloSurface` antes de mexer: `/app`, `ModalPagamento`,
`ModalSucesso`, modais do PDV e `ModalNovoProduto` já foram migrados — confira se os
estados de **primeiro uso** (estado vazio, dica, compact, abrir caixa no pagamento)
estão cobertos neles e só complete o que falta.

### Ordem de trabalho (obrigatória)

1. **Mockup primeiro, aprovação do dono antes de implementar.** Gere
   `docs/design-system/mockups/06-onboarding.html` com o builder
   `docs/design-system/mockups/_build-06-onboarding.py` usando `_mk.py`
   (`fonts`, `i()`, `money()`, `CSS`, `MOTION_CSS`, `MOTION_JS`, `morph_cta`).
   **Celular primeiro** — é o que os clientes mais usam: cada passo do caminho em
   390 px (cadastro, confirmação de e-mail, wizard passo 1, passo 2, boas-vindas,
   PDV vazio, cadastro rápido, grade com a dica, carrinho, pagamento com abrir caixa,
   sucesso da primeira venda) e depois as mesmas telas-chave em desktop 1440.
   Entregue o HTML ao dono e **espere a aprovação**. Cuidado com colisão de classes
   do `_mockup.css` (`.tot`, `.sum`, `.mt`, `.num`, `.acts` já existem).
2. Implementar tela a tela, só apresentação, atrás da flag (`?tema=novo`).
3. A cada passo: `npm run check`, `npm run check:ui`, `npx vitest run`,
   `npm run build`; commit e push; atualize a tabela Estado em
   `docs/DESIGN_SYSTEM.md` e `docs/CURRENT.md`.

### Regras permanentes do dono (não precisa ele repetir)

- Todo mockup e toda tela **já nascem com o movimento** do
  `zelopdv-morph.html`: molas, troca com blur curto, squash no clique, indicador
  líquido, botão → loader → check (`MorphButton`), números que contam
  (`MoneyText animate`). Use `src/lib/motion/`.
- Bottom nav original do celular (`MobileBottomNav`: PDV, Gestão, Financeiro, Outros,
  Perfil) — nunca trocar.
- **Só apresentação.** Nenhuma leitura/escrita nova, nenhuma mudança de regra,
  evento de analytics, ordem de passos, validação ou redirecionamento sem o dono
  aprovar. Os eventos listados em `docs/CURRENT.md` precisam continuar disparando
  na mesma ordem.
- **Legado pixel-idêntico a `main` sem `?tema=novo`.** Prove com o harness
  `scripts/app-mock-screens.mjs` (`QS=""`, rodando `origin/main` e a branch) e
  `npm run visual:diff`. Flags úteis do harness: `EMPTY=1` (conta sem produtos),
  `NO_CAIXA=1`, `STEPS=click:…,key:…,wait:…`, `MOTION=1`, `EVAL=`.
- Cores só por token (`npm run check:ui`); nada de hex em componente. Arquivos novos
  totalmente migrados entram em `scripts/ui-migrated.json`.
- Padrões de implementação que já funcionaram: ramo `{#if $zeloSurface}` com os
  mesmos handlers quando o layout muda; CSS escopado em
  `:global([data-surface="app"]) .classe` quando só o visual muda (não altera o
  legado). Estilo inline que lê `var(--x)` pode ser corrigido redefinindo a variável
  no ancestral dentro do escopo App, sem `!important`.

### Máquina e convivência com o outro agente

- 4 CPUs: **um** dev server/build/navegador headless por vez; desligue o que iniciar;
  mate só por PID (nunca `pkill -f`).
- Outro agente está na mesma branch migrando `src/routes/perfil/+page.svelte`,
  `src/routes/assinatura/+page.svelte` e `src/routes/ferramentas/**`. **Não edite
  esses arquivos**; se precisar mudar algo no ponto onde o `OnboardingWizard` é
  montado em `perfil/+page.svelte`, descreva a mudança para o dono em vez de fazer.
- Antes de cada commit: `git pull --rebase origin claude/admiring-thompson-1jk0tr`;
  commits pequenos, um por tela; em conflito em `docs/CURRENT.md` ou
  `docs/DESIGN_SYSTEM.md`, mantenha as duas entradas.
- Não abra PR sem o dono pedir.

### Pronto quando

O caminho cadastro → primeira venda, com `?tema=novo`, está no Design System em
celular e desktop, com o movimento; o legado segue idêntico a `main`; os eventos de
onboarding disparam na mesma ordem; testes, check, check:ui e build limpos; docs
atualizados.
