import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const ALLOWED_FEATURES = new Set([
  'pdv', 'gerente', 'relatorios', 'zelinho', 'produtos', 'estoque',
  'clientes', 'caixa', 'despesas', 'mesas', 'pedidos', 'acessos', 'ferramentas',
]);

function localDateInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function POST({ request }) {
  if (!supabaseAdmin) return json({ error: 'Serviço indisponível.' }, { status: 503 });

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return json({ error: 'Não autorizado.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const feature = typeof body.feature === 'string' ? body.feature : '';
  if (!ALLOWED_FEATURES.has(feature)) return json({ error: 'Módulo inválido.' }, { status: 400 });

  const { data: access } = await supabaseAdmin
    .from('access_users')
    .select('owner_user_id')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  const ownerUserId = access?.owner_user_id || user.id;
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('product_usage_events')
    .upsert({
      user_id: ownerUserId,
      usage_date: localDateInSaoPaulo(),
      feature,
      last_used_at: now,
    }, { onConflict: 'user_id,usage_date,feature' });

  if (error) {
    console.warn('[product-usage] event ignored:', error.message);
    return json({ error: 'Não foi possível registrar o uso.' }, { status: 500 });
  }

  return json({ ok: true });
}
