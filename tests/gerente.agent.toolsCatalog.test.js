// tests/gerente.agent.toolsCatalog.test.js
import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import { alterarPreco, buscarProduto, criarCategoria, criarProduto, estoqueProduto, listarCategorias, normalizeText, ocultarNoPdv, pausarNoCardapio, translateRpcError } from '../src/lib/server/gerente/tools/catalog.js';

const produtos = [
  { id: 1, nome: 'Refrigerante 2L Coca-Cola', preco: 14, id_categoria: 3, ocultar_no_pdv: false, controlar_estoque: true, estoque_atual: 6, categorias: { nome: 'Bebidas', controlar_estoque_compartilhado: false, estoque_compartilhado_atual: 0 } },
  { id: 2, nome: 'Refrigerante 2L Guaraná', preco: 12, id_categoria: 3, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0, categorias: { nome: 'Bebidas', controlar_estoque_compartilhado: false, estoque_compartilhado_atual: 0 } },
  { id: 3, nome: 'Açaí 500ml', preco: 18, id_categoria: 4, ocultar_no_pdv: true, controlar_estoque: false, estoque_atual: 0, categorias: { nome: 'Sobremesas', controlar_estoque_compartilhado: true, estoque_compartilhado_atual: 20 } },
];

describe('normalizeText', () => {
  it('remove acento, caixa e espaços duplicados', () => {
    expect(normalizeText('  Açaí   500ML ')).toBe('acai 500ml');
  });
});

describe('buscarProduto', () => {
  it('encontra por termo sem acento e anexa o estado no cardápio', async () => {
    const db = makeDb({ tables: {
      produtos: [{ data: produtos, error: null }],
      zelomenu_product_publications: [{ data: [{ id_produto: 1, visivel_online: true, pausado_manualmente: false }, { id_produto: 2, visivel_online: true, pausado_manualmente: true }], error: null }],
    } });
    const result = await buscarProduto(db, 'owner-1', { termo: 'refri' });
    expect(result.ok).toBe(true);
    expect(result.data.produtos.map((p) => [p.id, p.no_cardapio])).toEqual([[1, 'publicado'], [2, 'pausado']]);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'id_usuario', value: 'owner-1' }]));
    expect(db.calls[1].filters).toEqual(expect.arrayContaining([{ op: 'eq', field: 'id_usuario', value: 'owner-1' }, { op: 'in', field: 'id_produto', value: [1, 2] }]));
  });

  it('marca fora_do_cardapio quando não há publicação e respeita o limite', async () => {
    const db = makeDb({ tables: { produtos: [{ data: produtos, error: null }], zelomenu_product_publications: [{ data: [], error: null }] } });
    const result = await buscarProduto(db, 'owner-1', { termo: 'acai', limite: 1 });
    expect(result.data.produtos).toEqual([{ id: 3, nome: 'Açaí 500ml', preco: 18, categoria: 'Sobremesas', oculto_no_pdv: true, controla_estoque: false, estoque_atual: 0, no_cardapio: 'fora_do_cardapio' }]);
  });

  it('produto sem venda avulsa vira somente_complemento, e pausa tem precedência', async () => {
    const db = makeDb({ tables: {
      produtos: [{ data: produtos, error: null }],
      zelomenu_product_publications: [{ data: [{ id_produto: 1, visivel_online: false, pausado_manualmente: false }, { id_produto: 2, visivel_online: false, pausado_manualmente: true }], error: null }],
    } });
    const result = await buscarProduto(db, 'owner-1', { termo: 'refri' });
    expect(result.data.produtos.map((p) => [p.id, p.no_cardapio])).toEqual([[1, 'somente_complemento'], [2, 'pausado']]);
  });

  it('devolve lista vazia sem consultar publicações quando nada casa', async () => {
    const db = makeDb({ tables: { produtos: [{ data: produtos, error: null }] } });
    const result = await buscarProduto(db, 'owner-1', { termo: 'pizza' });
    expect(result).toEqual({ ok: true, data: { produtos: [] } });
    expect(db.calls).toHaveLength(1);
  });
});

describe('listarCategorias e estoqueProduto', () => {
  it('lista categorias com flag de estoque compartilhado', async () => {
    const db = makeDb({ tables: { categorias: [{ data: [{ id: 3, nome: 'Bebidas', ordem: 1, controlar_estoque_compartilhado: false }], error: null }] } });
    const result = await listarCategorias(db, 'owner-1');
    expect(result.data.categorias).toEqual([{ id: 3, nome: 'Bebidas', ordem: 1, estoque_compartilhado: false }]);
  });

  it('devolve estoque do produto e da categoria compartilhada', async () => {
    const db = makeDb({ tables: { produtos: [{ data: produtos[2], error: null }] } });
    const result = await estoqueProduto(db, 'owner-1', { produto_id: 3 });
    expect(result.data).toEqual({ id: 3, nome: 'Açaí 500ml', controla_estoque: false, estoque_atual: 0, estoque_da_categoria: 20 });
  });

  it('retorna erro amigável quando o produto não existe', async () => {
    const db = makeDb({ tables: { produtos: [{ data: null, error: null }] } });
    const result = await estoqueProduto(db, 'owner-1', { produto_id: 99 });
    expect(result).toEqual({ ok: false, error: 'Não encontrei esse produto.' });
  });
});

describe('ferramentas de escrita', () => {
  it('pausarNoCardapio chama a RPC com p_owner e devolve before/after', async () => {
    const db = makeDb({
      rpcs: { gerente_set_menu_pause: { data: { produto_id: 1, nome: 'Refri', pausado_anterior: false, pausado_manualmente: true, visivel_online: true }, error: null } },
    });
    const result = await pausarNoCardapio(db, 'owner-1', { produto_id: 1, pausado: true });
    expect(db.calls[0]).toEqual({ rpc: 'gerente_set_menu_pause', params: { p_produto_id: 1, p_pausado: true, p_owner: 'owner-1' } });
    expect(result).toEqual({ ok: true, data: { produto_id: 1, nome: 'Refri', pausado_anterior: false, pausado_manualmente: true, visivel_online: true }, before: { pausado_manualmente: false }, after: { pausado_manualmente: true } });
  });

  it('pausa produto que só serve de complemento, sem consultar a publicação antes', async () => {
    const db = makeDb({
      rpcs: { gerente_set_menu_pause: { data: { produto_id: 4, nome: 'Bacon extra', pausado_anterior: false, pausado_manualmente: true, visivel_online: false }, error: null } },
    });
    const result = await pausarNoCardapio(db, 'owner-1', { produto_id: 4, pausado: true });
    expect(result.ok).toBe(true);
    expect(result.after).toEqual({ pausado_manualmente: true });
    expect(db.calls.every((call) => call.table !== 'zelomenu_product_publications')).toBe(true);
  });

  it('traduz PRODUTO_NAO_PUBLICADO quando o produto nunca foi para o cardápio', async () => {
    const db = makeDb({ rpcs: { gerente_set_menu_pause: { data: null, error: { message: 'PRODUTO_NAO_PUBLICADO' } } } });
    const result = await pausarNoCardapio(db, 'owner-1', { produto_id: 1, pausado: true });
    expect(result).toEqual({ ok: false, error: 'Esse produto ainda não foi levado para o cardápio digital, então não há o que pausar. Isso se faz no ZeloMenu.' });
  });

  it('ocultarNoPdv, criarCategoria, criarProduto e alterarPreco mapeiam parâmetros', async () => {
    const db = makeDb({ rpcs: {
      gerente_set_ocultar_pdv: { data: { produto_id: 1, nome: 'Refri', ocultar_anterior: false, ocultar_no_pdv: true }, error: null },
      gerente_criar_categoria: { data: { id: 9, nome: 'Sobremesas', ordem: 5, created: true }, error: null },
      gerente_criar_produto: { data: { id: 50, nome: 'Pudim', preco: 12, id_categoria: 9, categoria_nome: 'Sobremesas' }, error: null },
      gerente_alterar_preco: { data: { produto_id: 50, nome: 'Pudim', preco_anterior: 12, preco: 14 }, error: null },
    } });
    await ocultarNoPdv(db, 'owner-1', { produto_id: 1, ocultar: true });
    await criarCategoria(db, 'owner-1', { nome: ' Sobremesas ' });
    await criarProduto(db, 'owner-1', { nome: 'Pudim', preco: 12, categoria_id: 9 });
    const preco = await alterarPreco(db, 'owner-1', { produto_id: 50, preco: 14 });
    expect(db.calls.map((c) => c.params)).toEqual([
      { p_produto_id: 1, p_ocultar: true, p_owner: 'owner-1' },
      { p_nome: 'Sobremesas', p_owner: 'owner-1' },
      { p_nome: 'Pudim', p_preco: 12, p_categoria_id: 9, p_owner: 'owner-1', p_controlar_estoque: false, p_estoque_atual: 0 },
      { p_produto_id: 50, p_preco: 14, p_owner: 'owner-1' },
    ]);
    expect(preco.before).toEqual({ preco: 12 });
    expect(preco.after).toEqual({ preco: 14 });
  });

  it('valida argumentos antes de chamar a RPC', async () => {
    const db = makeDb();
    expect(await criarProduto(db, 'owner-1', { nome: 'P', preco: 12, categoria_id: 9 })).toEqual({ ok: false, error: 'O nome do produto precisa ter entre 2 e 80 caracteres.' });
    expect(await alterarPreco(db, 'owner-1', { produto_id: 1, preco: -1 })).toEqual({ ok: false, error: 'O preço precisa ser um número maior ou igual a zero.' });
    expect(db.calls).toHaveLength(0);
  });
});

describe('translateRpcError', () => {
  it('cobre os códigos conhecidos e cai em mensagem genérica', () => {
    expect(translateRpcError('PRODUTO_DUPLICADO')).toBe('Já existe um produto com esse nome.');
    expect(translateRpcError('CATEGORIA_NAO_ENCONTRADA')).toBe('Não encontrei essa categoria.');
    expect(translateRpcError('algo inesperado')).toBe('Não consegui concluir essa ação agora.');
  });
});
