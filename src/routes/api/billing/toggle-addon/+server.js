import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { updateSubscriptionValue, isConfigured } from '$lib/server/asaas';

const BASE_VALUE = 59.00;
const ADDON_VALUES = {
  mesas: 30.00,
};

const SUPPORTED_ADDONS = Object.keys(ADDON_VALUES);

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    if (!isConfigured()) return json({ error: 'Asaas não configurado.' }, { status: 500 });

    // Auth
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });
    const userId = user.id;

    const body = await request.json().catch(() => ({}));
    const addon = body.addon;
    const enabled = !!body.enabled;

    if (!SUPPORTED_ADDONS.includes(addon)) {
      return json({ error: `Add-on inválido. Suportados: ${SUPPORTED_ADDONS.join(', ')}.` }, { status: 400 });
    }

    // Read current subscription
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, provider_subscription_id, has_mesas_addon, status, current_period_end')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr || !sub) {
      return json({ error: 'Assinatura não encontrada. Assine antes de ativar add-ons.' }, { status: 404 });
    }

    if (!sub.provider_subscription_id) {
      return json({ error: 'Assinatura sem ID de provedor. Recrie a assinatura.' }, { status: 400 });
    }

    // No-op if state already matches
    const currentMesas = !!sub.has_mesas_addon;
    if (addon === 'mesas' && currentMesas === enabled) {
      return json({ success: true, value: BASE_VALUE + (enabled ? ADDON_VALUES.mesas : 0), unchanged: true });
    }

    // Compute new value with the toggle applied
    const nextMesas = addon === 'mesas' ? enabled : currentMesas;
    const newValue = BASE_VALUE + (nextMesas ? ADDON_VALUES.mesas : 0);

    // Update Asaas first (no nextDueDate — preserve current cycle / trial end)
    try {
      await updateSubscriptionValue(sub.provider_subscription_id, newValue);
    } catch (e) {
      console.error('[toggle-addon] Asaas update failed:', e?.message);
      return json({ error: 'Falha ao atualizar valor no provedor de pagamento.' }, { status: 502 });
    }

    // Update DB flag
    const dbResult = await supabaseAdmin
      .from('subscriptions')
      .update({
        has_mesas_addon: nextMesas,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    if (dbResult.error) {
      // Best-effort rollback in Asaas to old value
      const oldValue = BASE_VALUE + (currentMesas ? ADDON_VALUES.mesas : 0);
      try { await updateSubscriptionValue(sub.provider_subscription_id, oldValue); } catch {}
      console.error('[toggle-addon] DB update failed, rolled back Asaas value:', dbResult.error);
      return json({ error: 'Erro ao salvar add-on. Tente novamente.' }, { status: 500 });
    }

    return json({
      success: true,
      addon,
      enabled,
      value: newValue,
      message: enabled
        ? `Add-on ${addon} ativado. Próxima cobrança: R$ ${newValue.toFixed(2)}.`
        : `Add-on ${addon} desativado. Próxima cobrança: R$ ${newValue.toFixed(2)}.`,
    });
  } catch (err) {
    console.error('[toggle-addon] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao alternar add-on' }, { status: 500 });
  }
}
