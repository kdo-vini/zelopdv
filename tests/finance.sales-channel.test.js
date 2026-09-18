import { describe, expect, it } from 'vitest';
import {
  SALES_CHANNELS,
  SALES_CHANNEL_FILTER_OPTIONS,
  COMMISSION_UNAVAILABLE_LABEL,
  buildVendaChannelMap,
  channelHasCommissionData,
  filterVendasByChannel,
  filterRelatedByChannel,
  getChannelLabel,
  getChannelVisual,
  normalizeSalesChannel,
  summarizeEstornos,
  summarizeSalesByChannel,
} from '../src/lib/finance/salesChannel.js';

describe('salesChannel filter + labels', () => {
  it('exposes exactly the Todos|PDV|ZeloMenu|ZeloChat|Mesas|Manual|iFood filter contract in order', () => {
    expect(SALES_CHANNEL_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      'Todos', 'PDV', 'ZeloMenu', 'ZeloChat', 'Mesas', 'Manual', 'iFood',
    ]);
    expect(SALES_CHANNEL_FILTER_OPTIONS[0].value).toBe('');
    expect(SALES_CHANNEL_FILTER_OPTIONS.slice(1).map((o) => o.value)).toEqual(
      SALES_CHANNELS.map((c) => c.id)
    );
  });

  it('normalizes unknown/null/blank canal_origem to pdv, matching the DB trigger default', () => {
    expect(normalizeSalesChannel(null)).toBe('pdv');
    expect(normalizeSalesChannel(undefined)).toBe('pdv');
    expect(normalizeSalesChannel('')).toBe('pdv');
    expect(normalizeSalesChannel('nao-existe')).toBe('pdv');
    expect(normalizeSalesChannel('IFOOD')).toBe('ifood');
  });

  it('returns badge label and color for each known channel', () => {
    expect(getChannelLabel('ifood')).toBe('iFood');
    expect(getChannelLabel('mesa')).toBe('Mesas');
    expect(getChannelVisual('zelochat')).toMatchObject({ label: 'ZeloChat', color: expect.stringContaining('bg-') });
  });

  it('flags iFood as the only channel without commission/fee data today', () => {
    expect(channelHasCommissionData('ifood')).toBe(false);
    expect(channelHasCommissionData('pdv')).toBe(true);
    expect(channelHasCommissionData('zelomenu')).toBe(true);
    expect(channelHasCommissionData('mesa')).toBe(true);
  });

  it('exposes the exact "Indisponível" label used by the UI for missing commission data', () => {
    expect(COMMISSION_UNAVAILABLE_LABEL).toBe('Indisponível');
  });
});

describe('filterVendasByChannel', () => {
  const vendas = [
    { id: 1, canal_origem: 'pdv', valor_total: 10 },
    { id: 2, canal_origem: 'ifood', valor_total: 20 },
    { id: 3, canal_origem: 'mesa', valor_total: 30 },
    { id: 4, canal_origem: null, valor_total: 40 }, // falls back to pdv
  ];

  it('returns every sale when no channel is selected (Todos)', () => {
    expect(filterVendasByChannel(vendas, '')).toEqual(vendas);
  });

  it('filters to only the selected channel, including null → pdv fallback', () => {
    const pdv = filterVendasByChannel(vendas, 'pdv');
    expect(pdv.map((v) => v.id)).toEqual([1, 4]);
    expect(filterVendasByChannel(vendas, 'ifood').map((v) => v.id)).toEqual([2]);
  });
});

describe('filterRelatedByChannel', () => {
  const vendas = [
    { id: 1, canal_origem: 'pdv' },
    { id: 2, canal_origem: 'ifood' },
    { id: 3, canal_origem: 'mesa' },
  ];
  const rows = [
    { id_venda: 1, valor: 10 },
    { id_venda: 2, valor: 20 },
    { id_venda: 3, valor: 30 },
    { id_venda: 99, valor: 99 },
  ];

  it('returns every related row when no channel is selected', () => {
    expect(filterRelatedByChannel(rows, vendas, '')).toEqual(rows);
  });

  it('keeps only rows whose venda matches the selected channel', () => {
    expect(filterRelatedByChannel(rows, vendas, 'ifood').map((r) => r.id_venda)).toEqual([2]);
    expect(filterRelatedByChannel(rows, vendas, 'pdv').map((r) => r.id_venda)).toEqual([1]);
  });
});

describe('buildVendaChannelMap', () => {
  it('maps id_venda to normalized canal_origem', () => {
    const map = buildVendaChannelMap([
      { id: 10, canal_origem: 'ifood' },
      { id: 11, canal_origem: null },
    ]);
    expect(map.get(10)).toBe('ifood');
    expect(map.get(11)).toBe('pdv');
  });
});

describe('summarizeSalesByChannel', () => {
  const vendas = [
    { id: 1, canal_origem: 'pdv', valor_total: 100 },
    { id: 2, canal_origem: 'pdv', valor_total: 50 },
    { id: 3, canal_origem: 'ifood', valor_total: 80 },
    { id: 4, canal_origem: 'ifood', valor_total: 40 },
  ];

  it('aggregates quantity, gross total and average ticket per channel', () => {
    const cards = summarizeSalesByChannel(vendas);
    const pdv = cards.find((c) => c.canal === 'pdv');
    const ifood = cards.find((c) => c.canal === 'ifood');

    expect(pdv).toMatchObject({ qtd: 2, bruto: 150, ticketMedio: 75 });
    expect(ifood).toMatchObject({ qtd: 2, bruto: 120, ticketMedio: 60 });
  });

  it('only returns cards for channels with at least one sale, in canonical channel order', () => {
    const cards = summarizeSalesByChannel(vendas);
    expect(cards.map((c) => c.canal)).toEqual(['pdv', 'ifood']);
  });

  it('computes commission/net from vendas_taxas_plataforma for channels that track it', () => {
    const cards = summarizeSalesByChannel(vendas, {
      taxasPlataforma: [
        { id_venda: 1, valor_taxa: 10 },
        { id_venda: 2, valor_taxa: 5 },
      ],
    });
    const pdv = cards.find((c) => c.canal === 'pdv');
    expect(pdv.comissao).toBe(15);
    expect(pdv.liquido).toBe(135);
  });

  it('reports iFood commission/net as null (unavailable), never zero, even with a stray taxa row', () => {
    const cards = summarizeSalesByChannel(vendas, {
      taxasPlataforma: [{ id_venda: 3, valor_taxa: 999 }],
    });
    const ifood = cards.find((c) => c.canal === 'ifood');
    expect(ifood.comissao).toBeNull();
    expect(ifood.liquido).toBeNull();
  });

  it('aggregates applied reversals per channel and ignores pending_review amounts', () => {
    const cards = summarizeSalesByChannel(vendas, {
      estornos: [
        { id_venda: 3, status: 'applied', valor_estornado: 80 },
        { id_venda: 4, status: 'pending_review', valor_estornado: 40 },
      ],
    });
    const ifood = cards.find((c) => c.canal === 'ifood');
    expect(ifood.estornosQtd).toBe(1);
    expect(ifood.estornosValor).toBe(80);
  });
});

describe('summarizeEstornos', () => {
  const channelByVendaId = new Map([
    [1, 'pdv'],
    [2, 'ifood'],
    [3, 'ifood'],
  ]);
  const estornos = [
    { id_venda: 1, status: 'applied', valor_estornado: 15 },
    { id_venda: 2, status: 'applied', valor_estornado: 80 },
    { id_venda: 3, status: 'pending_review', valor_estornado: 999 },
  ];

  it('sums applied reversals across every channel when unscoped', () => {
    expect(summarizeEstornos(estornos, { channelByVendaId })).toEqual({ qtd: 2, valor: 95, pendentes: 1 });
  });

  it('scopes totals to a single channel when a filter is provided', () => {
    expect(summarizeEstornos(estornos, { channelByVendaId, channelFilter: 'ifood' })).toEqual({
      qtd: 1, valor: 80, pendentes: 1,
    });
    expect(summarizeEstornos(estornos, { channelByVendaId, channelFilter: 'pdv' })).toEqual({
      qtd: 1, valor: 15, pendentes: 0,
    });
  });
});
