# ZeloMenu Bulk Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir publicar em lote no ZeloMenu os produtos selecionados em Gestão → Produtos, somente quando a empresa possui o entitlement de ZeloMenu.

**Architecture:** Encapsular a escrita canônica em `zelomenu_product_publications` em um helper pequeno e testável, mantendo `produtos` como catálogo base. A tela reutiliza `hasZeloMenuAccess` para renderizar a ação e revalidar o entitlement no clique; lotes independentes permitem comunicar sucesso parcial sem apagar da seleção os itens que falharam.

**Tech Stack:** SvelteKit 2, Svelte 5, Supabase JS, Vitest.

---

### Task 1: Helper canônico de publicação

**Files:**
- Create: `src/lib/zelomenuPublications.js`
- Create: `tests/zelomenuPublications.test.js`

- [x] **Step 1: Escrever testes que cubram payload, deduplicação e falha parcial**

Testar que o helper:

- grava `id_usuario`, `id_produto`, `visivel_online: true` e `pausado_manualmente: false`;
- usa conflito em `id_usuario,id_produto`;
- deduplica ids;
- retorna ids publicados e ids com falha por lote.

- [x] **Step 2: Executar o teste e confirmar falha pela ausência do módulo**

Run: `npm test -- tests/zelomenuPublications.test.js`

Expected: FAIL porque `src/lib/zelomenuPublications.js` ainda não existe.

- [x] **Step 3: Implementar o helper mínimo**

Criar `publishProductsToZeloMenu(client, { ownerUserId, productIds, batchSize })`, com validação de entrada e `upsert` em lotes na tabela `zelomenu_product_publications`.

- [x] **Step 4: Executar o teste e confirmar sucesso**

Run: `npm test -- tests/zelomenuPublications.test.js`

Expected: PASS.

### Task 2: Ação em lote na tela de Produtos

**Files:**
- Modify: `src/routes/gestao/produtos/+page.svelte`

- [x] **Step 1: Carregar o entitlement canônico**

Importar `hasZeloMenuAccess`, resolver o usuário autenticado e guardar o resultado em estado local após o carregamento da página.

- [x] **Step 2: Implementar o handler**

Revalidar `hasZeloMenuAccess` no clique, chamar `publishProductsToZeloMenu` com o `ownerUserId`, comunicar sucesso total/parcial/falha e manter selecionados somente os ids que falharam.

- [x] **Step 3: Adicionar a ação à toolbar existente**

Mostrar `Publicar no menu (N)` somente quando `selectedItems.size > 0 && hasMenuAccess`; preservar a exclusão em lote e desabilitar ações durante a publicação.

### Task 3: Documentação e validação

**Files:**
- Modify: `docs/CURRENT.md`
- Modify: `docs/FIXES_PROGRESS.md`

- [x] **Step 1: Registrar a mudança operacional**

Documentar o gate por `hasZeloMenuAccess`, o write path em `zelomenu_product_publications` e o comportamento de falha parcial.

- [x] **Step 2: Executar validações proporcionais**

Run:

```bash
npm test -- tests/zelomenuPublications.test.js tests/zelomenuPublicationSchema.test.js
npm run check
npm test
npm run build
```

Expected: testes passam, `svelte-check` sem erros e build concluído; warnings pré-existentes devem ser reportados.
