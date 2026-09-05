import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sendRaw: vi.fn(), sendJob: vi.fn(), sendTest: vi.fn(), fallback: vi.fn(), toast: vi.fn(), enqueue: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/zeloImpressaoClient.js', () => ({
  sendRawEscposPrintJob: mocks.sendRaw, sendTestPrint: mocks.sendTest,
  sendPrintJob: mocks.sendJob, fallbackToBrowserPrint: mocks.fallback,
  getZeloImpressaoFriendlyMessage: (error) => error.message,
}));
vi.mock('../src/lib/escpos.js', () => ({ buildVendaEscPos: () => new Uint8Array(), buildMovCaixaEscPos: () => new Uint8Array(), buildPagamentoFiadoEscPos: () => new Uint8Array(), buildTesteEscPos: () => new Uint8Array() }));
vi.mock('../src/lib/receipt.js', () => ({ buildReceiptHTML: () => '<p>Receipt</p>', buildMovCaixaHTML: vi.fn(), buildPagamentoFiadoHTML: vi.fn() }));
vi.mock('../src/lib/stores/ui.js', () => ({ addToast: mocks.toast }));
vi.mock('../src/lib/remotePrintQueue.js', () => ({ enqueueRemotePrintJob: mocks.enqueue }));
vi.mock('../src/lib/supabaseClient.js', () => ({ supabase: { rpc: mocks.rpc } }));
import { printVenda, printOrder } from '../src/lib/printService.js';
beforeEach(() => vi.clearAllMocks());
describe('receipt fallback', () => {
  it('shares the canonical automatic order key and keeps manual copies explicit', async () => {
    const order = { id: 'b693f14c-6741-44d4-8d61-f7a935aa3870', canonical: true, pedido_itens: [] };
    mocks.enqueue.mockResolvedValueOnce({ status: 'pending', stationOnline: true });
    await printOrder(order, 'Loja', 'owner-1', { automatic: true });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ companyStoreId: 'owner-1',
      jobId: order.id, intent: { mode: 'automatic', orderId: order.id, purpose: 'order_ticket' } }));
    await printOrder(order, 'Loja', 'owner-1');
    expect(mocks.sendJob.mock.calls[0][0].intent).toEqual({ mode: 'manual' });
    await expect(printOrder(order, 'Loja', '', { automatic: true })).rejects.toMatchObject({ code: 'AUTO_PRINT_IDENTITY_REQUIRED' });
    expect(mocks.sendJob).toHaveBeenCalledTimes(1);
  });
  it('falls back when printing is known not to have started', async () => {
    mocks.sendRaw.mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { code: 'ZELO_IMPRESSAO_UNAVAILABLE', retrySafe: true }));
    mocks.enqueue.mockRejectedValueOnce(new Error('Queue unavailable'));
    await printVenda({});
    expect(mocks.fallback).toHaveBeenCalledOnce();
  });
  it('queues a safe local failure and suppresses browser fallback', async () => {
    mocks.sendRaw.mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { code: 'ZELO_IMPRESSAO_UNAVAILABLE', retrySafe: true }));
    mocks.enqueue.mockResolvedValueOnce({ status: 'pending', stationOnline: true });
    await printVenda({});
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      jobId: expect.any(String), type: 'receipt',
      content: { format: 'raw_escpos_base64', base64: '' },
    }));
    expect(mocks.fallback).not.toHaveBeenCalled();
  });
  it('shows uncertainty and does not print a second copy after a lost acknowledgement', async () => {
    mocks.sendRaw.mockRejectedValueOnce(Object.assign(new Error('Confira a saída antes de tentar novamente.'), { code: 'PRINT_OUTCOME_UNKNOWN', retrySafe: false }));
    await printVenda({});
    expect(mocks.fallback).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalled();
  });
});
