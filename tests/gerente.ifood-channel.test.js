import { describe, expect, it } from 'vitest';
import { assistantMessage, makeDb, makeOpenAi, toolCall } from './helpers/gerenteStubs.js';
import { resumoPeriodo } from '../src/lib/server/gerente/tools/insights.js';
import { summarizeSalesByChannel } from '../src/lib/finance/salesChannel.js';
import { runAgentTurn } from '../src/lib/server/gerente/agent.js';

// 2026-09-02 15:00 UTC = 12:00 em São Paulo (quarta-feira)
const now = new Date('2026-09-02T15:00:00Z');

const vendasHoje = [
  { id: 1, valor_total: 50, forma_pagamento: 'pix', created_at: '2026-09-02T13:00:00Z', canal_origem: 'ifood' },
  { id: 2, valor_total: 30, forma_pagamento: 'dinheiro', created_at: '2026-09-02T14:00:00Z', canal_origem: 'pdv' },
  { id: 3, valor_total: 20, forma_pagamento: 'pix', created_at: '2026-09-02T14:30:00Z', canal_origem: 'ifood' },
];

function baseTables(extra = {}) {
  return {
    empresa_perfil: [{ data: { nome_exibicao: 'Lanchonete do Zé' }, error: null }],
    gerente_agent_sessions: [{ data: { id: 'sess-1' }, error: null }, { data: null, error: null }],
    gerente_agent_messages: [{ data: [], error: null }, { data: null, error: null }],
    ai_usage_logs: [{ data: null, error: null }],
    ...extra,
  };
}

function vendasTables(extra = {}) {
  return {
    vendas: [{ data: vendasHoje, error: null }],
    vendas_itens: [{ data: [], error: null }],
    vendas_pagamentos: [{ data: [], error: null }],
    vendas_taxas_plataforma: [{ data: [], error: null }],
    ...extra,
  };
}

describe('resumoPeriodo.por_canal casa com summarizeSalesByChannel (relatórios)', () => {
  it('receita_bruta e qtd_vendas por canal são os mesmos números do relatório de vendas por canal', async () => {
    const db = makeDb({ tables: vendasTables() });
    const resumo = await resumoPeriodo(db, 'owner-1', { periodo: 'hoje' }, { now });
    expect(resumo.ok).toBe(true);

    const cards = summarizeSalesByChannel(vendasHoje, { taxasPlataforma: [], estornos: [] });
    const cardsById = new Map(cards.map((card) => [card.canal, card]));

    for (const [canalId, valores] of Object.entries(resumo.data.por_canal)) {
      const card = cardsById.get(canalId);
      expect(card, `esperava card do canal ${canalId}`).toBeTruthy();
      expect(valores.receita_bruta).toBe(card.bruto);
      expect(valores.qtd_vendas).toBe(card.qtd);
    }
  });
});

describe('Zelinho responde perguntas por canal (cenários mínimos)', () => {
  it('"quanto vendi hoje?" chama resumo_periodo sem canal e o resultado traz por_canal sem PII', async () => {
    const db = makeDb({ tables: { ...baseTables(), ...vendasTables() } });
    let toolResultRaw = null;
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('call-1', 'resumo_periodo', { periodo: 'hoje' })]),
      (params) => {
        const toolMsg = params.messages.at(-1);
        expect(toolMsg.role).toBe('tool');
        toolResultRaw = toolMsg.content;
        return assistantMessage('Hoje você vendeu R$ 100,00 no total, com R$ 70,00 vindo do iFood e R$ 30,00 do PDV.');
      },
    ]);

    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'quanto vendi hoje?', now });

    expect(result.toolsUsed).toEqual(['resumo_periodo']);
    const call = openai.create.mock.calls[0][0].tools;
    expect(call.some((t) => t.function.name === 'resumo_periodo')).toBe(true);
    expect(toolResultRaw).toBeTruthy();
    const parsed = JSON.parse(toolResultRaw);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.por_canal).toEqual({
      ifood: { receita_bruta: 70, qtd_vendas: 2 },
      pdv: { receita_bruta: 30, qtd_vendas: 1 },
    });
    expect(toolResultRaw).not.toMatch(/telefone|endereco|address|customer|phone|cliente/i);
    expect(result.reply).toContain('R$ 100,00');
  });

  it('"quanto veio do iFood?" chama resumo_periodo com canal=ifood e escopa a resposta', async () => {
    const db = makeDb({ tables: { ...baseTables(), ...vendasTables() } });
    let toolResultRaw = null;
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('call-1', 'resumo_periodo', { periodo: 'hoje', canal: 'ifood' })]),
      (params) => {
        toolResultRaw = params.messages.at(-1).content;
        return assistantMessage('O faturamento bruto do iFood hoje foi R$ 70,00, em 2 vendas.');
      },
    ]);

    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'quanto veio do iFood hoje?', now });

    expect(result.toolsUsed).toEqual(['resumo_periodo']);
    const parsed = JSON.parse(toolResultRaw);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toMatchObject({ receita_bruta: 70, qtd_vendas: 2 });
    expect(parsed.data.por_canal).toEqual({ ifood: { receita_bruta: 70, qtd_vendas: 2 } });
    expect(toolResultRaw).not.toMatch(/telefone|endereco|address|customer|phone|cliente/i);
    expect(result.reply).toContain('bruto');
  });

  it('"compare iFood com os outros canais" chama resumo_periodo sem canal e usa por_canal completo para comparar', async () => {
    const db = makeDb({ tables: { ...baseTables(), ...vendasTables() } });
    let toolResultRaw = null;
    const openai = makeOpenAi([
      assistantMessage(null, [toolCall('call-1', 'resumo_periodo', { periodo: 'hoje' })]),
      (params) => {
        toolResultRaw = params.messages.at(-1).content;
        return assistantMessage('Hoje o iFood faturou R$ 70,00 em 2 vendas (bruto), contra R$ 30,00 em 1 venda no PDV.');
      },
    ]);

    const result = await runAgentTurn({ db, openai, ownerUserId: 'owner-1', actorUserId: 'owner-1', channel: 'app', message: 'compare o iFood com os outros canais hoje', now });

    expect(result.toolsUsed).toEqual(['resumo_periodo']);
    const parsed = JSON.parse(toolResultRaw);
    expect(parsed.ok).toBe(true);
    expect(Object.keys(parsed.data.por_canal).sort()).toEqual(['ifood', 'pdv']);
    expect(toolResultRaw).not.toMatch(/telefone|endereco|address|customer|phone|cliente/i);
    expect(result.reply).toContain('iFood');
    expect(result.reply).toContain('PDV');
  });
});

describe('prompt do Zelinho distingue bruto de líquido para iFood', () => {
  it('o texto do system prompt explica que por_canal do iFood é bruto operacional, não repasse líquido', async () => {
    const { buildAgentSystemPrompt } = await import('../src/lib/server/gerente/prompt.js');
    const prompt = buildAgentSystemPrompt({ perfil: {}, channel: 'app', hints: [], today: '2026-09-02' });
    expect(prompt).toMatch(/bruto/i);
    expect(prompt).toMatch(/comiss(ã|a)o/i);
    expect(prompt.toLowerCase()).toContain('ifood');
  });
});
