/**
 * Gerador de Relatório PDF — Zelo PDV
 * Usa jsPDF + jspdf-autotable para gerar relatórios visuais e estruturados.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = {
    primary: [59, 130, 246],      // blue-500
    primaryDark: [30, 64, 175],   // blue-800
    success: [34, 197, 94],       // green-500
    warning: [245, 158, 11],      // amber-500
    danger: [239, 68, 68],        // red-500
    purple: [139, 92, 246],       // violet-500
    cyan: [6, 182, 212],          // cyan-500
    slate: [100, 116, 139],       // slate-500
    slateDark: [51, 65, 85],      // slate-700
    slateLight: [241, 245, 249],  // slate-100
    white: [255, 255, 255],
    black: [15, 23, 42],          // slate-900
};

const fmt = (n) => `R$ ${Number(n || 0).toFixed(2)}`;

/**
 * @param {object} dados
 * @param {string} dados.periodo - Ex: "01/02/2026 – 14/02/2026"
 * @param {string} dados.modo - 'caixa' | 'periodo'
 * @param {object} dados.kpis
 * @param {Array} dados.serieDiaria
 * @param {Array} dados.topProdutos
 * @param {object} dados.pagamentos - { dinheiro, pix, debito, credito, fiado }
 * @param {object} dados.balanco - { sangria, suprimento, descontos }
 */
export function generatePDFReport(dados) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // ==================== HEADER ====================
    function drawHeader() {
        // Background bar
        doc.setFillColor(...COLORS.primaryDark);
        doc.rect(0, 0, pageWidth, 32, 'F');

        // Accent line
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 32, pageWidth, 1.5, 'F');

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(...COLORS.white);
        doc.text('Zelo PDV', margin, 15);

        // Subtitle
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('Relatório de Vendas', margin, 22);

        // Period on the right
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Período: ${dados.periodo}`, pageWidth - margin, 13, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const now = new Date().toLocaleString('pt-BR');
        doc.text(`Gerado em: ${now}`, pageWidth - margin, 19, { align: 'right' });

        if (dados.modo === 'caixa' && dados.caixaId) {
            doc.text(`Caixa #${dados.caixaId}`, pageWidth - margin, 25, { align: 'right' });
        }

        y = 40;
    }

    // ==================== KPI CARDS ====================
    function drawKPIs() {
        const kpis = dados.kpis;
        const cards = [
            { label: 'Total de Vendas', value: fmt(kpis.totalGeral), color: COLORS.primary },
            { label: 'Qtd. Vendas', value: String(kpis.qtdVendas), color: COLORS.success },
            { label: 'Ticket Médio', value: fmt(kpis.ticketMedio), color: COLORS.purple },
            { label: 'Dinheiro Líq.', value: fmt(kpis.dinheiro), color: COLORS.success },
        ];

        const cardW = (contentWidth - 6) / 4;
        const cardH = 20;

        cards.forEach((card, i) => {
            const x = margin + i * (cardW + 2);

            // Card background
            doc.setFillColor(...COLORS.slateLight);
            doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');

            // Left accent
            doc.setFillColor(...card.color);
            doc.rect(x, y + 2, 1.5, cardH - 4, 'F');

            // Label
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.slate);
            doc.text(card.label, x + 5, y + 7);

            // Value
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...COLORS.black);
            doc.text(card.value, x + 5, y + 15);
        });

        y += cardH + 6;
    }

    // ==================== PAYMENT BREAKDOWN ====================
    function drawPaymentBreakdown() {
        const pags = dados.pagamentos;
        const items = [
            { label: 'Dinheiro', value: pags.dinheiro, color: COLORS.success },
            { label: 'Pix', value: pags.pix, color: COLORS.cyan },
            { label: 'Débito', value: pags.debito, color: COLORS.primary },
            { label: 'Crédito', value: pags.credito, color: COLORS.purple },
            { label: 'Fiado', value: pags.fiado, color: COLORS.warning },
        ].filter(it => it.value > 0);

        if (items.length === 0) return;

        const total = items.reduce((a, it) => a + it.value, 0);

        // Section title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.slateDark);
        doc.text('Formas de Pagamento', margin, y + 4);
        y += 8;

        // Stacked bar
        const barH = 10;
        let barX = margin;
        items.forEach(it => {
            const w = (it.value / total) * contentWidth;
            doc.setFillColor(...it.color);
            doc.rect(barX, y, Math.max(w, 2), barH, 'F');
            barX += w;
        });
        y += barH + 3;

        // Legend
        const legendCols = Math.min(items.length, 5);
        const colW = contentWidth / legendCols;
        items.forEach((it, i) => {
            const lx = margin + i * colW;
            doc.setFillColor(...it.color);
            doc.rect(lx, y, 3, 3, 'F');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.slate);
            doc.text(`${it.label}`, lx + 5, y + 3);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.black);
            const pct = total > 0 ? ((it.value / total) * 100).toFixed(1) : '0';
            doc.text(`${fmt(it.value)} (${pct}%)`, lx + 5, y + 7);
        });
        y += 12;
    }

    // ==================== BAR CHART ====================
    function drawBarChart() {
        const serie = dados.serieDiaria || [];
        if (serie.length === 0) return;

        // Section title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.slateDark);
        doc.text('Vendas por Dia', margin, y + 4);
        y += 8;

        const chartH = 40;
        const chartW = contentWidth;
        const maxVal = Math.max(...serie.map(d => d.total), 1);
        const barW = Math.min((chartW - serie.length) / serie.length, 14);
        const gap = serie.length > 1 ? (chartW - barW * serie.length) / (serie.length - 1) : 0;

        // Y axis labels
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...COLORS.slate);

        // Grid lines
        for (let i = 0; i <= 4; i++) {
            const ly = y + chartH - (chartH * i / 4);
            doc.setDrawColor(230, 230, 230);
            doc.setLineWidth(0.2);
            doc.line(margin, ly, margin + chartW, ly);

            const val = (maxVal * i / 4);
            doc.text(fmt(val), margin - 1, ly + 1, { align: 'right' });
        }

        // Bars
        const displaySerie = serie.slice(-20); // Limit to 20 bars max
        const actualBarW = Math.min((chartW - displaySerie.length) / displaySerie.length, 14);
        const actualGap = displaySerie.length > 1 ? (chartW - actualBarW * displaySerie.length) / (displaySerie.length - 1) : 0;

        displaySerie.forEach((d, i) => {
            const bh = (d.total / maxVal) * chartH;
            const bx = margin + i * (actualBarW + actualGap);
            const by = y + chartH - bh;

            // Bar gradient effect
            doc.setFillColor(79, 70, 229); // indigo-600
            doc.roundedRect(bx, by, actualBarW, bh, 1, 1, 'F');

            // Day label
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5);
            doc.setTextColor(...COLORS.slate);
            const label = new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            doc.text(label, bx + actualBarW / 2, y + chartH + 4, { align: 'center' });
        });

        y += chartH + 10;
    }

    // ==================== DONUT CHART ====================
    function drawDonutChart() {
        const pags = dados.pagamentos;
        const items = [
            { label: 'Dinheiro', value: pags.dinheiro, color: COLORS.success },
            { label: 'Pix', value: pags.pix, color: COLORS.cyan },
            { label: 'Débito', value: pags.debito, color: COLORS.primary },
            { label: 'Crédito', value: pags.credito, color: COLORS.purple },
            { label: 'Fiado', value: pags.fiado, color: COLORS.warning },
        ].filter(it => it.value > 0);

        if (items.length === 0) return;

        const total = items.reduce((a, it) => a + it.value, 0);
        const cx = margin + 25;
        const cy = y + 25;
        const outerR = 22;
        const innerR = 13;

        // Draw pie slices as triangle fans
        let startAngle = -Math.PI / 2;
        items.forEach(it => {
            const pct = it.value / total;
            const endAngle = startAngle + pct * 2 * Math.PI;

            // Draw pie slice as triangle fan
            doc.setFillColor(...it.color);
            const segments = Math.max(Math.ceil(pct * 80), 6);
            for (let s = 0; s < segments; s++) {
                const a1 = startAngle + (endAngle - startAngle) * (s / segments);
                const a2 = startAngle + (endAngle - startAngle) * ((s + 1) / segments);

                doc.triangle(
                    cx, cy,
                    cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR,
                    cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR,
                    'F'
                );
            }

            startAngle = endAngle;
        });

        // Inner circle (donut hole)
        doc.setFillColor(...COLORS.white);
        doc.circle(cx, cy, innerR, 'F');

        // Center label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.black);
        doc.text(fmt(total), cx, cy + 1, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(...COLORS.slate);
        doc.text('Total', cx, cy - 3, { align: 'center' });

        // Legend on the right
        const legendX = margin + 58;
        let legendY = y + 6;
        items.forEach(it => {
            const pct = total > 0 ? ((it.value / total) * 100).toFixed(1) : '0';
            doc.setFillColor(...it.color);
            doc.rect(legendX, legendY - 2, 3, 3, 'F');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.slateDark);
            doc.text(`${it.label}`, legendX + 5, legendY);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...COLORS.black);
            doc.text(`${fmt(it.value)} (${pct}%)`, legendX + 28, legendY);

            legendY += 6;
        });

        y += 54;
    }

    // ==================== TABLES ====================
    function checkPageBreak(needed) {
        if (y + needed > pageHeight - 20) {
            doc.addPage();
            y = margin;
            return true;
        }
        return false;
    }

    function drawTopProdutos() {
        const prods = dados.topProdutos || [];
        if (prods.length === 0) return;

        checkPageBreak(30 + prods.length * 7);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.slateDark);
        doc.text('Top Produtos', margin, y + 4);
        y += 6;

        let prodFinalY = y;
        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['#', 'Produto', 'Quantidade', 'Receita']],
            body: prods.map((p, i) => [
                i + 1,
                p.nome,
                p.quantidade,
                fmt(p.receita)
            ]),
            headStyles: {
                fillColor: COLORS.primaryDark,
                textColor: COLORS.white,
                fontStyle: 'bold',
                fontSize: 8,
            },
            bodyStyles: {
                fontSize: 7,
                textColor: COLORS.black,
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252],
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                2: { halign: 'center' },
                3: { halign: 'right' },
            },
            theme: 'grid',
            styles: {
                lineColor: [226, 232, 240],
                lineWidth: 0.3,
                cellPadding: 2,
            },
            didDrawCell: (data) => {
                if (data.cursor) prodFinalY = Math.max(prodFinalY, data.cursor.y + data.row.height);
            },
        });

        y = prodFinalY + 8;
    }

    function drawSerieDiaria() {
        const serie = dados.serieDiaria || [];
        if (serie.length === 0) return;

        checkPageBreak(30 + serie.length * 7);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.slateDark);
        doc.text('Série Diária', margin, y + 4);
        y += 6;

        let serieFinalY = y;
        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['Dia', 'Qtd. Vendas', 'Total']],
            body: serie.map(d => [
                new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR'),
                d.qtd,
                fmt(d.total)
            ]),
            headStyles: {
                fillColor: COLORS.primaryDark,
                textColor: COLORS.white,
                fontStyle: 'bold',
                fontSize: 8,
            },
            bodyStyles: {
                fontSize: 7,
                textColor: COLORS.black,
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252],
            },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' },
            },
            theme: 'grid',
            styles: {
                lineColor: [226, 232, 240],
                lineWidth: 0.3,
                cellPadding: 2,
            },
            didDrawCell: (data) => {
                if (data.cursor) serieFinalY = Math.max(serieFinalY, data.cursor.y + data.row.height);
            },
        });

        y = serieFinalY + 8;
    }

    function drawBalanco() {
        const bal = dados.balanco;
        if (!bal) return;

        checkPageBreak(50);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.slateDark);
        doc.text('Balanço do Período', margin, y + 4);
        y += 8;

        const rows = [
            ['Total Bruto de Vendas', fmt(dados.kpis.totalGeral), COLORS.primary],
            ['Descontos Aplicados', `-${fmt(bal.descontos)}`, COLORS.warning],
            ['Sangrias', `-${fmt(bal.sangria)}`, COLORS.danger],
            ['Suprimentos', `+${fmt(bal.suprimento)}`, COLORS.success],
        ];

        const rowH = 9;
        const labelW = contentWidth * 0.6;
        const valueW = contentWidth * 0.4;

        rows.forEach((row, i) => {
            const ry = y + i * rowH;
            // Background
            doc.setFillColor(i % 2 === 0 ? 248 : 241, i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 252 : 249);
            doc.rect(margin, ry, contentWidth, rowH, 'F');

            // Left accent
            doc.setFillColor(...row[2]);
            doc.rect(margin, ry, 1.5, rowH, 'F');

            // Label
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.slateDark);
            doc.text(row[0], margin + 5, ry + 6);

            // Value
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(row[1], margin + contentWidth - 4, ry + 6, { align: 'right' });
        });

        y += rows.length * rowH + 4;

        // Divider
        doc.setDrawColor(...COLORS.primary);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin + contentWidth, y);
        y += 5;

        // Net total
        const receitaLiquida = (dados.kpis.totalGeral || 0) - (bal.descontos || 0);

        doc.setFillColor(...COLORS.primaryDark);
        doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.white);
        doc.text('Receita Líquida (Vendas - Descontos)', margin + 5, y + 8);
        doc.setFontSize(12);
        doc.text(fmt(receitaLiquida), margin + contentWidth - 5, y + 8, { align: 'right' });

        y += 18;
    }

    // ==================== FOOTER ====================
    function drawFooter() {
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLORS.slate);
            doc.text(
                `Zelo PDV - Relatorio gerado automaticamente | Pagina ${i} de ${totalPages}`,
                pageWidth / 2,
                pageHeight - 6,
                { align: 'center' }
            );
            // Bottom accent line
            doc.setFillColor(...COLORS.primary);
            doc.rect(0, pageHeight - 3, pageWidth, 1, 'F');
        }
    }

    // ==================== RENDER ====================
    drawHeader();
    drawKPIs();
    drawPaymentBreakdown();
    drawBarChart();

    checkPageBreak(60);
    drawDonutChart();

    drawTopProdutos();
    drawSerieDiaria();
    drawBalanco();
    drawFooter();

    // Open PDF in new browser tab (user can download from there if needed)
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    window.open(blobUrl, '_blank');
}
