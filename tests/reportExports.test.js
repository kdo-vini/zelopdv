import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateExcelReport } from '../src/lib/utils/excelReport.js';

const sheets = [];

vi.mock('xlsx', () => ({
  utils: {
    book_new: () => ({}),
    aoa_to_sheet: (rows) => {
      sheets.push(rows);
      return {};
    },
    book_append_sheet: () => {},
  },
  writeFile: () => {},
}));

describe('report exports', () => {
  beforeEach(() => sheets.length = 0);

  it('exports Vale-refeição as its own payment line', async () => {
    await generateExcelReport({
      periodo: 'Hoje', modo: 'caixa', caixaId: 1,
      kpis: { totalGeral: 50, qtdVendas: 1, ticketMedio: 50 },
      pagamentos: { dinheiro: 0, pix: 0, debito: 0, credito: 0, valeRefeicao: 50, fiado: 0, extras: [] },
      balanco: { descontos: 0, sangria: 0, suprimento: 0 },
    });

    expect(sheets[0]).toContainEqual(['Vale-refeição', 'R$ 50.00']);
  });
});
