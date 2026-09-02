import { describe, expect, it, vi } from 'vitest';
import { assistantMessage, makeDb, makeOpenAi, toolCall } from './helpers/gerenteStubs.js';
import { cancelPendingAction, confirmPendingAction, describeExecutedAction, runAgentTurn, undoExecutedAction } from '../src/lib/server/gerente/agent.js';

const now = new Date('2026-09-02T15:00:00Z');

function baseTables(extra = {}) {
  return {
    empresa_perfil: [{ data: { nome_exibicao: 'Lanchonete do Zé' }, error: null }],
    gerente_agent_sessions: [{ data: { id: 'sess-1' }, error: null }, { data: null, error: null }],
    gerente_agent_messages: [{ data: [], error: null }, { data: null, error: null }],
    ai_usage_logs: [{ data: null, error: null }],
    ...extra,
  };
}

describe('runAgentTurn', () => {
  it('responde texto simples sem ferramentas e persiste user/assistant', async () => {
    const db = makeDb({ tables: baseTables() });
    const openai = makeOpenAi([assistantMessage('Olá! Como posso ajudar?')]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'oi', now });
    expect(result.reply).toBe('Olá! Como posso ajudar?');
    expect(result.pendingAction).toBeNull();
    expect(result.toolsUsed).toEqual([]);
    const request = openai.create.mock.calls[0][0];
    expect(request.model).toBe('gpt-4.1-mini');
    expect(request.messages[0].role).toBe('system');
    expect(request.messages[0].content).toContain('Lanchonete do Zé');
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'oi' });
    expect(request.tools.length).toBeGreaterThan(0);
    const inserted = db.calls.find((c) => c.table === 'gerente_agent_messages' && c.op === 'insert');
    expect(inserted.payload.map((m) => m.role)).toEqual(['user', 'assistant']);
    const usage = db.calls.find((c) => c.table === 'ai_usage_logs');
    expect(usage.payload).toMatchObject({ user_id: 'owner-1', chat_type: 'gerente_agent', model: 'gpt-4.1-mini', prompt_tokens: 100, completion_tokens: 20 });
  });

  it('executa ferramenta de leitura, devolve o resultado ao modelo e responde', async () => {
    const db = makeDb({ tables: baseTables({ categorias: [{ data: [{ id: 1, nome: 'Bebidas', ordem: 1, controlar_estoque_compartilhado: false }], error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('call-1', 'listar_categorias', {})]),
      (params) => {
        const toolMsg = params.messages.at(-1);
        expect(toolMsg.role).toBe('tool');
        expect(toolMsg.tool_call_id).toBe('call-1');
        expect(JSON.parse(toolMsg.content).data.categorias[0].nome).toBe('Bebidas');
        return assistantMessage('Você tem 1 categoria: Bebidas.');
      },
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'quais categorias?', now });
    expect(result.reply).toBe('Você tem 1 categoria: Bebidas.');
    expect(result.toolsUsed).toEqual(['listar_categorias']);
    expect(result.usage.prompt_tokens).toBe(200);
  });

  it('ferramenta de escrita vira ação pendente e não chama a RPC', async () => {
    const db = makeDb({ tables: baseTables({ gerente_agent_actions: [
      { data: null, error: null },
      { data: { id: 'act-1', summary: 'Pausar "Refri 2L" no cardápio digital', expires_at: '2026-09-02T15:10:00Z' }, error: null },
    ] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('call-1', 'pausar_no_cardapio', { produto_id: 7, nome_produto: 'Refri 2L', pausado: true })]),
      (params) => {
        const toolMsg = params.messages.at(-1);
        expect(JSON.parse(toolMsg.content)).toEqual({ status: 'aguardando_confirmacao', resumo: 'Pausar "Refri 2L" no cardápio digital', acao_id: 'act-1' });
        return assistantMessage('Posso pausar o Refri 2L no cardápio? Confirma?');
      },
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'whatsapp', channelRef: '5514999990000', message: 'pausa o refri', now });
    expect(result.pendingAction).toEqual({ id: 'act-1', summary: 'Pausar "Refri 2L" no cardápio digital', expires_at: '2026-09-02T15:10:00Z', effect: 'Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.' });
    expect(db.rpc).not.toHaveBeenCalled();
    const created = db.calls.find((c) => c.table === 'gerente_agent_actions' && c.op === 'insert');
    expect(created.payload).toMatchObject({ owner_user_id: 'owner-1', channel: 'whatsapp', tool_name: 'pausar_no_cardapio', arguments: { produto_id: 7, nome_produto: 'Refri 2L', pausado: true } });
  });

  it('para após maxToolRounds com mensagem de fallback', async () => {
    const db = makeDb({ tables: baseTables({ categorias: [{ data: [], error: null }, { data: [], error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'listar_categorias', {})]),
      assistantMessage(null, [toolCall('c2', 'listar_categorias', {})]),
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'x', now, maxToolRounds: 2 });
    expect(result.reply).toBe('Não consegui concluir dessa vez. Pode me pedir de outro jeito?');
    expect(openai.create).toHaveBeenCalledTimes(2);
  });

  it('ferramenta desconhecida devolve erro ao modelo sem quebrar o turno', async () => {
    const db = makeDb({ tables: baseTables() });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'apagar_tudo', {})]),
      (params) => {
        expect(JSON.parse(params.messages.at(-1).content)).toEqual({ ok: false, error: 'Ferramenta desconhecida.' });
        return assistantMessage('Isso eu não faço.');
      },
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'apaga tudo', now });
    expect(result.reply).toBe('Isso eu não faço.');
  });

  it('devolve quickReplies com os produtos quando a busca é ambígua', async () => {
    const produtos = [
      { id: 1, nome: 'Refrigerante 2L Coca-Cola', preco: 14, id_categoria: 3, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0, categorias: { nome: 'Bebidas' } },
      { id: 2, nome: 'Refrigerante 2L Guaraná', preco: 12, id_categoria: 3, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0, categorias: { nome: 'Bebidas' } },
    ];
    const db = makeDb({ tables: baseTables({ produtos: [{ data: produtos, error: null }], zelomenu_product_publications: [{ data: [], error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'buscar_produto', { termo: 'refri' })]),
      assistantMessage('Achei dois. Qual deles?'),
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'pausa o refri', now });
    expect(result.quickReplies).toEqual(['Refrigerante 2L Coca-Cola', 'Refrigerante 2L Guaraná', 'Nenhum desses']);
  });

  it('devolve quickReplies com categorias quando listar_categorias foi usada sem ação pendente', async () => {
    const db = makeDb({ tables: baseTables({ categorias: [{ data: [{ id: 1, nome: 'Lanches', ordem: 1, controlar_estoque_compartilhado: false }, { id: 2, nome: 'Bebidas', ordem: 2, controlar_estoque_compartilhado: false }], error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'listar_categorias', {})]),
      assistantMessage('Em qual categoria?'),
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'cadastra pudim por 12', now });
    expect(result.quickReplies).toEqual(['Lanches', 'Bebidas', 'Criar categoria nova']);
  });

  it('não devolve quickReplies quando criou ação pendente', async () => {
    const db = makeDb({ tables: baseTables({ gerente_agent_actions: [{ data: null, error: null }, { data: { id: 'act-1', summary: 'Pausar "Refri 2L" no cardápio digital', expires_at: '2026-09-02T15:10:00Z' }, error: null }] }) });
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('c1', 'pausar_no_cardapio', { produto_id: 7, nome_produto: 'Refri 2L', pausado: true })]),
      assistantMessage('Confirma?'),
    ]);
    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'pausa', now });
    expect(result.quickReplies).toEqual([]);
    expect(result.pendingAction.effect).toBe('Some do cardápio digital para os clientes. Continua no PDV para venda no balcão.');
  });
});

describe('confirmar, cancelar e desfazer', () => {
  const pending = { id: 'act-1', owner_user_id: 'owner-1', session_id: 'sess-1', channel: 'app', tool_name: 'pausar_no_cardapio', arguments: { produto_id: 7, nome_produto: 'Refri 2L', pausado: true }, summary: 'Pausar "Refri 2L" no cardápio digital', status: 'pending', expires_at: '2026-09-02T15:10:00Z' };

  it('confirma executando a RPC e responde texto determinístico', async () => {
    const db = makeDb({
      tables: { gerente_agent_actions: [{ data: pending, error: null }, { data: null, error: null }] },
      rpcs: { gerente_set_menu_pause: { data: { produto_id: 7, nome: 'Refri 2L', pausado_anterior: false, pausado_manualmente: true, visivel_online: true }, error: null } },
    });
    const result = await confirmPendingAction({ db, ownerUserId: 'owner-1', actorUserId: 'owner-1', actionId: 'act-1', now });
    expect(result).toEqual({ ok: true, reply: 'Feito: pausei "Refri 2L" no cardápio digital. Ele continua no PDV. Para voltar, me peça "despausa Refri 2L".' });
    expect(db.calls[db.calls.length - 2]).toMatchObject({ rpc: 'gerente_set_menu_pause', params: { p_produto_id: 7, p_pausado: true, p_owner: 'owner-1' } });
  });

  it('explica expiração e cancelamento', async () => {
    const expiredDb = makeDb({ tables: { gerente_agent_actions: [{ data: { ...pending, expires_at: '2026-09-02T14:00:00Z' }, error: null }, { data: null, error: null }] } });
    expect(await confirmPendingAction({ db: expiredDb, ownerUserId: 'owner-1', actorUserId: 'owner-1', actionId: 'act-1', now })).toEqual({ ok: false, reply: 'Essa confirmação expirou. Me peça de novo e eu preparo outra vez.' });
    const cancelDb = makeDb({ tables: { gerente_agent_actions: [{ data: pending, error: null }, { data: null, error: null }] } });
    expect(await cancelPendingAction({ db: cancelDb, ownerUserId: 'owner-1', actionId: 'act-1' })).toEqual({ ok: true, reply: 'Cancelado. Nada foi alterado.' });
  });

  it('desfaz pausa e descreve', async () => {
    const executed = { ...pending, status: 'executed', before_state: { pausado_manualmente: false }, after_state: { pausado_manualmente: true } };
    const db = makeDb({
      tables: { gerente_agent_actions: [{ data: executed, error: null }, { data: { id: 'act-9' }, error: null }] },
      rpcs: { gerente_set_menu_pause: { data: { produto_id: 7, nome: 'Refri 2L', pausado_anterior: true, pausado_manualmente: false, visivel_online: true }, error: null } },
    });
    const result = await undoExecutedAction({ db, ownerUserId: 'owner-1', actorUserId: 'owner-1', actionId: 'act-1', channel: 'app', now });
    expect(result).toEqual({ ok: true, reply: 'Desfeito: "Refri 2L" voltou para o cardápio digital.' });
  });

  it('describeExecutedAction cobre cada ferramenta de escrita', () => {
    expect(describeExecutedAction({ tool_name: 'criar_categoria' }, { nome: 'Sobremesas', created: true })).toBe('Feito: criei a categoria "Sobremesas".');
    expect(describeExecutedAction({ tool_name: 'criar_categoria' }, { nome: 'Sobremesas', created: false })).toBe('A categoria "Sobremesas" já existia, então reaproveitei.');
    expect(describeExecutedAction({ tool_name: 'criar_produto' }, { nome: 'Pudim', preco: 12, categoria_nome: 'Sobremesas' })).toBe('Feito: cadastrei "Pudim" por R$ 12,00 em "Sobremesas". Ele já aparece no PDV.');
    expect(describeExecutedAction({ tool_name: 'alterar_preco' }, { nome: 'Pudim', preco_anterior: 12, preco: 14 })).toBe('Feito: "Pudim" passou de R$ 12,00 para R$ 14,00.');
    expect(describeExecutedAction({ tool_name: 'ocultar_no_pdv' }, { nome: 'Pudim', ocultar_no_pdv: true })).toBe('Feito: ocultei "Pudim" no PDV. O cardápio digital não muda.');
  });
});
