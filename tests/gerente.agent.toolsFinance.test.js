import { describe, expect, it } from 'vitest';
import { makeDb } from './helpers/gerenteStubs.js';
import {
  alterarDespesa,
  buscarFiado,
  criarDespesa,
  excluirDespesa,
  listarDespesas,
  resumoFiado,
} from '../src/lib/server/gerente/tools/finance.js';
import { TOOLS, WRITE_TOOL_NAMES, summarizeAction } from '../src/lib/server/gerente/toolRegistry.js';
import { buildAgentSystemPrompt } from '../src/lib/server/gerente/prompt.js';
import { resolveWriteTargets } from '../src/lib/server/gerente/resolveTargets.js';

const now = new Date('2026-09-15T15:00:00.000Z');

describe('tools financeiras do Zelinho', () => {
  it('resumo_fiado soma saldos em aberto e lista os maiores', async () => {
    const db = makeDb({
      tables: {
        pessoas: [{
          data: [
            { id: 'p1', nome: 'Ana', saldo_fiado: 40, contato: null },
            { id: 'p2', nome: 'Bruno', saldo_fiado: 10, contato: '11999999999' },
          ],
          error: null,
        }],
      },
    });
    const result = await resumoFiado(db, 'owner-1', { limite: 1 });
    expect(result.ok).toBe(true);
    expect(result.data.clientes_com_saldo).toBe(2);
    expect(result.data.total_em_aberto).toBe(50);
    expect(result.data.maiores).toEqual([{ id: 'p1', nome: 'Ana', saldo: 40, contato: null }]);
  });

  it('buscar_fiado encontra cliente por nome sem acento', async () => {
    const db = makeDb({
      tables: {
        pessoas: [{
          data: [
            { id: 'p1', nome: 'José da Silva', saldo_fiado: 12.5, contato: null, tipo: 'cliente' },
            { id: 'p2', nome: 'Maria', saldo_fiado: 0, contato: null, tipo: 'cliente' },
          ],
          error: null,
        }],
      },
    });
    const result = await buscarFiado(db, 'owner-1', { termo: 'jose' });
    expect(result.data.clientes).toEqual([{ id: 'p1', nome: 'José da Silva', saldo: 12.5, contato: null, tipo: 'cliente' }]);
  });

  it('listar_despesas filtra período e categoria', async () => {
    const db = makeDb({
      tables: {
        expenses: [{
          data: [
            { id: 'e1', description: 'Gás', amount: 120, category: 'Contas fixas', date: '2026-09-10T03:00:00.000Z' },
            { id: 'e2', description: 'Farinha', amount: 80, category: 'Insumos', date: '2026-09-12T03:00:00.000Z' },
          ],
          error: null,
        }],
      },
    });
    const result = await listarDespesas(db, 'owner-1', { periodo: 'mes' }, { now });
    expect(result.ok).toBe(true);
    expect(result.data.total).toBe(200);
    expect(result.data.quantidade).toBe(2);
    expect(result.data.por_categoria).toEqual({ 'Contas fixas': 120, Insumos: 80 });
  });

  it('criar_despesa valida e grava com owner', async () => {
    const db = makeDb({
      tables: {
        expenses: [{
          data: { id: 'e1', description: 'Gás', amount: 120, category: 'Contas fixas', date: '2026-09-15T03:00:00.000Z' },
          error: null,
        }],
      },
    });
    const result = await criarDespesa(db, 'owner-1', { descricao: 'Gás', valor: 120, categoria: 'Contas fixas' }, { now });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: 'e1', descricao: 'Gás', valor: 120, categoria: 'Contas fixas', data: '2026-09-15' });
    expect(db.calls[0].payload).toEqual(expect.objectContaining({
      user_id: 'owner-1',
      description: 'Gás',
      amount: 120,
      category: 'Contas fixas',
    }));
  });

  it('alterar_despesa devolve before/after', async () => {
    const current = { id: 'e1', description: 'Gás', amount: 120, category: 'Contas fixas', date: '2026-09-10T03:00:00.000Z' };
    const updated = { ...current, amount: 150 };
    const db = makeDb({
      tables: {
        expenses: [
          { data: current, error: null },
          { data: updated, error: null },
        ],
      },
    });
    const result = await alterarDespesa(db, 'owner-1', { despesa_id: 'e1', valor: 150 });
    expect(result.before.valor).toBe(120);
    expect(result.after.valor).toBe(150);
  });

  it('excluir_despesa remove e devolve o lançamento apagado', async () => {
    const current = { id: 'e1', description: 'Gás', amount: 120, category: 'Contas fixas', date: '2026-09-10T03:00:00.000Z' };
    const db = makeDb({
      tables: {
        expenses: [
          { data: current, error: null },
          { data: current, error: null },
        ],
      },
    });
    const result = await excluirDespesa(db, 'owner-1', { despesa_id: 'e1' });
    expect(result.ok).toBe(true);
    expect(result.before.descricao).toBe('Gás');
    expect(db.calls[1].op).toBe('delete');
  });
});

describe('registry e prompt de despesas/fiado', () => {
  it('registra tools de leitura e escrita com confirmação', () => {
    const names = TOOLS.map((t) => t.name);
    for (const name of ['resumo_fiado', 'buscar_fiado', 'listar_despesas', 'criar_despesa', 'alterar_despesa', 'excluir_despesa']) {
      expect(names).toContain(name);
    }
    expect(WRITE_TOOL_NAMES.has('criar_despesa')).toBe(true);
    expect(WRITE_TOOL_NAMES.has('alterar_despesa')).toBe(true);
    expect(WRITE_TOOL_NAMES.has('excluir_despesa')).toBe(true);
    expect(WRITE_TOOL_NAMES.has('resumo_fiado')).toBe(false);
    expect(summarizeAction('excluir_despesa', { descricao: 'Gás' })).toBe('Excluir despesa "Gás"');
  });

  it('prompt autoriza fiado leitura e despesas CRUD com cartão de confirmação', () => {
    const prompt = buildAgentSystemPrompt({ perfil: {}, channel: 'app', today: '2026-09-15' });
    expect(prompt).toContain('resumo_fiado');
    expect(prompt).toContain('criar_despesa');
    expect(prompt).toContain('excluir_despesa');
    expect(prompt).toContain('aguardando_confirmacao');
    expect(prompt).not.toMatch(/não mexe em.*despesas/i);
  });

  it('resolveWriteTargets valida despesa antes de excluir', async () => {
    const db = makeDb({
      tables: {
        expenses: [{ data: { id: 'e1', description: 'Gás', amount: 120, category: 'Contas fixas', date: '2026-09-10T03:00:00.000Z' }, error: null }],
      },
    });
    const ok = await resolveWriteTargets(db, 'owner-1', 'excluir_despesa', { despesa_id: 'e1' });
    expect(ok).toEqual({ ok: true, args: { despesa_id: 'e1', descricao: 'Gás' } });

    const missingDb = makeDb({ tables: { expenses: [{ data: null, error: null }] } });
    const missing = await resolveWriteTargets(missingDb, 'owner-1', 'excluir_despesa', { despesa_id: 'missing' });
    expect(missing.ok).toBe(false);
  });
});
