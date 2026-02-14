/**
 * Gerador de Relatório Excel — Zelo PDV
 * Usa SheetJS (xlsx) para gerar Excel formatado com múltiplas abas.
 */
import * as XLSX from 'xlsx';

const fmt = (n) => Number(n || 0).toFixed(2);

/**
 * @param {object} dados — mesmo formato de pdfReport.js
 */
export function generateExcelReport(dados) {
    const wb = XLSX.utils.book_new();

    // ==================== ABA: RESUMO ====================
    const resumoData = [
        ['ZELO PDV — RELATÓRIO DE VENDAS'],
        [`Período: ${dados.periodo}`],
        [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
        dados.modo === 'caixa' && dados.caixaId ? [`Caixa #${dados.caixaId}`] : [],
        [],
        ['INDICADORES PRINCIPAIS'],
        ['Métrica', 'Valor'],
        ['Total de Vendas', `R$ ${fmt(dados.kpis.totalGeral)}`],
        ['Qtd. de Vendas', dados.kpis.qtdVendas],
        ['Ticket Médio', `R$ ${fmt(dados.kpis.ticketMedio)}`],
        [],
        ['FORMAS DE PAGAMENTO'],
        ['Forma', 'Valor'],
        ['Dinheiro Líquido', `R$ ${fmt(dados.pagamentos.dinheiro)}`],
        ['Pix', `R$ ${fmt(dados.pagamentos.pix)}`],
        ['Cartão Débito', `R$ ${fmt(dados.pagamentos.debito)}`],
        ['Cartão Crédito', `R$ ${fmt(dados.pagamentos.credito)}`],
        ['Fiado', `R$ ${fmt(dados.pagamentos.fiado)}`],
        [],
        ['BALANÇO'],
        ['Item', 'Valor'],
        ['Total Bruto', `R$ ${fmt(dados.kpis.totalGeral)}`],
        ['Descontos', `−R$ ${fmt(dados.balanco.descontos)}`],
        ['Receita Líquida', `R$ ${fmt((dados.kpis.totalGeral || 0) - (dados.balanco.descontos || 0))}`],
        [],
        ['Sangrias', `−R$ ${fmt(dados.balanco.sangria)}`],
        ['Suprimentos', `+R$ ${fmt(dados.balanco.suprimento)}`],
    ].filter(row => row.length > 0);

    const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);

    // Column widths
    wsResumo['!cols'] = [{ wch: 28 }, { wch: 22 }];

    // Merge header cells
    wsResumo['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
    ];

    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    // ==================== ABA: SÉRIE DIÁRIA ====================
    const serie = dados.serieDiaria || [];
    if (serie.length > 0) {
        const serieHeader = ['Dia', 'Qtd. Vendas', 'Total (R$)'];
        const serieRows = serie.map(d => [
            new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR'),
            d.qtd,
            `R$ ${fmt(d.total)}`
        ]);

        const serieFull = [
            ['SÉRIE DIÁRIA DE VENDAS'],
            [`Período: ${dados.periodo}`],
            [],
            serieHeader,
            ...serieRows,
            [],
            ['TOTAIS'],
            ['Total de Vendas', serie.reduce((a, d) => a + d.qtd, 0), `R$ ${fmt(serie.reduce((a, d) => a + d.total, 0))}`],
        ];

        const wsSerie = XLSX.utils.aoa_to_sheet(serieFull);
        wsSerie['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 18 }];
        wsSerie['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        ];
        XLSX.utils.book_append_sheet(wb, wsSerie, 'Série Diária');
    }

    // ==================== ABA: TOP PRODUTOS ====================
    const prods = dados.topProdutos || [];
    if (prods.length > 0) {
        const prodHeader = ['#', 'Produto', 'Quantidade', 'Receita (R$)'];
        const prodRows = prods.map((p, i) => [
            i + 1,
            p.nome,
            p.quantidade,
            `R$ ${fmt(p.receita)}`
        ]);

        const prodFull = [
            ['TOP PRODUTOS'],
            [`Período: ${dados.periodo}`],
            [],
            prodHeader,
            ...prodRows,
            [],
            ['', 'TOTAL',
                prods.reduce((a, p) => a + p.quantidade, 0),
                `R$ ${fmt(prods.reduce((a, p) => a + p.receita, 0))}`
            ],
        ];

        const wsProds = XLSX.utils.aoa_to_sheet(prodFull);
        wsProds['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 18 }];
        wsProds['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        ];
        XLSX.utils.book_append_sheet(wb, wsProds, 'Top Produtos');
    }

    // ==================== ABA: BALANÇO ====================
    const bal = dados.balanco;
    if (bal) {
        const receitaLiquida = (dados.kpis.totalGeral || 0) - (bal.descontos || 0);
        const balancoFull = [
            ['BALANÇO DO PERÍODO'],
            [`Período: ${dados.periodo}`],
            [],
            ['Item', 'Valor (R$)', 'Observação'],
            ['Receita Bruta', `R$ ${fmt(dados.kpis.totalGeral)}`, 'Soma de todas as vendas'],
            ['Descontos', `−R$ ${fmt(bal.descontos)}`, 'Promoções e descontos aplicados'],
            ['Receita Líquida', `R$ ${fmt(receitaLiquida)}`, 'Receita bruta − descontos'],
            [],
            ['Sangrias', `−R$ ${fmt(bal.sangria)}`, 'Retiradas do caixa'],
            ['Suprimentos', `+R$ ${fmt(bal.suprimento)}`, 'Entradas extras no caixa'],
            [],
            ['RESUMO POR FORMA DE PAGAMENTO'],
            ['Forma', 'Valor (R$)', '% do Total'],
            ...(() => {
                const total = dados.kpis.totalGeral || 1;
                return [
                    ['Dinheiro', `R$ ${fmt(dados.pagamentos.dinheiro)}`, ((dados.pagamentos.dinheiro / total) * 100).toFixed(1) + '%'],
                    ['Pix', `R$ ${fmt(dados.pagamentos.pix)}`, ((dados.pagamentos.pix / total) * 100).toFixed(1) + '%'],
                    ['Cartão Débito', `R$ ${fmt(dados.pagamentos.debito)}`, ((dados.pagamentos.debito / total) * 100).toFixed(1) + '%'],
                    ['Cartão Crédito', `R$ ${fmt(dados.pagamentos.credito)}`, ((dados.pagamentos.credito / total) * 100).toFixed(1) + '%'],
                    ['Fiado', `R$ ${fmt(dados.pagamentos.fiado)}`, ((dados.pagamentos.fiado / total) * 100).toFixed(1) + '%'],
                ];
            })(),
            [],
            ['Qtd. de Vendas', dados.kpis.qtdVendas, ''],
            ['Ticket Médio', `R$ ${fmt(dados.kpis.ticketMedio)}`, ''],
        ];

        const wsBal = XLSX.utils.aoa_to_sheet(balancoFull);
        wsBal['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 30 }];
        wsBal['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        ];
        XLSX.utils.book_append_sheet(wb, wsBal, 'Balanço');
    }

    // Generate filename and download
    const periodoLabel = dados.periodo.replace(/[\/\s–]/g, '_').replace(/_+/g, '_');
    const filename = `relatorio_zelo_${periodoLabel}.xlsx`;
    XLSX.writeFile(wb, filename);
}
