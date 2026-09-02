# Reimpressão de Recibos no Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir reimprimir qualquer venda exibida na atividade recente do dashboard pelo menu de três pontos, mantendo a exclusão de venda no mesmo menu.

**Architecture:** Reutilizar `printVenda` como única engine de impressão. O dashboard carregará os snapshots já persistidos da venda, dos itens e dos pagamentos; um helper puro transformará esse formato de banco no contrato `VendaCupom`. O menu de ações será local à linha, com fechamento por clique fora/Escape e confirmação de exclusão preservada.

**Tech Stack:** SvelteKit 2, Svelte 5, JavaScript, Supabase client, `lucide-svelte`, Vitest.

**Spec:** Requisito do usuário nesta conversa: trocar o botão de excluir da atividade recente por três pontos, oferecendo “Reimprimir venda” e “Excluir venda”; a reimpressão deve usar a infraestrutura já existente e ocorrer imediatamente ao selecionar a opção.

## Global Constraints

- `src/routes/gestao/+page.svelte` é uma superfície operacional; preservar o escopo do caixa atual e o estorno de fiado antes da exclusão.
- `src/lib/printService.js` é a engine única de impressão; não criar uma segunda engine nem chamar builders ESC/POS/HTML diretamente na tela.
- Não hardcode hex em componentes; usar tokens de tema e ícones de `lucide-svelte`.
- Manter a reimpressão compatível com venda simples, múltiplos pagamentos, desconto, delivery e itens com modificadores.
- Toda mudança de comportamento deve atualizar `docs/CURRENT.md` e `docs/ZeloPDV.memory.md` somente com fatos estáveis e relevantes.

---

### Task 1: Definir e testar o contrato de payload de reimpressão

**Files:**
- Create: `src/lib/finance/saleReceipt.js`
- Test: `tests/finance.saleReceipt.test.js`

**Interfaces:**
- Consumes: uma linha persistida de `vendas`, seus itens de `vendas_itens` e suas linhas de `vendas_pagamentos`.
- Produces: `buildSaleReceiptPayload({ venda, itens, pagamentos })`, retornando o objeto `venda` aceito por `printVenda`.

- [ ] **Step 1: Write the failing test**

Criar um teste que passe uma venda delivery com desconto, item com preço persistido e pagamentos múltiplos, e verifique que o helper produz `idVenda`, `numeroVenda`, `subtotal` derivado de `valor_total - taxa_entrega + valor_desconto`, encargos, itens e pagamentos no formato do recibo.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/finance.saleReceipt.test.js`

Expected: FAIL porque `src/lib/finance/saleReceipt.js` ainda não existe.

- [ ] **Step 3: Write minimal implementation**

Implementar `buildSaleReceiptPayload` sem acesso a Supabase. Converter números com `Number`, usar arrays vazios como fallback, mapear `vendas_itens` para `nome`, `quantidade`, `preco_unitario` e `modifiers`, mapear `vendas_pagamentos` para `forma` e `valor`, e calcular o subtotal persistido derivado.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/finance.saleReceipt.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/finance.saleReceipt.test.js src/lib/finance/saleReceipt.js
git commit -m "test: define sale receipt reprint payload"
```

### Task 2: Integrar reimpressão no dashboard

**Files:**
- Modify: `src/routes/gestao/+page.svelte`

**Interfaces:**
- Consumes: `buildSaleReceiptPayload`, `printVenda`, dados carregados de `vendas`, `vendas_itens` e `vendas_pagamentos`.
- Produces: menu de ações por venda com `data-testid="sale-actions-menu-{id}"`, ação `Reimprimir venda` e ação `Excluir venda`.

- [ ] **Step 1: Write the failing integration assertions**

Ampliar `tests/finance.saleReceipt.test.js` para cobrir a venda simples sem pagamentos múltiplos e garantir que o payload mantém `formaPagamento`, `valorRecebido`, `troco` e o fallback de tipo `retirada`. Essas são as duas formas usadas pela tela ao chamar `printVenda`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/finance.saleReceipt.test.js`

Expected: FAIL na expectativa do contrato que ainda não estiver implementada.

- [ ] **Step 3: Implement the dashboard integration**

No dashboard: importar `printVenda`, `MoreHorizontal`, `Printer`, `Trash2`, `buildSaleReceiptPayload`; guardar as linhas completas em `vendasPagamentos`; expandir as seleções existentes para incluir campos persistidos necessários ao recibo; carregar o perfil da empresa sob demanda com fallback `Zelo PDV`; implementar `reimprimirVenda(id)` com estado de carregamento, toast de erro e fechamento do menu; substituir o botão destrutivo por um botão de três pontos e menu `role="menu"`; fechar o menu ao clicar fora ou pressionar Escape; ao excluir, fechar o menu antes da confirmação e manter `revertFiadoDebtForVenda` antes do delete.

- [ ] **Step 4: Run targeted verification**

Run: `npm test -- tests/finance.saleReceipt.test.js tests/receipt.test.js`

Expected: PASS, comprovando o contrato novo e a engine existente.

- [ ] **Step 5: Run static checks**

Run: `npm run check`

Expected: `0 errors`; warnings preexistentes devem ser registrados sem mascarar erros novos.

- [ ] **Step 6: Commit**

```bash
git add src/routes/gestao/+page.svelte tests/finance.saleReceipt.test.js src/lib/finance/saleReceipt.js
git commit -m "feat: add sale receipt reprint actions to dashboard"
```

### Task 3: Documentar e validar a entrega completa

**Files:**
- Modify: `docs/CURRENT.md`
- Modify: `docs/ZeloPDV.memory.md`

**Interfaces:**
- Consumes: comportamento implementado e resultados reais dos testes.
- Produces: estado operacional atualizado, incluindo qualquer falha preexistente da suíte.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: todos os testes passam; se houver falha preexistente, registrar arquivo/teste e relação com a alteração em `docs/CURRENT.md`.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: build client/server concluído; qualquer limitação local conhecida do adapter Vercel deve ser reportada com precisão.

- [ ] **Step 3: Update operational documentation**

Adicionar em `docs/CURRENT.md` uma nota datada com a reimpressão no menu de três pontos da atividade recente e registrar em `docs/ZeloPDV.memory.md` somente o fato estável de que essa ação reutiliza `printVenda` com os snapshots persistidos da venda.

- [ ] **Step 4: Review the diff and status**

Run: `git diff --check; git status --short; git diff --stat`

Expected: somente os arquivos da feature e da documentação, sem whitespace errors ou arquivos temporários.

- [ ] **Step 5: Commit**

```bash
git add docs/CURRENT.md docs/ZeloPDV.memory.md
git commit -m "docs: record dashboard sale receipt reprint"
```
