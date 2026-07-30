import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function requireSuperAdmin(request, headers) {
  if (!supabaseAdmin) {
    return { errorResponse: json({ error: 'Supabase admin não configurado.' }, { status: 500, headers }) };
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { errorResponse: json({ error: 'Não autorizado.' }, { status: 401, headers }) };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { errorResponse: json({ error: 'Não autorizado.' }, { status: 401, headers }) };

  const { data: admin } = await supabaseAdmin
    .from('super_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!admin) return { errorResponse: json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers }) };
  return { admin };
}

function areaForSignal(type) {
  if (type?.includes('STOCK') || type?.includes('PRODUCT')) return 'Produtos e estoque';
  if (type?.includes('CASH') || type?.includes('CAIXA')) return 'Caixa';
  if (type?.includes('FIADO')) return 'Fiado';
  if (type?.includes('PAYMENT')) return 'Formas de pagamento';
  if (type?.includes('REVENUE') || type?.includes('TICKET')) return 'Vendas e resultados';
  return 'Operação';
}

export function OPTIONS({ request }) {
  const headers = corsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !headers['Access-Control-Allow-Origin']) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
}

export async function GET({ request }) {
  const headers = corsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !headers['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers });
  }

  try {
    const auth = await requireSuperAdmin(request, headers);
    if (auth.errorResponse) return auth.errorResponse;

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceDate = since.toISOString().slice(0, 10);

    const [snapshotsResult, signalsResult, moduleUsageResult] = await Promise.all([
      supabaseAdmin
        .from('business_daily_snapshots')
        .select('user_id, snapshot_date, qtd_vendas, receita_realizada, ticket_medio')
        .gte('snapshot_date', sinceDate)
        .order('snapshot_date', { ascending: false }),
      supabaseAdmin
        .from('business_signals')
        .select('user_id, signal_date, type, severity, narrative, evidence')
        .gte('signal_date', sinceDate)
        .order('signal_date', { ascending: false }),
      supabaseAdmin
        .from('product_usage_events')
        .select('user_id, feature, usage_date')
        .gte('usage_date', sinceDate),
    ]);

    if (snapshotsResult.error) throw snapshotsResult.error;
    if (signalsResult.error) throw signalsResult.error;

    const byUser = new Map();
    const getInsight = (userId) => {
      if (!byUser.has(userId)) {
        byUser.set(userId, {
          user_id: userId,
          sales_30d: 0,
          revenue_30d: 0,
          days_with_sales_30d: 0,
          last_sale_date: null,
          observed_areas: [],
          recent_signals: [],
        });
      }
      return byUser.get(userId);
    };

    for (const snapshot of snapshotsResult.data || []) {
      const insight = getInsight(snapshot.user_id);
      const sales = Number(snapshot.qtd_vendas || 0);
      insight.sales_30d += sales;
      insight.revenue_30d += Number(snapshot.receita_realizada || 0);
      if (sales > 0) {
        insight.days_with_sales_30d += 1;
        if (!insight.last_sale_date || snapshot.snapshot_date > insight.last_sale_date) {
          insight.last_sale_date = snapshot.snapshot_date;
        }
      }
    }

    for (const signal of signalsResult.data || []) {
      const insight = getInsight(signal.user_id);
      const area = areaForSignal(signal.type);
      if (!insight.observed_areas.includes(area)) insight.observed_areas.push(area);
      if (insight.recent_signals.length < 3) {
        insight.recent_signals.push({
          date: signal.signal_date,
          type: signal.type,
          severity: signal.severity,
          narrative: signal.narrative || null,
        });
      }
    }

    // A migration de telemetria pode chegar depois deste endpoint em ambientes
    // antigos. Nesse caso o restante do analytics continua disponível.
    if (moduleUsageResult.error) {
      console.warn('[admin/usage-insights] module usage unavailable:', moduleUsageResult.error.message);
    }
    for (const event of moduleUsageResult.data || []) {
      const insight = getInsight(event.user_id);
      const existing = insight.feature_usage?.[event.feature] || 0;
      insight.feature_usage = { ...(insight.feature_usage || {}), [event.feature]: existing + 1 };
    }

    return json({
      coverage: {
        window_days: 30,
        source: 'snapshots e sinais operacionais do Zelo Intelligence',
        note: 'O painel não rastreia cliques ou navegação. Áreas são inferidas apenas de operações registradas e sinais processados.',
      },
      insights: Array.from(byUser.values()).map((insight) => ({
        ...insight,
        feature_usage: insight.feature_usage || {},
      })),
    }, { headers });
  } catch (error) {
    console.error('[admin/usage-insights] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao buscar dados de uso.' }, { status: 500, headers });
  }
}
