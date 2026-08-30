import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createPsqlProcessLifecycle } from '../scripts/lib/psql-process-lifecycle.mjs';

function fakeHandle({ resist = false } = {}) {
  const stdin = new EventEmitter();
  stdin.destroyed = false;
  stdin.writableEnded = false;
  stdin.endCalls = 0;
  stdin.end = () => { stdin.endCalls += 1; stdin.writableEnded = true; };
  stdin.write = () => true;
  const child = new EventEmitter();
  child.stdin = stdin;
  child.pid = 1234;
  let closed = false;
  child.kill = (signal) => {
    if (!resist || signal === 'SIGKILL') {
      closed = true;
      child.emit('close', 0);
    }
    return true;
  };
  const done = new Promise((resolve) => child.once('close', (code) => resolve({ code })));
  return { child, done, closed: () => closed, stdin };
}

describe('ciclo de vida dos processos psql do probe WhatsApp', () => {
  it('encerra stdin apenas uma vez mesmo quando finalizado duas vezes', async () => {
    const lifecycle = createPsqlProcessLifecycle({ timeoutMs: 10, spawnImpl: () => null, platform: 'linux' });
    const handle = fakeHandle();
    handle.child.emit('close', 0);
    await lifecycle.finalizePsql(handle, 'primeira');
    await lifecycle.finalizePsql(handle, 'segunda');
    expect(handle.stdin.endCalls).toBe(1);
  });

  it('rejeita com diagnóstico ao detectar erro no stdin após encerrar o filho resistente', async () => {
    const lifecycle = createPsqlProcessLifecycle({ timeoutMs: 10, spawnImpl: () => null, platform: 'linux' });
    const handle = fakeHandle({ resist: true });
    const finalizing = lifecycle.finalizePsql(handle, 'resistente');
    handle.stdin.emit('error', new Error('stdin caiu'));
    await expect(finalizing).rejects.toThrow('stdin de psql');
    expect(handle.closed()).toBe(true);
  });
});
