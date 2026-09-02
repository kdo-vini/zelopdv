const GENERIC = /^(lanchonete|restaurante|bar|padaria|pizzaria|mercado|loja)$/i;
const WEEKDAYS = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

function money(value) {
  const n = Number(value || 0);
  const opts = Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return 'R$ ' + new Intl.NumberFormat('pt-BR', opts).format(n);
}

function displayName(nomeExibicao) {
  const full = String(nomeExibicao || '').trim();
  if (!full) return '';
  const first = full.split(/\s+/)[0];
  return first.length <= 14 && !GENERIC.test(first) ? first : full;
}

export function buildGreeting({ nomeExibicao = '', dayStrip = null, signals = [], hour = new Date().getHours() } = {}) {
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const name = displayName(nomeExibicao);
  const title = name ? `${period}, ${name}.` : `${period}.`;
  if (!dayStrip) return { title, lead: 'Ainda estou reunindo seu histórico. Continue registrando as vendas e o resumo aparece aqui.' };
  let lead = `Ontem rendeu ${money(dayStrip.receita)} em ${dayStrip.vendas} vendas`;
  const delta = dayStrip.receitaDeltaPct;
  if (delta != null && Math.abs(delta) >= 0.08) {
    const weekday = WEEKDAYS[new Date(`${dayStrip.date}T12:00:00Z`).getUTCDay()];
    lead += `, ${delta < 0 ? 'abaixo' : 'acima'} do ritmo das suas ${weekday}`;
  } else if (delta != null) {
    lead += ', no ritmo de sempre';
  }
  lead += '.';
  const attention = (signals || []).filter((s) => s?.severity === 'critical' || s?.severity === 'attention').length;
  lead += attention === 0 ? ' Nada pede sua atenção hoje.' : attention === 1 ? ' Um ponto pede sua atenção.' : ` ${attention} pontos pedem sua atenção.`;
  return { title, lead };
}
