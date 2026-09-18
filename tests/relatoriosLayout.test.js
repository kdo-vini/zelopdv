import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(resolve('src/routes/relatorios/+layout.svelte'), 'utf8');
const reportPage = readFileSync(resolve('src/routes/relatorios/+page.svelte'), 'utf8');

describe('Relatórios desktop layout', () => {
  it('uses the document scroll instead of creating a second scroll area beside the report', () => {
    const workspaceStyles = layout.slice(
      layout.indexOf('<style>'),
      layout.indexOf('</style>')
    );

    expect(layout).not.toMatch(/relatorios-content[^\n]*md:overflow-y-auto/);
    const workspaceRule = workspaceStyles.match(/\.relatorios-workspace\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
    expect(workspaceRule).not.toMatch(/(?<!min-)height:\s*100d?vh/);
  });

  it('keeps the sidebar pinned while the document scrolls', () => {
    const workspaceStyles = layout.slice(
      layout.indexOf('<style>'),
      layout.indexOf('</style>')
    );
    const sidebarRule = workspaceStyles.match(
      /\.relatorios-workspace\s+:global\(#gestao-sidebar\)\s*\{([\s\S]*?)\n\s*\}/
    )?.[1] || '';

    expect(sidebarRule).toMatch(/position:\s*sticky/);
    expect(sidebarRule).toMatch(/top:\s*0/);
    expect(sidebarRule).toMatch(/align-self:\s*flex-start/);
  });

  it('does not force the report content to outgrow the document-scrolling workspace', () => {
    expect(reportPage).not.toContain('class="flex min-h-full flex-col gap-5"');
  });
});

describe('Relatórios canal de origem (Task 15)', () => {
  it('centralizes channel filter/badge/commission logic in salesChannel.js instead of inlining it', () => {
    expect(reportPage).toContain("from '$lib/finance/salesChannel'");
    expect(reportPage).toContain('SALES_CHANNEL_FILTER_OPTIONS');
    expect(reportPage).toContain('getChannelVisual');
    expect(reportPage).toContain('summarizeSalesByChannel');
    expect(reportPage).toContain('summarizeEstornos');
  });

  it('exposes the Todos|PDV|ZeloMenu|ZeloChat|Mesas|Manual|iFood filter for both caixa and período modes', () => {
    expect(reportPage).toContain('id="select-canal-caixa"');
    expect(reportPage).toContain('id="select-canal-periodo"');
  });

  it('adds canal_origem to every vendas select used by the report queries', () => {
    const vendasSelects = [...reportPage.matchAll(/\.from\('vendas'\)\s*\.select\('([^']+)'\)/g)].map((m) => m[1]);
    expect(vendasSelects.length).toBeGreaterThan(0);
    for (const select of vendasSelects) {
      expect(select).toContain('canal_origem');
    }
  });

  it('loads vendas_estornos in batches, mirroring the vendas_taxas_plataforma chunking pattern', () => {
    expect(reportPage).toContain("from('vendas_estornos')");
    expect(reportPage).toContain('carregarEstornosPorVendas');
    const fnBody = reportPage.slice(
      reportPage.indexOf('async function carregarEstornosPorVendas'),
      reportPage.indexOf('async function carregarEstornosPorVendas') + 600
    );
    expect(fnBody).toContain('chunkArray(vendaIds, 1000)');
    expect(fnBody).toContain("from('vendas_estornos')");
  });

  it('renders comparative per-channel cards and never shows iFood commission/net as zero', () => {
    expect(reportPage).toContain('Vendas por Canal');
    expect(reportPage).toContain('Estornos / Cancelamentos');
    expect(reportPage).toContain('COMMISSION_UNAVAILABLE_LABEL');
    expect(reportPage).toMatch(/canal\.comissao === null \? COMMISSION_UNAVAILABLE_LABEL/);
    expect(reportPage).toMatch(/canal\.liquido === null \? COMMISSION_UNAVAILABLE_LABEL/);
  });

  it('scopes KPIs and related rows by channel while keeping comparative cards unfiltered', () => {
    expect(reportPage).toContain('filterRelatedByChannel');
    expect(reportPage).toContain('vendasEscopoCaixa');
    expect(reportPage).toContain('periodoVendasEscopo');
    expect(reportPage).toMatch(/summarizeSalesByChannel\(vendas,/);
    expect(reportPage).toMatch(/summarizeSalesByChannel\(periodoVendas,/);
    expect(reportPage).toContain('calculatePaymentSummary(vendasEscopoCaixa, pagamentosEscopoCaixa)');
    expect(reportPage).toContain('calculatePaymentSummary(periodoVendasEscopo, periodoPagamentosEscopo)');
  });

  it('shows a channel badge on each sale row in the Vendas do Caixa table', () => {
    const vendasTableSection = reportPage.slice(reportPage.indexOf('Vendas do Caixa'), reportPage.indexOf('Movimentações do Caixa'));
    expect(vendasTableSection).toContain('getChannelVisual(v.canal_origem)');
    expect(vendasTableSection).toContain('canalVisual.label');
  });
});
