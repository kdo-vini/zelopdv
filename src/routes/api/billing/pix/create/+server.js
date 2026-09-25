import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';
import { isAbacatePayConfigured } from '$lib/server/abacatePay';
import { getPostHogClient } from '$lib/server/posthog';
import { checkoutFailed, CHECKOUT_FAILURE_REASONS as WHY } from '$lib/server/checkoutFailure';
import { waitUntil } from '@vercel/functions';
import { isValidPlanTier, isAddonAllowed, PLANS } from '$lib/pricing';
import { isValidBrazilianTaxId, normalizeBrazilianTaxId } from '$lib/masks';
import {
  createOrReusePixCharge,
  serializePixCharge,
  validatePixCustomerProfile,
} from '$lib/server/billingPix';

export async function POST({ request }) {
  /** Erro de checkout Pix. Toda saída de falha passa por aqui — a resposta e o
   *  evento `checkout_failed` são a mesma coisa. */
  const fail = (params) => checkoutFailed({ paymentMethod: 'pix', ...params });

  // Preenchidos conforme a requisição avança; uma falha precoce registra sem eles.
  let userId;
  let planTier;
  let requestedAddons;

  try {
    if (!supabaseAdmin) {
      return fail({ reason: WHY.PROVIDER_UNAVAILABLE, error: 'Supabase admin não configurado.', status: 500 });
    }
    if (!isAbacatePayConfigured()) {
      return fail({ reason: WHY.PROVIDER_UNAVAILABLE, error: 'AbacatePay não configurado.', status: 500 });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return fail({ reason: WHY.UNAUTHENTICATED, error: 'Não autorizado', status: 401 });

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return fail({ reason: WHY.UNAUTHENTICATED, error: 'Não autorizado', status: 401 });

    userId = user.id;

    const accessContext = await getServerAccessContext(user.id);
    if (accessContext.isSubUser) {
      return fail({
        reason: WHY.SUBUSER_FORBIDDEN,
        error: 'Subusuários não podem gerenciar billing.',
        status: 403,
        userId: user.id,
      });
    }

    const body = await request.json().catch(() => ({}));
    planTier = body.planTier || 'pdv';
    requestedAddons = body.addons || {};
    // Fase 2.1 do onboarding em dois passos: CPF/CNPJ some do wizard e vira um
    // campo inline no Pix. `documento` é opcional aqui — só é usado quando o
    // perfil ainda não tem um documento válido salvo.
    const bodyDocumento = typeof body.documento === 'string' ? body.documento.trim() : '';

    if (!isValidPlanTier(planTier)) {
      return fail({
        reason: WHY.INVALID_PLAN,
        error: `Plano inválido. Use: ${Object.keys(PLANS).join(', ')}.`,
        userId: user.id,
        planTier,
        addons: requestedAddons,
      });
    }

    for (const addonId of ['mesas', 'acessos', 'menu']) {
      if (requestedAddons[addonId] && !isAddonAllowed(planTier, addonId)) {
        return fail({
          reason: WHY.ADDON_NOT_ALLOWED,
          error: `Plano ${planTier} não suporta a extensão ${addonId}.`,
          userId: user.id,
          planTier,
          addons: requestedAddons,
        });
      }
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', user.id)
      .maybeSingle();

    if (perfilError) {
      return fail({
        reason: WHY.PROFILE_READ_FAILED,
        error: 'Erro ao carregar perfil da empresa.',
        status: 500,
        userId: user.id,
        planTier,
        addons: requestedAddons,
      });
    }

    // Documento é o único campo de billing que ainda pode faltar depois do
    // wizard curto. Se o perfil já tem um válido, o body nunca sobrescreve —
    // documento salvo é definitivo, não fica trocando a cada Pix gerado.
    let effectivePerfil = perfil;
    const perfilDocumentoValido = !!perfil?.documento && isValidBrazilianTaxId(perfil.documento);

    if (perfil && !perfilDocumentoValido && bodyDocumento) {
      const normalizedBodyDoc = normalizeBrazilianTaxId(bodyDocumento);
      if (!normalizedBodyDoc || !isValidBrazilianTaxId(normalizedBodyDoc)) {
        return fail({
          reason: WHY.PROFILE_INCOMPLETE,
          error: 'CPF/CNPJ inválido.',
          userId: user.id,
          planTier,
          addons: requestedAddons,
          body: { field: 'documento' },
        });
      }

      // Persistir ANTES de cobrar, e só seguir se a gravação for confirmada:
      // se o update falhar, a AbacatePay nunca chega a ver esse taxId, então
      // nunca existe cobrança criada com um documento que não ficou salvo.
      // `.update` (não upsert) de propósito — se a linha de empresa_perfil não
      // existir, não é este endpoint que cria; cai no PROFILE_INCOMPLETE de
      // nome/telefone abaixo, que é gate do wizard.
      const { data: updatedPerfil, error: updateError } = await supabaseAdmin
        .from('empresa_perfil')
        .update({ documento: normalizedBodyDoc, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select('nome_exibicao, documento, contato')
        .maybeSingle();

      if (updateError || !updatedPerfil) {
        return fail({
          reason: WHY.PROFILE_READ_FAILED,
          error: 'Não deu para salvar o CPF/CNPJ no perfil. Tente novamente.',
          status: 500,
          userId: user.id,
          planTier,
          addons: requestedAddons,
        });
      }

      effectivePerfil = updatedPerfil;
    }

    const profileValidation = validatePixCustomerProfile(effectivePerfil);
    if (!profileValidation.ok) {
      // Nome/telefone faltando é o muro de cadastro de sempre — manda pro
      // /perfil. Documento sozinho faltando não: aquele muro tirava a pessoa
      // do checkout Pix por causa de um campo que agora tem um jeito de
      // preencher sem sair da tela (ver assinatura/+page.svelte).
      const nomeOk = !!(effectivePerfil?.nome_exibicao || '').trim();
      const contatoOk = !!(effectivePerfil?.contato || '').trim();
      const isDocumentoOnlyIssue = nomeOk && contatoOk;
      return fail({
        reason: WHY.PROFILE_INCOMPLETE,
        error: profileValidation.message,
        userId: user.id,
        planTier,
        addons: requestedAddons,
        body: isDocumentoOnlyIssue ? { field: 'documento' } : { redirect: '/perfil?msg=complete' },
      });
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

    const analytics = Promise.resolve().then(async () => {
      const posthog = getPostHogClient();
      if (!posthog) return;
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
    }).catch(() => console.warn('[billing/pix/create] Analytics indisponível; cobrança preservada.'));
    waitUntil(analytics);

    return json(serializePixCharge(paymentRow));
  } catch (error) {
    console.error('[billing/pix/create] error:', error?.message || error);
    const isPixConflict = !!error?.code?.startsWith('PIX_');
    return fail({
      reason: WHY.PROVIDER_ERROR,
      error: error?.message || 'Falha ao gerar cobrança Pix.',
      status: isPixConflict ? 409 : 500,
      userId,
      planTier,
      addons: requestedAddons,
      body: isPixConflict ? { code: error.code, paymentId: error.paymentId, retrySafe: false } : undefined,
    });
  }
}
