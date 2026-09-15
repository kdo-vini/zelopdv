import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const component = readFileSync(resolve('src/lib/components/modals/ModalNovoProduto.svelte'), 'utf8');
const productsPage = readFileSync(resolve('src/routes/gestao/produtos/+page.svelte'), 'utf8');

describe('ModalNovoProduto.svelte — contrato do componente', () => {
  it('expõe as props mínimas documentadas', () => {
    for (const prop of [
      'export let open',
      'export let ownerUserId',
      'export let categorias',
      'export let subcategorias',
      'export let tabelasPreco',
      'export let defaultCategoriaId',
      'export let defaultSubcategoriaId',
      'export let compact'
    ]) {
      expect(component).toContain(prop);
    }
  });

  it('dispara close e created (com o produto criado) em vez de conhecer a página', () => {
    expect(component).toMatch(/dispatch\(\s*'close'\s*\)/);
    expect(component).toMatch(/dispatch\(\s*'created'\s*,\s*createdProduct\s*\)/);
  });

  it('esconde os campos avançados no modo compact e usa os defaults do form completo', () => {
    expect(component).toMatch(/\{#if !compact && tabelasPrecoAtivo\}/);
    expect(component).toMatch(/\{#if !compact\}[\s\S]{0,200}Subcategoria/);
    expect(component).toMatch(/\{#if !compact\}[\s\S]{0,1200}Venda em atacado/);
    // Em modo compact, id_subcategoria não herda defaultSubcategoriaId — fica no default (null) do form.
    expect(component).toMatch(/if \(!compact\) \{\s*form\.id_subcategoria = toSelectId\(defaultSubcategoriaId\);\s*\}/);
    // O pré-preenchimento roda no mount do <dialog> (action manageFocus), não numa
    // reactive statement $: — evita a reordenação topológica de $: blocks do Svelte
    // "comer" a comparação de valor anterior (open vs. valor já sobrescrito).
    expect(component).not.toMatch(/\$:\s*if\s*\(\s*open\s*&&/);
  });

  it('preserva as regras de payload de estoque compartilhado no insert', () => {
    expect(component).toMatch(/controlar_estoque: categoriaCompartilhada \? false : form\.controlar_estoque/);
    expect(component).toMatch(/estoque_atual: !categoriaCompartilhada && form\.controlar_estoque \? form\.estoque_atual : 0/);
    expect(component).toContain(".from('produtos')");
    expect(component).toContain('.insert(payload)');
  });

  it('invalida o cache de produtos do PDV como efeito obrigatório do próprio componente', () => {
    expect(component).toContain('pdvCache.invalidateProdutos()');
  });
});

describe('gestao/produtos usa o ModalNovoProduto em vez do markup inline', () => {
  it('importa e usa o componente com os efeitos colaterais da página no handler de created', () => {
    expect(productsPage).toContain("import ModalNovoProduto from '$lib/components/modals/ModalNovoProduto.svelte'");
    expect(productsPage).toMatch(/<ModalNovoProduto[\s\S]{0,400}on:created={produtoCriado}/);
    expect(productsPage).not.toContain('let newProdForm');
    expect(productsPage).not.toContain('async function criarProduto(');
  });
});
