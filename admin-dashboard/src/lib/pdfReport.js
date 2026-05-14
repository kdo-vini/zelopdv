// Gerador de relatórios PDF via janela de impressão do browser.
// Não usa libs externas — o usuário escolhe "Salvar como PDF" no diálogo nativo.
//
// API:
//   generatePdfReport({ title, subtitle, kpis, sections, generatedBy })
//
// kpis:    [{ label, value, hint? }]
// sections:[{
//   type: 'table' | 'chart' | 'text' | 'funnel',
//   title, description?,
//   // type=table:
//   columns: [{ key, label, align?, format?(v,row) }], rows, footer?: [{label,value}],
//   // type=chart:
//   image: string (data URL PNG),
//   // type=text:
//   body: string (HTML safe),
//   // type=funnel:
//   steps: [{label, value, pct}]
// }]

const BRAND_LOGO = 'https://zelopdv.com.br/logo-horizontal.png'

function esc(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDateTime(d = new Date()) {
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatBRL(n) {
  const v = Number(n) || 0
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatNumber(n) {
  return (Number(n) || 0).toLocaleString('pt-BR')
}

function renderKpis(kpis = []) {
  if (!kpis.length) return ''
  return `
    <section class="kpi-grid">
      ${kpis.map(k => `
        <div class="kpi">
          <div class="kpi-label">${esc(k.label)}</div>
          <div class="kpi-value">${esc(k.value)}</div>
          ${k.hint ? `<div class="kpi-hint">${esc(k.hint)}</div>` : ''}
        </div>
      `).join('')}
    </section>
  `
}

function renderTable(section) {
  const cols = section.columns || []
  const rows = section.rows || []
  const footer = section.footer || []
  return `
    <section class="block">
      <header class="block-header">
        <h2>${esc(section.title)}</h2>
        ${section.description ? `<p class="block-desc">${esc(section.description)}</p>` : ''}
        <div class="block-meta">${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}</div>
      </header>
      <table class="report-table">
        <thead>
          <tr>
            ${cols.map(c => `<th class="align-${c.align || 'left'}">${esc(c.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${cols.map(c => {
                const raw = row[c.key]
                const val = c.format ? c.format(raw, row) : (raw ?? '—')
                return `<td class="align-${c.align || 'left'}">${esc(val)}</td>`
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
        ${footer.length ? `
          <tfoot>
            ${footer.map(f => `
              <tr>
                <td colspan="${cols.length - 1}" class="footer-label">${esc(f.label)}</td>
                <td class="align-right footer-value">${esc(f.value)}</td>
              </tr>
            `).join('')}
          </tfoot>
        ` : ''}
      </table>
    </section>
  `
}

function renderChart(section) {
  return `
    <section class="block block-chart">
      <header class="block-header">
        <h2>${esc(section.title)}</h2>
        ${section.description ? `<p class="block-desc">${esc(section.description)}</p>` : ''}
      </header>
      <div class="chart-wrap">
        <img src="${section.image}" alt="${esc(section.title)}" />
      </div>
    </section>
  `
}

function renderFunnel(section) {
  const steps = section.steps || []
  return `
    <section class="block">
      <header class="block-header">
        <h2>${esc(section.title)}</h2>
        ${section.description ? `<p class="block-desc">${esc(section.description)}</p>` : ''}
      </header>
      <div class="funnel">
        ${steps.map(s => `
          <div class="funnel-row">
            <div class="funnel-label">${esc(s.label)}</div>
            <div class="funnel-bar"><div class="funnel-bar-fill" style="width:${s.pct}%"></div></div>
            <div class="funnel-val"><strong>${esc(formatNumber(s.value))}</strong> <span>(${s.pct}%)</span></div>
          </div>
        `).join('')}
      </div>
    </section>
  `
}

function renderText(section) {
  return `
    <section class="block">
      <header class="block-header">
        <h2>${esc(section.title)}</h2>
      </header>
      <div class="text-body">${section.body || ''}</div>
    </section>
  `
}

function renderSection(s) {
  switch (s.type) {
    case 'table':  return renderTable(s)
    case 'chart':  return renderChart(s)
    case 'funnel': return renderFunnel(s)
    case 'text':   return renderText(s)
    default:       return ''
  }
}

function buildHtml({ title, subtitle, kpis, sections, generatedBy }) {
  const now = fmtDateTime()
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(title)} - Zelo PDV</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #0f172a;
    background: #fff;
    font-size: 11pt;
    line-height: 1.45;
  }
  .page { max-width: 210mm; margin: 0 auto; padding: 8mm 6mm; }
  .cover {
    border-bottom: 3px solid #0ea5e9;
    padding-bottom: 14px;
    margin-bottom: 22px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .cover-left h1 {
    font-size: 24pt;
    margin: 0 0 4px 0;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .cover-left p {
    margin: 0;
    color: #475569;
    font-size: 10.5pt;
  }
  .cover-right { text-align: right; font-size: 9pt; color: #64748b; }
  .cover-right img { height: 28px; margin-bottom: 6px; }
  .cover-right .meta-line { display: block; margin-top: 2px; }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 22px;
    page-break-inside: avoid;
  }
  .kpi {
    border: 1px solid #e2e8f0;
    border-left: 3px solid #0ea5e9;
    border-radius: 6px;
    padding: 10px 12px;
    background: #f8fafc;
  }
  .kpi-label {
    font-size: 8.5pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .kpi-value {
    font-size: 16pt;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.1;
  }
  .kpi-hint {
    font-size: 8.5pt;
    color: #94a3b8;
    margin-top: 3px;
  }

  .block {
    margin-bottom: 22px;
    page-break-inside: avoid;
  }
  .block-header { margin-bottom: 8px; }
  .block-header h2 {
    font-size: 12pt;
    margin: 0 0 2px 0;
    color: #0f172a;
    border-left: 3px solid #6366f1;
    padding-left: 8px;
    font-weight: 700;
  }
  .block-desc {
    margin: 2px 0 0 11px;
    font-size: 9.5pt;
    color: #64748b;
  }
  .block-meta {
    font-size: 8.5pt;
    color: #94a3b8;
    margin: 4px 0 0 11px;
  }

  table.report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  table.report-table thead th {
    background: #f1f5f9;
    color: #475569;
    text-align: left;
    padding: 7px 9px;
    font-weight: 600;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1.5px solid #cbd5e1;
  }
  table.report-table tbody td {
    padding: 6px 9px;
    border-bottom: 1px solid #e2e8f0;
    color: #1e293b;
  }
  table.report-table tbody tr:nth-child(even) td { background: #fafafa; }
  table.report-table tfoot td {
    padding: 8px 9px;
    font-weight: 700;
    background: #f8fafc;
    border-top: 1.5px solid #cbd5e1;
    color: #0f172a;
  }
  .align-left { text-align: left; }
  .align-right { text-align: right; }
  .align-center { text-align: center; }
  .footer-label { text-align: right; color: #475569; }
  .footer-value { color: #0ea5e9; }

  .block-chart .chart-wrap {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px;
    background: #fff;
    text-align: center;
  }
  .block-chart img {
    max-width: 100%;
    height: auto;
  }

  .funnel { display: flex; flex-direction: column; gap: 8px; }
  .funnel-row { display: grid; grid-template-columns: 160px 1fr 110px; align-items: center; gap: 10px; }
  .funnel-label { font-size: 9.5pt; color: #475569; }
  .funnel-bar { height: 14px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
  .funnel-bar-fill { height: 100%; background: linear-gradient(90deg, #0ea5e9, #6366f1); }
  .funnel-val { font-size: 9.5pt; text-align: right; }
  .funnel-val strong { color: #0f172a; }
  .funnel-val span { color: #94a3b8; }

  .text-body { font-size: 10pt; color: #1e293b; }

  .footer-page {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  .print-bar {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: #0f172a;
    color: #fff;
    padding: 10px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,.2);
  }
  .print-bar button {
    background: #0ea5e9; color: #fff; border: 0; padding: 8px 16px;
    border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 10pt;
  }
  .print-bar button.secondary { background: transparent; border: 1px solid #475569; margin-right: 8px; }
  body.with-bar { padding-top: 52px; }
</style>
</head>
<body class="with-bar">
  <div class="print-bar no-print">
    <span>📄 Relatório pronto — use "Salvar como PDF" no diálogo de impressão</span>
    <div>
      <button class="secondary" onclick="window.close()">Fechar</button>
      <button onclick="window.print()">Imprimir / Salvar PDF</button>
    </div>
  </div>

  <div class="page">
    <header class="cover">
      <div class="cover-left">
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      <div class="cover-right">
        <img src="${BRAND_LOGO}" alt="Zelo PDV" />
        <span class="meta-line"><strong>Gerado em:</strong> ${esc(now)}</span>
        ${generatedBy ? `<span class="meta-line"><strong>Por:</strong> ${esc(generatedBy)}</span>` : ''}
        <span class="meta-line">Confidencial — uso interno</span>
      </div>
    </header>

    ${renderKpis(kpis)}

    ${(sections || []).map(renderSection).join('')}

    <footer class="footer-page">
      <span>Zelo PDV · Painel Administrativo</span>
      <span>${esc(now)}</span>
    </footer>
  </div>

  <script>
    // Auto-abrir o diálogo de impressão após o load (com pequeno delay pra imagens carregarem).
    window.addEventListener('load', () => {
      setTimeout(() => { try { window.focus() } catch (_) {} }, 100)
    })
  </script>
</body>
</html>`
}

export function generatePdfReport(opts) {
  const html = buildHtml(opts)
  const w = window.open('', '_blank', 'width=1024,height=768')
  if (!w) {
    alert('Permita pop-ups para gerar o relatório PDF.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}

// Util pra capturar canvas Chart.js em PNG dataURL com fundo branco
// (Chart.js renderiza com fundo transparente — sem isso o PDF fica feio).
export function canvasToImage(canvas) {
  if (!canvas) return null
  try {
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, 0, 0)
    return out.toDataURL('image/png')
  } catch (err) {
    console.error('canvasToImage error', err)
    return null
  }
}
