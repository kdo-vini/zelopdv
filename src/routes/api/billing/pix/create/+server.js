import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';
import { isAbacatePayConfigured } from '$lib/server/abacatePay';
import { getPostHogClient } from '$lib/server/posthog';
import { isValidPlanTier, isAddonAllowed, PLANS } from '$lib/pricing';
import {
  createOrReusePixCharge,
  serializePixCharge,
  validatePixCustomerProfile,
} from '$lib/server/billingPix';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) {
      return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    }
    if (!isAbacatePayConfigured()) {
      return json({ error: 'AbacatePay não configurado.' }, { status: 500 });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const accessContext = await getServerAccessContext(user.id);
    if (accessContext.isSubUser) {
      return json({ error: 'Subusuários não podem gerenciar billing.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const planTier = body.planTier || 'pdv';
    const requestedAddons = body.addons || {};

    if (!isValidPlanTier(planTier)) {
      return json({ error: `Plano inválido. Use: ${Object.keys(PLANS).join(', ')}.` }, { status: 400 });
    }

    for (const addonId of ['mesas', 'acessos', 'menu']) {
      if (requestedAddons[addonId] && !isAddonAllowed(planTier, addonId)) {
        return json({ error: `Plano ${planTier} não suporta o add-on ${addonId}.` }, { status: 400 });
      }
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', user.id)
      .maybeSingle();

    if (perfilError) {
      return json({ error: 'Erro ao carregar perfil da empresa.' }, { status: 500 });
    }

    const profileValidation = validatePixCustomerProfile(perfil);
    if (!profileValidation.ok) {
      return json({
        error: profileValidation.message,
        redirect: '/perfil?msg=complete',
      }, { status: 400 });
    }

    const { reused, row: paymentRow } = await createOrReusePixCharge({
      userId: user.id,
      email: user.email,
      planTier,
      addons: requestedAddons,
      name: profileValidation.name,
      taxId: profileValidation.taxId,
      phone: profileValidation.phone,
      source: 'zelo_saas_pix',
    });

    if (reused) {
      return json({
        reused: true,
        ...serializePixCharge(paymentRow),
      });
    }

    const posthog = getPostHogClient();
    if (posthog) {
      posthog.capture({
        distinctId: user.id,
        event: 'pix_charge_created',
        properties: {
          plan: planTier,
          addons: requestedAddons,
          amount_cents: paymentRow.amount_expected_cents,
          kind: paymentRow.kind || 'subscription_renewal',
          payment_id: paymentRow.id,
        },
      });
      await posthog.flush();
    }

    return json(serializePixCharge(paymentRow));
  } catch (error) {
    console.error('[billing/pix/create] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao gerar cobrança Pix.' }, { status: 500 });
  }
}
