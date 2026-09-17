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

    expect(sheets[0]).toContainEqual(['Vale-Refeição', 'R$ 50.00']);
  });

  it('exports iFood commission/net as "Indisponível" instead of R$ 0.00', async () => {
    await generateExcelReport({
      periodo: 'Hoje', modo: 'caixa', caixaId: 1,
      kpis: { totalGeral: 180, qtdVendas: 3, ticketMedio: 60 },
      pagamentos: { dinheiro: 100, pix: 0, debito: 0, credito: 0, valeRefeicao: 0, fiado: 0, extras: [] },
      balanco: { descontos: 0, sangria: 0, suprimento: 0 },
      porCanal: [
        { label: 'PDV', qtd: 2, bruto: 100, comissao: 5, liquido: 95 },
        { label: 'iFood', qtd: 1, bruto: 80, comissao: null, liquido: null },
      ],
      estornos: { qtd: 1, valor: 40, pendentes: 1 },
    });

    expect(sheets[0]).toContainEqual(['PDV', 2, 'R$ 100.00', 'R$ 5.00', 'R$ 95.00']);
    expect(sheets[0]).toContainEqual(['iFood', 1, 'R$ 80.00', 'Indisponível', 'Indisponível']);
    expect(sheets[0]).not.toContainEqual(['iFood', 1, 'R$ 80.00', 'R$ 0.00', 'R$ 0.00']);
    expect(sheets[0]).toContainEqual(['Estornos aplicados', 1]);
    expect(sheets[0]).toContainEqual(['Valor estornado', '−R$ 40.00']);
    expect(sheets[0]).toContainEqual(['Pendentes de revisão', 1]);
  });
});
