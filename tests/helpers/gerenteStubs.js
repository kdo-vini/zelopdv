// tests/helpers/gerenteStubs.js
import { vi } from 'vitest';

const CHAIN_METHODS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte', 'ilike', 'order', 'limit', 'range'];

function makeQuery(result, record) {
  const query = {};
  for (const method of CHAIN_METHODS) {
    query[method] = vi.fn((...args) => {
      if (method === 'eq' || method === 'is' || method === 'in' || method === 'gt' || method === 'gte' || method === 'lt' || method === 'lte' || method === 'ilike') {
        record.filters.push({ op: method, field: args[0], value: args[1] });
      }
      if (method === 'insert' || method === 'update' || method === 'upsert') {
        record.payload = args[0];
        record.op = method;
      }
      if (method === 'delete') record.op = 'delete';
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

/**
 * Cria um cliente Supabase falso. Cada `db.from(tabela)` consome o próximo
 * resultado de `tables[tabela]`; se a lista acabar, devolve `{ data: null, error: null }`.
 */
export function makeDb({ tables = {}, rpcs = {} } = {}) {
  const calls = [];
  const cursors = new Map();
  return {
    calls,
    from: vi.fn((table) => {
      const index = cursors.get(table) || 0;
      cursors.set(table, index + 1);
      const results = tables[table] || [];
      const result = results[index] ?? { data: null, error: null };
      const record = { table, filters: [], payload: null, op: 'select' };
      calls.push(record);
      return makeQuery(result, record);
    }),
    rpc: vi.fn(async (name, params) => {
      calls.push({ rpc: name, params });
      const entry = rpcs[name];
      if (typeof entry === 'function') return entry(params);
      return entry ?? { data: null, error: null };
    }),
  };
}

/** Cliente OpenAI falso: devolve as respostas na ordem informada. */
export function makeOpenAi(responses) {
  const queue = [...responses];
  const create = vi.fn(async (params) => {
    const next = queue.shift();
    if (!next) throw new Error('makeOpenAi: sem resposta programada');
    return typeof next === 'function' ? next(params) : next;
  });
  return { chat: { completions: { create } }, create };
}

export function assistantMessage(content, toolCalls = null) {
  return {
    choices: [{ message: { role: 'assistant', content, tool_calls: toolCalls } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };
}

export function toolCall(id, name, args) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}
