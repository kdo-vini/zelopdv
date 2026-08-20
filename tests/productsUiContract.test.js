import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const productsPage = readFileSync(resolve(root, 'src/routes/gestao/produtos/+page.svelte'), 'utf8');
const assistantChat = readFileSync(resolve(root, 'src/lib/components/AssistantChat.svelte'), 'utf8');

describe('contratos de UI da gestão de produtos', () => {
  test('não exibe subtítulo redundante no cabeçalho de Produtos', () => {
    expect(productsPage).not.toMatch(/class="page-subtitle"/);
  });

    test('não monta o Zelinho Rail globalmente no assistant compartilhado', () => {
      expect(assistantChat).not.toMatch(/<ZelinhoRail\s*\/>/);
    });

    test('preserva o retorno de foco para o gatilho contextual do assistant', () => {
      expect(assistantChat).toMatch(/returnFocusElement/);
      expect(assistantChat).toMatch(/\.focus\(\)/);
    });

    test('mantém a árvore sem linha pai interativa contendo botões filhos', () => {
    expect(productsPage).not.toMatch(/class="tree-item tree-item-cat group"[\s\S]{0,500}role="button"/);
    expect(productsPage).not.toMatch(/class="tree-item tree-item-sub group"[\s\S]{0,500}role="button"/);
  });
});
