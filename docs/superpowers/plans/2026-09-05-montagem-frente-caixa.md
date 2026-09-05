# Montagem de produtos na frente de caixa — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer os controles do produto montável refletirem exatamente a seleção que será adicionada à comanda.

**Architecture:** Corrigir a dependência reativa no modal Svelte existente, compartilhado por Frente de Caixa e Mesas. Preservar o resolvedor de preço, o snapshot e os contratos de venda. Acrescentar regressão de interação com o componente real em Chromium.

**Tech Stack:** Svelte 5 em sintaxe legacy, SvelteKit 2, Vite 6, Playwright e Vitest já instalados.

**Spec:** A especificação funcional e a evidência estão neste documento, seções 1–4. Pedido do usuário em 2026-09-05: investigar dificuldade de montagem manual e apresentar correções/melhorias antes de implementar, com instruções suficientes para outro agente.

**Status:** correção de UI implementada localmente e verificada no componente real em Chromium. O caso específico do cliente e a versão publicada continuam sem confirmação porque a sessão de teste redirecionou ao login. Nenhuma venda foi criada, nenhum deploy ou alteração de banco foi realizado.

## Restrições globais

- Ler `docs/CURRENT.md`, `docs/ZeloPDV.memory.md`, `CLAUDE.md`, `docs/CODE_REVIEW.md`, `docs/DESIGN_PATTERNS.md` e `docs/operations/OFFLINE.md` antes de executar.
- Usar variáveis de tema; não adicionar cores hex em componentes.
- Produto simples continua no fluxo de um toque.
- `maxSelections` conta opções distintas; `maxPerOption` limita unidades da mesma opção.
- Não reescrever regras de preço, idempotência, estoque, owner ou replay para corrigir reatividade visual.
- Não transformar grupo obrigatório indisponível em produto simples vendável.
- Não colocar harness de teste em `src/routes`, nem criar endpoint público de diagnóstico.
- Testes de componente não precisam de Supabase. Para investigação adicional de banco, primeiro ler a skill Supabase e conferir a CLI vinculada; não usar service role para simular permissões de operador.

## 1. Evidência e limites da investigação

Base inspecionada: `59de603`, working tree inicialmente limpo.

Fluxo existente:

1. `src/lib/stores/pdvCache.js`, `attachModifierGroups`: carrega grupos/opções/vínculos e resolve produtos vinculados ocultos.
2. `src/routes/app/+page.svelte`, `adicionarProduto` (aprox. linha 622): exige caixa aberto; produto com grupo ativo abre `ModalProdutoMontavel`.
3. `src/lib/components/modals/ModalProdutoMontavel.svelte`: seleciona opções e dispara `confirm` com `{ produto, preco, selectedOptions, modifiers }`.
4. `src/routes/app/+page.svelte`, handler de `confirm` (aprox. linha 1685): inclui montagem na comanda; `adicionarItemNaComanda` usa combinação e preço como identidade.
5. `src/lib/finance/saleOps.js` preserva snapshot e expande requisitos de estoque; offline preserva o payload.
6. `src/routes/app/mesas/[id]/+page.svelte` usa o mesmo modal; precisa de regressão após a correção.

Reprodução realizada em Chromium, por Playwright, com o componente original importado em um harness Vite local na porta 5187. Fixture em memória: Penne R$20 ou Fusilli R$25 (substituição); Bacon R$3, Queijo R$2 e Ovo R$1 (adicionais); no máximo duas opções distintas e três unidades por opção.

Resultados observados:

| Ação | Resultado observado | Resultado exigido |
| --- | --- | --- |
| Escolher Penne e Bacon | Rodapé R$23, mas zero `.option-row.selected` e zero botões Aumentar | Duas linhas destacadas; Bacon com quantidade 1 e controles |
| Escolher também Queijo | Ovo continua habilitado; nenhum aviso de máximo | Ovo desabilitado; selecionados continuam removíveis |
| Clicar Ovo em seguida | Três checkboxes marcados, resumo e confirmação só com Bacon e Queijo, R$25 | Interface e payload devem conter exatamente a mesma seleção |
| Confirmar Penne + um Bacon | Evento correto com preço R$23 e snapshot | Esse caminho deve continuar funcionando |

Conclusão delimitada: montagem com quantidade é bloqueada pela interface; montagem simples pode funcionar. Não há evidência para afirmar que todos os produtos montáveis falham.

Foi iniciado também o app completo em `http://127.0.0.1:5188/app`, reutilizando o storage state de teste existente sem imprimir tokens. A sessão redirecionou para `/login`. Portanto, não houve reprodução autenticada na conta do cliente, nem verificação do código publicado em produção. Nome do cliente/produto e ponto exato da falha foram solicitados ao usuário.

Validação executada:

```powershell
npx vitest run tests/zelomenuModifiers.test.js tests/pdvCache.test.js tests/finance.saleOps.test.js tests/offlineDb.test.js
```

Resultado: **57 testes passam, quatro arquivos**. Isso não valida a interação do modal. Não foram executados check/build/suíte completa nesta investigação, pois não houve alteração de código de aplicação.

## 2. Causa comprovada no componente

`selections` é atualizado por atribuição, e `selectionInput` o referencia diretamente; por isso preço, resumo e payload acompanham as escolhas.

Porém o markup calcula quantidade com `quantityFor(group.id, option.id)`, bloqueio com `isOptionBlocked(group, option)` e limite com `selectedCountFor(group.id)`. Essas funções leem `selections` por fechamento, sem a dependência aparecer nos argumentos do template. A reatividade legacy do Svelte não infere essa leitura indireta. Os valores derivados visuais ficam no estado inicial.

O navegador ainda marca o checkbox nativo, mas isso não garante inclusão no estado. Ao atingir o máximo, `chooseOption` recusa a terceira seleção; o checkbox continua parecendo marcado porque a atualização visual está desconectada.

Não corrigir isso com `setTimeout`, recarregamento da página, mudança de key do modal ou recriação dos fieldsets: essas abordagens podem perder foco/seleção e escondem a dependência incorreta.

## 3. Correção recomendada — prioridade alta

Alterar somente `ModalProdutoMontavel.svelte` e os testes necessários:

- Tornar a dependência de `selections` explícita nos três helpers e em todas as chamadas.
- Exibir destaque, quantidade, bloqueio e aviso de limite imediatamente.
- Validar evento de confirmação junto com estado visual, sem aceitar apenas asserção de texto do código-fonte.
- Preservar reset ao fechar/reabrir e troca de produto/preço.

## 4. Melhorias propostas — revisar separadamente da correção

1. **Remover escolha única opcional:** hoje o controle é rádio. Clicar no rádio já marcado não dispara `change`, apesar de `chooseOption` conter um ramo para desmarcar. Oferecer “Limpar escolha” no grupo opcional selecionado. Não fazer obrigatório virar opcional.
2. **Exibir preço substituto nas opções:** hoje só `pricingMode === 'somar'` mostra preço na linha. Para substituir, exibir `R$ 20,00`/`R$ 25,00`, sem sinal `+`; para somar, manter `+ R$ 3,00`.
3. **Explicar ausência de opções:** grupo obrigatório sem opção disponível deve dizer “Sem opções disponíveis neste grupo. Revise o cadastro ou o estoque.” e manter confirmação bloqueada. Atualmente a lista pode ficar vazia com uma orientação impossível de atender.
4. **Leitura e quantidade:** permitir quebra do nome da opção, manter preço legível e desabilitar Aumentar ao alcançar `maxPerOption`. Verificar rodapé acessível em 390×844 e 1280×800.

Não incluir nesta correção: editor de montagem já adicionada, observações novas no contrato, mudanças de cadastro, wizard de múltiplas etapas ou alterações de schema. São demandas independentes.

## 5. Tarefa 1 — reproduzir e corrigir a reatividade

**Modificar:** `src/lib/components/modals/ModalProdutoMontavel.svelte`.
**Criar:** `tests/browser/montavel/Harness.svelte`, `tests/browser/montavel/index.html`, `tests/browser/montavel/run.mjs`.
**Interface preservada:** props `open`, `produto`, `precoBase`; eventos `close`, `confirm` e campos descritos na seção 1.

- [x] Criar fixture do componente (sem login, sem API, sem seed):

```svelte
<script>
  import Modal from '../../../src/lib/components/modals/ModalProdutoMontavel.svelte';
  let output = '';
  let open = true;
  const produto = { id: 1, nome: 'Montagem teste', modifierGroups: [
    { id: 'massa', name: 'Massa', order: 0, minSelections: 1,
      maxSelections: 1, pricingMode: 'substituir', options: [
        { id: 'penne', name: 'Penne', priceDelta: 20 },
        { id: 'fusilli', name: 'Fusilli', priceDelta: 25 }
      ] },
    { id: 'extras', name: 'Extras', order: 1, minSelections: 0,
      maxSelections: 2, allowsQuantity: true, maxPerOption: 3,
      pricingMode: 'somar', options: [
        { id: 'bacon', name: 'Bacon', priceDelta: 3 },
        { id: 'queijo', name: 'Queijo', priceDelta: 2 },
        { id: 'ovo', name: 'Ovo', priceDelta: 1 }
      ] }
  ] };
</script>
<button on:click={() => open = true}>Abrir montagem</button>
<Modal {open} {produto} precoBase={20}
  on:close={() => open = false}
  on:confirm={e => output = JSON.stringify(e.detail)} />
<output>{output}</output>
```

- [x] Criar entrada `index.html`:

```html
<div id="app"></div>
<script type="module">
  import { mount } from 'svelte';
  import Harness from './Harness.svelte';
  mount(Harness, { target: document.getElementById('app') });
</script>
```

- [x] Criar runner `run.mjs`. Executar da raiz do repo. Ele usa as dependências existentes e encerra servidor/browser mesmo se a asserção falhar:

```js
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';

const server = await createServer({
  configFile: false,
  root: path.resolve('tests/browser/montavel'),
  resolve: { alias: { $lib: path.resolve('src/lib') } },
  plugins: [svelte({ configFile: false })],
  server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } }
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await expect(page.getByRole('button', { name: 'Revise as opções acima' })).toBeDisabled();
  await page.getByRole('radio', { name: /Penne/ }).click();
  await page.getByRole('checkbox', { name: /Bacon/ }).click();
  await expect(page.locator('.option-row.selected')).toHaveCount(2);
  const plus = page.getByRole('button', { name: 'Aumentar', exact: true });
  await expect(plus).toBeVisible();
  await plus.click();
  await expect(page.locator('.stepper span')).toHaveText('2');
  await page.getByRole('checkbox', { name: /Queijo/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ovo/ })).toBeDisabled();
  await expect(page.getByText(/Você já escolheu o máximo/)).toBeVisible();
  await page.getByRole('button', { name: /Adicionar à comanda/ }).click();
  const payload = JSON.parse(await page.locator('output').innerText());
  expect(payload.preco).toBe(28);
  expect(payload.modifiers.find(g => g.groupId === 'extras').selectedOptions)
    .toEqual([
      { optionId: 'bacon', optionName: 'Bacon', priceDelta: 3, quantity: 2 },
      { optionId: 'queijo', optionName: 'Queijo', priceDelta: 2, quantity: 1 }
    ]);
  await page.getByRole('checkbox', { name: /Queijo/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ovo/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir montagem' }).click();
  await expect(page.locator('.option-row.selected')).toHaveCount(0);
  await expect(page.locator('.stepper')).toHaveCount(0);
  console.log('Montagem: interação e snapshot conferidos');
} finally {
  await browser?.close();
  await server.close();
}
```

- [x] Rodar `node tests/browser/montavel/run.mjs` **antes** da correção. Esperado: falha na contagem de linhas selecionadas (recebe 0, espera 2), reproduzindo a evidência desta investigação.
- [x] Corrigir helpers e chamadas. Usar estas assinaturas e implementações:

```js
function quantityFor(currentSelections, groupId, optionId) {
  return Number(currentSelections[groupId]?.[optionId] || 0);
}

function selectedCountFor(currentSelections, groupId) {
  return Object.values(currentSelections[groupId] || {})
    .filter(quantity => Number(quantity) > 0).length;
}

function isOptionBlocked(currentSelections, group, option) {
  if (!group.allowsQuantity && group.maxSelections === 1) return false;
  if (group.maxSelections == null) return false;
  return !quantityFor(currentSelections, group.id, option.id)
    && selectedCountFor(currentSelections, group.id) >= group.maxSelections;
}
```

No template e em `chooseOption`, passar `selections` explicitamente:

```svelte
{@const quantity = quantityFor(selections, group.id, option.id)}
{@const blocked = isOptionBlocked(selections, group, option)}
```

```js
const current = quantityFor(selections, group.id, option.id);
// Na condição de máximo de chooseOption e na condição de InlineHelper:
selectedCountFor(selections, group.id)
```

- [x] Buscar `quantityFor(`, `selectedCountFor(` e `isOptionBlocked(` no arquivo e conferir **todas** as chamadas; não deixar assinatura antiga.
- [x] Reexecutar runner. Exigido: passar, incluindo snapshot de duas unidades e desbloqueio ao remover.
- [x] Executar os testes focados e `npm run check`. Não alterar expectativa financeira para fazer teste passar.
- [x] Registrar resultado e diff; commit apenas dos arquivos desta tarefa se houver autorização para commit no fluxo de execução.

## 6. Tarefa 2 — melhorias aprovadas de interação

Executar somente os itens da seção 4 que o usuário aprovar. Mesmo arquivo de modal e harness; não criar um segundo resolvedor de preços.

- [x] Para escolha opcional única, adicionar botão próximo ao título do grupo, somente quando há seleção. A ação deve limpar só aquele grupo:

```svelte
{#if group.minSelections === 0 && group.maxSelections === 1
  && !group.allowsQuantity && selectedCountFor(selections, group.id) > 0}
  <button type="button"
    on:click={() => selections = { ...selections, [group.id]: {} }}>
    Limpar escolha
  </button>
{/if}
```

- [x] Renderizar preço de substituição no ramo complementar do preço atual:

```svelte
{:else if group.pricingMode === 'substituir'}
  <span class="option-price">
    R$ {Number(option.linkedProduct?.price ?? option.priceDelta ?? 0)
      .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
  </span>
```

- [x] Acrescentar estado vazio no `each` das opções com `{:else}` e a mensagem da seção 4. Manter o resolvedor responsável por recusar grupo obrigatório incompleto.
- [x] Em Aumentar, adicionar `disabled={group.maxPerOption != null && quantity >= group.maxPerOption}`. Manter o limite defensivo em `setQuantity`.
- [x] Em `.option-name`, remover ellipsis/nowrap e usar `white-space: normal; overflow-wrap: anywhere;`. Preservar `min-width: 0`. Para preço e stepper, usar `flex-shrink: 0`. Conferir layout de opções com nomes longos no celular.
- [x] No harness, acrescentar um grupo opcional único e um cenário obrigatório sem opções. Conferir: limpar remove a seleção do snapshot, grupo vazio impede confirmação, preço substituto aparece, Aumentar para em 3, Diminuir funciona e reduz a zero, nenhum overflow horizontal em 390×844 e 1280×800.

## 7. Tarefa 3 — verificação integrada e documentação

- [ ] Obter sessão válida de conta de teste por login seguro. Não imprimir/commitar senha ou storage state. Não reutilizar scripts `auth.setup.js` indiscriminadamente: eles também podem semear/resetar usuários/tenant. **Pendente:** a sessão disponível redirecionou ao login.
- [ ] Confirmar o relato específico do cliente: produto, tela usada, abertura do modal, etapa que não responde e versão publicada. Se o modal sequer abre, rastrear grupos ativos, cache, permissão e caixa aberto; o defeito comprovado aqui não explica sozinho ausência do modal. **Pendente de dados do cliente/sessão.**
- [ ] No `/app`, usar caixa de teste e montar Penne + Bacon 2x + Queijo; esperar R$28 e resumo correspondente na comanda. **Pendente de sessão autenticada.**
- [ ] Repetir combinação: deve incrementar linha. Trocar Penne por Fusilli: deve criar outra linha com R$33. Remover a nova linha e conferir a anterior intacta. **Pendente de sessão autenticada.**
- [x] Produto simples deve entrar sem abrir montagem. Produto obrigatório incompleto deve impedir inclusão. Coberto pelo caminho existente e pelo resolvedor; o harness verifica o segundo caso.
- [x] Verificar fechamento e reabertura do modal, troca de produto, toque, teclado, nomes longos e acesso ao rodapé. O harness verifica fechamento por evento, troca de fixture e layouts 390×844/1280×800; toque físico e Mesas autenticados permanecem pendentes.
- [x] Validar payload online/offline com os testes existentes; nenhuma venda persistida para smoke. A suíte completa cobre o contrato e o runner cobre o snapshot no modal.
- [x] Executar `npm test` e `npm run check`. Resultado fresco no worktree limpo do PR: 1.056 testes passam, três skips opcionais; check Svelte 0/0. `npm run build` compilou client/SSR/PWA e terminou no EPERM conhecido de symlink do adapter Vercel no Windows; a limitação permanece documentada e exige CI/Linux para o build final.
- [x] Atualizar `docs/CURRENT.md`, `docs/FIXES_PROGRESS.md` e `docs/INCIDENTS.md` com evidência, status e limites. Só marcar publicado após deploy verificado.
- [x] Preservar o caráter histórico de `docs/projects/produtos-montaveis-pdv.md`; não usar o status antigo de julho como evidência de publicação atual.

## Critério final de aceite

Cada opção marcada visualmente corresponde ao snapshot confirmado, e cada quantidade é editável até o limite configurado. O harness confirma duas porções de um adicional, remoção de uma escolha, limites, grupo vazio, preço substituto e responsividade. A correção não altera preço, agrupamento, estoque ou comportamento offline fora das escolhas explicitamente feitas. A confirmação no `/app` de produção aguarda sessão de teste válida.
