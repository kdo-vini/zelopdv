import fs from 'node:fs';
import { parse } from 'svelte/compiler';
import { expect, it, vi } from 'vitest';
function handler(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const node = parse(source).instance.content.body.find(statement => statement.type === 'FunctionDeclaration' && statement.id.name === name);
  return source.slice(node.start, node.end);
}
it('the actual movement modal stores an offline intention with turn dependency before announcing success', async () => {
  const submit = vi.fn().mockRejectedValueOnce(new Error('Quota unavailable')).mockImplementation(async (_type, _id, _payload, opts) => ({ operationId: opts.operationId, occurredAt: '2026-09-05T00:00:00Z' }));
  const dispatch = vi.fn(); const supabase = { from: vi.fn(() => { throw new Error('Network must not be required'); }) };
  const controller = new Function('getOfflineContext', 'submitOfflineOperation', 'listOperations', 'dispatch', 'supabase', 'addToast', `
    let idCaixa='turn-local', saldoCaixa=100, tipo='saida', valor=10, motivo='Troco', salvando=false, erro='', movementIntent=null, imprimirRecibo=false;
    const crypto=globalThis.crypto;
    ${handler('src/lib/components/modals/ModalMovCaixa.svelte', 'handleSubmit')}
    return { submit: handleSubmit, error: () => erro };
  `)(() => ({ enabled: true, ownerUserId: 'owner' }), submit, async () => [{ type: 'caixa.open', entityId: 'turn-local', operationId: 'opening' }], dispatch, supabase, vi.fn());
  await controller.submit();
  expect(controller.error()).toContain('Quota'); expect(dispatch).not.toHaveBeenCalled();
  await controller.submit();
  expect(submit.mock.calls[1][3]).toEqual(submit.mock.calls[0][3]);
  expect(submit.mock.calls[1]).toMatchObject(['caixa.move', 'turn-local', { valor: 10, tipo: 'sangria' }, { dependencies: ['opening'] }]);
  expect(dispatch).toHaveBeenCalledWith('sucesso', expect.objectContaining({ idCaixa: 'turn-local', valor: 10 }));
  expect(supabase.from).not.toHaveBeenCalled();
});
it('the actual payment modal uses prepared fiado people without a network request', async () => {
  const supabase = { from: vi.fn(() => { throw new Error('Network unavailable'); }) };
  const read = vi.fn(async () => [{ id: 7, nome: 'Cliente preparado' }]);
  const load = new Function('getOfflineContext', 'readOperationalSnapshot', 'supabase', 'addToast', `
    let pessoasFiado=[], pessoasOwner=null;
    ${handler('src/lib/components/modals/ModalPagamento.svelte', 'carregarPessoasFiado')}
    return async () => { await carregarPessoasFiado(); return pessoasFiado; };
  `)(() => ({ ownerUserId: 'owner' }), read, supabase, vi.fn());
  expect(await load()).toEqual([{ id: 7, nome: 'Cliente preparado' }]);
  expect(read.mock.calls[0][0]).toBe('pessoas.fiado');
  expect(supabase.from).not.toHaveBeenCalled();
});
