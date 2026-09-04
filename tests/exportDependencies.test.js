import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const generated = vi.hoisted(() => ({ buffer: null, filename: '' }));
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, writeFile: (workbook, filename) => {
    generated.buffer = actual.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    generated.filename = filename;
  } };
});
import { generateExcelReport } from '../src/lib/utils/excelReport.js';
import * as XLSX from 'xlsx';

describe('patched export and cookie dependencies', () => {
  it('writes and reopens a real multi-sheet report with Unicode, totals and merges', async () => {
    await generateExcelReport({ periodo: 'Hoje', modo: 'caixa', caixaId: 1,
      kpis: { totalGeral: 50, qtdVendas: 1, ticketMedio: 50 },
      pagamentos: { dinheiro: 0, pix: 0, debito: 0, credito: 0, valeRefeicao: 50, fiado: 0, extras: [] },
      balanco: { descontos: 5, sangria: 0, suprimento: 0 },
      serieDiaria: [{ dia: '2026-09-04', qtd: 1, total: 50 }],
      topProdutos: [{ nome: 'Pão de queijo', categoria: 'Café', quantidade: 2, receita: 50 }],
    });
    const workbook = XLSX.read(generated.buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Resumo', 'Série Diária', 'Produtos Vendidos', 'Balanço']);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Resumo, { header: 1 })).toContainEqual(['Vale-Refeição', 'R$ 50.00']);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['Produtos Vendidos'], { header: 1 })).toContainEqual([1, 'Pão de queijo', 'Café', 2, 'R$ 50.00']);
    expect(workbook.Sheets.Resumo['!merges']).toHaveLength(3);
    expect(generated.filename).toBe('relatorio_zelo_Hoje.xlsx');
  });
  it('preserves Kit cookie serialization and rejects invalid cookie attributes in both apps', () => {
    for (const manifest of ['../package.json', '../admin-dashboard/package.json']) {
      const require = createRequire(new URL(manifest, import.meta.url));
      const kitRequire = createRequire(require.resolve('@sveltejs/kit/package.json'));
      const cookie = kitRequire('cookie');
      const encoded = cookie.serialize('session', 'a b', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 });
      expect(encoded).toContain('session=a%20b; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax');
      expect(cookie.parse('session=a%20b')).toEqual({ session: 'a b' });
      expect(() => cookie.serialize('session', 'ok', { path: '/; injected=value' })).toThrow();
    }
  });
});
