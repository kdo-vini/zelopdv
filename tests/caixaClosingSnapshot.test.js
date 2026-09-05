import fs from 'node:fs';
import { parse } from 'svelte/compiler';
import { describe, expect, test, vi } from 'vitest';

const source = fs.readFileSync('src/routes/gestao/caixa/+page.svelte', 'utf8');
const node = parse(source).instance.content.body.find(statement => statement.type === 'FunctionDeclaration' && statement.id.name === 'fecharCaixa');
const closeFunction = source.slice(node.start, node.end);

// Exercise the actual page handler with its IO replaced. Financial arithmetic
// belongs to PostgreSQL; the page must transmit only the operator's count.
function mountClosingHandler({ snapshots, request, count = 125 }) {
  return new Function('readSnapshot', 'saveSnapshot', 'offlineRequest', 'getOfflineContext', 'addToast', 'window', `
    let caixa = { id: 42, valor_inicial: 500 };
    let ownerUserId = 'owner'; let fechando = false; let closeIntent = null;
    let valorEmGaveta = ${count}; let errorMessage = '';
    const crypto = globalThis.crypto;
    ${closeFunction}
    return { close: fecharCaixa, error: () => errorMessage };
  `)(async (owner, key) => snapshots.get(owner + ':' + key), async (owner, key, value) => snapshots.set(owner + ':' + key, value), request, () => null, vi.fn(), { location: { href: '' } });
}

describe('authoritative cash closing contract', () => {
  test('persists the operation ID before sending and reuses it after a lost response and reload', async () => {
    const snapshots = new Map(); const bodies = [];
    const request = vi.fn(async (path, options) => {
      expect(path).toBe('/api/caixa/close');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body); bodies.push(body);
      expect(snapshots.get('owner:caixa.closeIntent:42')).toBe(body.clientOperationId);
      if (bodies.length === 1) throw new Error('Response lost after remote commit');
      return { status: 'already_applied', result: { id: 42 } };
    });
    const first = mountClosingHandler({ snapshots, request });
    await first.close();
    expect(first.error()).toContain('Response lost');
    expect(snapshots.has('owner:caixa.aberto')).toBe(false);
    await mountClosingHandler({ snapshots, request }).close();
    expect(bodies[1]).toEqual(bodies[0]);
    expect(Object.keys(bodies[0]).sort()).toEqual(['clientOperationId', 'id_caixa', 'valor_contado_em_gaveta']);
    expect(bodies[0].valor_contado_em_gaveta).toBe(125);
    expect(snapshots.get('owner:caixa.aberto').data_fechamento).toBeTruthy();
  });
  test('does not mark the cash drawer closed when the server requests review', async () => {
    const snapshots = new Map();
    const handler = mountClosingHandler({ snapshots, request: async () => ({ status: 'needs_review', result: { reason: 'conflict' } }) });
    await handler.close();
    expect(handler.error()).toContain('confirmar o fechamento');
    expect(snapshots.has('owner:caixa.aberto')).toBe(false);
    expect(snapshots.get('owner:caixa.closeIntent:42')).toBeTruthy();
  });
});
