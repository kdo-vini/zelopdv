import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sendRaw: vi.fn(), sendJob: vi.fn(), sendTest: vi.fn(), fallback: vi.fn(), toast: vi.fn() }));
vi.mock('../src/lib/zeloImpressaoClient.js', () => ({
  sendRawEscposPrintJob: mocks.sendRaw, sendTestPrint: mocks.sendTest,
  sendPrintJob: mocks.sendJob, fallbackToBrowserPrint: mocks.fallback,
  getZeloImpressaoFriendlyMessage: (error) => error.message,
}));
vi.mock('../src/lib/escpos.js', () => ({ buildVendaEscPos: () => new Uint8Array(), buildMovCaixaEscPos: () => new Uint8Array(), buildPagamentoFiadoEscPos: () => new Uint8Array(), buildTesteEscPos: () => new Uint8Array() }));
vi.mock('../src/lib/receipt.js', () => ({ buildReceiptHTML: () => '<p>Receipt</p>', buildMovCaixaHTML: vi.fn(), buildPagamentoFiadoHTML: vi.fn() }));
vi.mock('../src/lib/stores/ui.js', () => ({ addToast: mocks.toast }));
import { printVenda, printOrder } from '../src/lib/printService.js';
beforeEach(() => vi.clearAllMocks());
describe('receipt fallback', () => {
  it('shares the canonical automatic order key and keeps manual copies explicit', async () => {
    const order = { id: 'order-1', canonical: true, pedido_itens: [] };
    await printOrder(order, 'Loja', 'owner-1', { automatic: true });
    expect(mocks.sendJob.mock.calls[0][0]).toMatchObject({ companyStoreId: 'owner-1',
      intent: { mode: 'automatic', orderId: 'order-1', purpose: 'order_ticket' } });
    await printOrder(order, 'Loja', 'owner-1');
    expect(mocks.sendJob.mock.calls[1][0].intent).toEqual({ mode: 'manual' });
    await expect(printOrder(order, 'Loja', '', { automatic: true })).rejects.toMatchObject({ code: 'AUTO_PRINT_IDENTITY_REQUIRED' });
    expect(mocks.sendJob).toHaveBeenCalledTimes(2);
  });
  it('falls back when printing is known not to have started', async () => {
    mocks.sendRaw.mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { code: 'ZELO_IMPRESSAO_UNAVAILABLE', retrySafe: true }));
    await printVenda({});
    expect(mocks.fallback).toHaveBeenCalledOnce();
  });
  it('shows uncertainty and does not print a second copy after a lost acknowledgement', async () => {
    mocks.sendRaw.mockRejectedValueOnce(Object.assign(new Error('Confira a saída antes de tentar novamente.'), { code: 'PRINT_OUTCOME_UNKNOWN', retrySafe: false }));
    await printVenda({});
    expect(mocks.fallback).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalled();
  });
});
