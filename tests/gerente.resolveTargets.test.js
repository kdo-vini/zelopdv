import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { resolveWriteTargets } from '../src/lib/server/gerente/resolveTargets.js';

describe('resolveWriteTargets', () => {
  it('aceita id válido quando o nome sugerido bate com o nome real', async () => {
    const db = makeDb({ tables: { produtos: [{ data: { id: 7, nome: 'Refri 2L' }, error: null }] } });
    const result = await resolveWriteTargets(db, 'owner-1', 'alterar_preco', { produto_id: 7, nome_produto: 'Refri 2L', preco: 10 });
    expect(result).toEqual({ ok: true, args: { produto_id: 7, nome_produto: 'Refri 2L', preco: 10 } });
  });

  it('produto_id 0 cai para busca por nome exato', async () => {
    const db = makeDb({ tables: { produtos: [{ data: [{ id: 850, nome: 'Refri 2L' }], error: null }] } });
    const result = await resolveWriteTargets(db, 'owner-1', 'pausar_no_cardapio', { produto_id: 0, nome_produto: 'Refri 2L', pausado: true });
    expect(result).toEqual({ ok: true, args: { produto_id: 850, nome_produto: 'Refri 2L', pausado: true } });
  });

  it('id existente com nome divergente resolve pelo nome, não pelo id sugerido', async () => {
    const db = makeDb({ tables: { produtos: [
      { data: { id: 99, nome: 'Suco de Laranja' }, error: null },
      { data: [{ id: 7, nome: 'Refri 2L' }], error: null },
    ] } });
    const result = await resolveWriteTargets(db, 'owner-1', 'ocultar_no_pdv', { produto_id: 99, nome_produto: 'Refri 2L', ocultar: true });
    expect(result).toEqual({ ok: true, args: { produto_id: 7, nome_produto: 'Refri 2L', ocultar: true } });
  });

  it('zero resultados devolve motivo pedindo para chamar buscar_produto de novo', async () => {
    const db = makeDb({ tables: { produtos: [{ data: [], error: null }] } });
    const result = await resolveWriteTargets(db, 'owner-1', 'pausar_no_cardapio', { produto_id: 0, nome_produto: 'Produto Fantasma', pausado: true });
    expect(result).toEqual({
      ok: false,
      motivo: 'Não encontrei o produto "Produto Fantasma" no catálogo deste dono. Chame buscar_produto de novo com outro termo ou peça o nome exato antes de preparar a mudança.',
    });
  });

  it('ambíguo lista até três nomes na mensagem', async () => {
    const db = makeDb({ tables: { produtos: [{ data: [
      { id: 1, nome: 'Refrigerante 2L Coca-Cola' },
      { id: 2, nome: 'Refrigerante 2L Guaraná' },
    ], error: null }] } });
    const result = await resolveWriteTargets(db, 'owner-1', 'alterar_preco', { produto_id: 0, nome_produto: 'Refrigerante', preco: 10 });
    expect(result).toEqual({
      ok: false,
      motivo: 'Mais de um produto combina com "Refrigerante": Refrigerante 2L Coca-Cola, Refrigerante 2L Guaraná. Pergunte ao dono qual é antes de preparar a mudança.',
    });
  });

  it('sem nome e sem id válido pede o nome exato antes de chamar buscar_produto', async () => {
    const db = makeDb();
    const result = await resolveWriteTargets(db, 'owner-1', 'pausar_no_cardapio', { produto_id: 0, nome_produto: '', pausado: true });
    expect(result).toEqual({ ok: false, motivo: 'Preciso do nome exato do produto. Chame buscar_produto antes.' });
    expect(db.calls).toHaveLength(0);
  });

  it('criar_produto com categoria_id errado resolve pela categoria do nome informado', async () => {
    const db = makeDb({ tables: { categorias: [
      { data: { id: 1, nome: 'Bebidas' }, error: null },
      { data: [{ id: 225, nome: 'Sobremesas' }], error: null },
    ] } });
    const result = await resolveWriteTargets(db, 'owner-1', 'criar_produto', { nome: 'Pudim', preco: 12, categoria_id: 1, nome_categoria: 'Sobremesas' });
    expect(result).toEqual({ ok: true, args: { nome: 'Pudim', preco: 12, categoria_id: 225, nome_categoria: 'Sobremesas' } });
  });

  it('categoria inexistente devolve motivo específico de categoria', async () => {
    const db = makeDb({ tables: { categorias: [{ data: [], error: null }] } });
    const result = await resolveWriteTargets(db, 'owner-1', 'criar_produto', { nome: 'Pudim', preco: 12, categoria_id: 0, nome_categoria: 'Inexistente' });
    expect(result).toEqual({
      ok: false,
      motivo: 'A categoria "Inexistente" não existe. Crie a categoria antes ou peça ao dono para escolher uma das existentes.',
    });
  });

  it('criar_categoria passa intacto, sem tocar no banco', async () => {
    const db = makeDb();
    const result = await resolveWriteTargets(db, 'owner-1', 'criar_categoria', { nome: 'Sobremesas' });
    expect(result).toEqual({ ok: true, args: { nome: 'Sobremesas' } });
    expect(db.calls).toHaveLength(0);
  });
});
