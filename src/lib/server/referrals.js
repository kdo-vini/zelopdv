import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { makeReferralCodeBase, normalizeReferralCode } from '$lib/referrals';

const STATUS_RANK = {
  clicked: 1,
  signed_up: 2,
  trial_started: 3,
  pending_payment: 4,
  paid_manual_confirmed: 5,
  reward_approved: 6,
  reward_applied: 7,
  rejected: 99,
};

const DEFAULT_REWARD_AMOUNT_CENTS = 3000;
const MONTHLY_APPROVED_REWARD_LIMIT = 5;

function assertAdminClient() {
  if (!supabaseAdmin) throw new Error('Supabase admin não configurado.');
}

function normalizeEmail(email) {
  return (email || '').toString().trim().toLowerCase();
}

function normalizeDigits(value) {
  return (value || '').toString().replace(/\D/g, '');
}

function nextStatus(current, wanted) {
  if (!current) return wanted;
  if (current === 'rejected') return current;
  return STATUS_RANK[wanted] > STATUS_RANK[current] ? wanted : current;
}

export async function resolveOwnerUserId(userId) {
  assertAdminClient();
  const { data } = await supabaseAdmin
    .from('access_users')
    .select('owner_user_id')
    .eq('auth_user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return data?.owner_user_id || userId;
}

export async function getUserFromBearerToken(request) {
  assertAdminClient();
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function isSuperAdminUser(userId) {
  assertAdminClient();
  const { data } = await supabaseAdmin
    .from('super_admins')
    .select('id, user_id, email, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  return data || null;
}

export async function ensureReferralCodeForEmpresa(userId, preferredName = '') {
  assertAdminClient();
  if (!userId) throw new Error('userId obrigatório.');

  const { data: perfil, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('user_id, nome_exibicao, referral_code')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!perfil) throw new Error('Perfil da empresa não encontrado.');
  if (perfil.referral_code) return perfil.referral_code;

  const base = makeReferralCodeBase(preferredName || perfil.nome_exibicao || `ZELO${userId.slice(0, 6)}`);

  for (let i = 0; i < 100; i += 1) {
    const suffix = i === 0 ? '' : String(i + 1);
    const candidate = `${base}${suffix}`.slice(0, 24);
    const { data: existing } = await supabaseAdmin
      .from('empresa_perfil')
      .select('user_id')
      .eq('referral_code', candidate)
      .maybeSingle();

    if (existing && existing.user_id !== userId) continue;

    const { error: updateError } = await supabaseAdmin
      .from('empresa_perfil')
      .update({ referral_code: candidate, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (!updateError) return candidate;
    if (!String(updateError.message || '').toLowerCase().includes('duplicate')) throw updateError;
  }

  throw new Error('Não foi possível gerar um código único de indicação.');
}

export async function getReferrerByCode(code) {
  assertAdminClient();
  const referralCode = normalizeReferralCode(code);
  if (!referralCode) return null;

  const { data, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('user_id, nome_exibicao, contato, documento, referral_code')
    .eq('referral_code', referralCode)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function recordReferralClick({ code, source = 'referral_link', existingReferralId = null } = {}) {
  assertAdminClient();
  const referrer = await getReferrerByCode(code);
  if (!referrer) return { referrer: null, referral: null };

  const nowIso = new Date().toISOString();
  if (existingReferralId) {
    const { data: existing } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('id', existingReferralId)
      .eq('referral_code', referrer.referral_code)
      .maybeSingle();
    if (existing) return { referrer, referral: existing };
  }

  const { data: referral, error } = await supabaseAdmin
    .from('referrals')
    .insert({
      referrer_empresa_id: referrer.user_id,
      referral_code: referrer.referral_code,
      status: 'clicked',
      source,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (error) throw error;
  return { referrer, referral };
}

async function rejectReferral(referralId, reason) {
  if (!referralId) return null;
  const { data } = await supabaseAdmin
    .from('referrals')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', referralId)
    .select('*')
    .maybeSingle();
  return data || null;
}

async function isAutoReferral({ referrer, referredUserId, referredEmail, referredProfile }) {
  if (!referrer || !referredUserId) return { blocked: false, reason: '' };
  if (referrer.user_id === referredUserId) {
    return { blocked: true, reason: 'same_empresa' };
  }

  const { data: referrerUser } = await supabaseAdmin.auth.admin.getUserById(referrer.user_id);
  const referrerEmail = normalizeEmail(referrerUser?.user?.email);
  if (referrerEmail && referrerEmail === normalizeEmail(referredEmail)) {
    return { blocked: true, reason: 'same_email' };
  }

  const referrerPhone = normalizeDigits(referrer.contato);
  const referredPhone = normalizeDigits(referredProfile?.contato);
  if (referrerPhone && referredPhone && referrerPhone === referredPhone) {
    return { blocked: true, reason: 'same_phone' };
  }

  const referrerDoc = normalizeDigits(referrer.documento);
  const referredDoc = normalizeDigits(referredProfile?.documento);
  if (referrerDoc && referredDoc && referrerDoc === referredDoc) {
    return { blocked: true, reason: 'same_documento' };
  }

  return { blocked: false, reason: '' };
}

async function findClaimableReferral({ referralId, referralCode, referredUserId, referredEmail }) {
  if (referralId) {
    const { data } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('id', referralId)
      .maybeSingle();
    if (data) return data;
  }

  if (referredUserId) {
    const { data } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('referred_empresa_id', referredUserId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (referralCode && referredEmail) {
    const { data } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('referral_code', referralCode)
      .ilike('referred_email', referredEmail)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

export async function claimReferralForUser({
  referralCode,
  referralId,
  referredUserId,
  referredEmail,
  source = 'signup',
  wantedStatus = 'signed_up',
} = {}) {
  assertAdminClient();
  const cleanCode = normalizeReferralCode(referralCode);
  if (!cleanCode && !referralId) return { claimed: false, reason: 'missing_referral' };

  let referral = await findClaimableReferral({
    referralId,
    referralCode: cleanCode,
    referredUserId,
    referredEmail: normalizeEmail(referredEmail),
  });

  const codeToUse = normalizeReferralCode(referral?.referral_code || cleanCode);
  const referrer = await getReferrerByCode(codeToUse);
  if (!referrer) return { claimed: false, reason: 'invalid_referral_code' };

  const { data: referredProfile } = await supabaseAdmin
    .from('empresa_perfil')
    .select('contato, documento')
    .eq('user_id', referredUserId)
    .maybeSingle();

  const auto = await isAutoReferral({
    referrer,
    referredUserId,
    referredEmail,
    referredProfile,
  });

  if (auto.blocked) {
    if (referral?.id) await rejectReferral(referral.id, auto.reason);
    return { claimed: false, reason: auto.reason };
  }

  const nowIso = new Date().toISOString();
  const payload = {
    referrer_empresa_id: referrer.user_id,
    referred_empresa_id: referredUserId || null,
    referred_email: normalizeEmail(referredEmail) || null,
    referred_phone: referredProfile?.contato || null,
    referred_documento: referredProfile?.documento || null,
    referral_code: referrer.referral_code,
    status: nextStatus(referral?.status, wantedStatus),
    source: referral?.source || source,
    updated_at: nowIso,
  };

  if (referral?.id) {
    const { data, error } = await supabaseAdmin
      .from('referrals')
      .update(payload)
      .eq('id', referral.id)
      .select('*')
      .single();
    if (error) throw error;
    return { claimed: true, referral: data };
  }

  const { data, error } = await supabaseAdmin
    .from('referrals')
    .insert({ ...payload, created_at: nowIso })
    .select('*')
    .single();

  if (error) throw error;
  return { claimed: true, referral: data };
}

export async function progressReferralForUser({ userId, email, wantedStatus, referralCode, referralId, source }) {
  assertAdminClient();
  const existing = await findClaimableReferral({
    referralId,
    referralCode: normalizeReferralCode(referralCode || ''),
    referredUserId: userId,
    referredEmail: normalizeEmail(email),
  });

  return claimReferralForUser({
    referralCode: referralCode || existing?.referral_code,
    referralId: referralId || existing?.id,
    referredUserId: userId,
    referredEmail: email,
    source,
    wantedStatus,
  });
}

export async function confirmReferralPaymentManually(
  referralId,
  adminUserId,
  notes = '',
  {
    rewardType = 'credit',
    amountCents = DEFAULT_REWARD_AMOUNT_CENTS,
    addonKey = null,
  } = {},
) {
  assertAdminClient();
  if (!referralId) throw new Error('referralId obrigatório.');
  if (!adminUserId) throw new Error('adminUserId obrigatório.');

  const admin = await isSuperAdminUser(adminUserId);
  if (!admin) throw new Error('Acesso restrito a super admins.');

  const { data: referral, error: referralError } = await supabaseAdmin
    .from('referrals')
    .select('*')
    .eq('id', referralId)
    .maybeSingle();

  if (referralError) throw referralError;
  if (!referral) throw new Error('Indicação não encontrada.');
  if (referral.status === 'rejected') throw new Error('Indicação rejeitada não pode ser aprovada.');
  if (!referral.referred_empresa_id) throw new Error('Indicação ainda não foi vinculada a uma empresa indicada.');
  if (referral.referrer_empresa_id === referral.referred_empresa_id) {
    await rejectReferral(referral.id, 'same_empresa');
    throw new Error('Autoindicação bloqueada.');
  }

  const { data: existingReward } = await supabaseAdmin
    .from('referral_rewards')
    .select('id, status')
    .eq('referral_id', referral.id)
    .maybeSingle();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  if (!existingReward) {
    const { count, error: countError } = await supabaseAdmin
      .from('referral_rewards')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', referral.referrer_empresa_id)
      .in('status', ['approved', 'applied'])
      .gte('created_at', monthStart.toISOString());

    if (countError) throw countError;
    if ((count || 0) >= MONTHLY_APPROVED_REWARD_LIMIT) {
      throw new Error('Limite mensal de 5 recompensas aprovadas atingido para esta empresa.');
    }
  }

  const nowIso = new Date().toISOString();
  const { data: updatedReferral, error: updateReferralError } = await supabaseAdmin
    .from('referrals')
    .update({
      status: 'paid_manual_confirmed',
      paid_at: nowIso,
      confirmed_by: adminUserId,
      admin_notes: notes || null,
      updated_at: nowIso,
    })
    .eq('id', referral.id)
    .select('*')
    .single();

  if (updateReferralError) throw updateReferralError;

  const rewardPayload = {
    referral_id: referral.id,
    empresa_id: referral.referrer_empresa_id,
    reward_type: rewardType,
    amount_cents: rewardType === 'credit' ? amountCents : null,
    addon_key: rewardType === 'addon_days' ? addonKey : null,
    status: 'approved',
    reason: notes || 'Primeiro pagamento confirmado manualmente.',
    approved_at: nowIso,
    approved_by: adminUserId,
    updated_at: nowIso,
  };

  const { data: reward, error: rewardError } = await supabaseAdmin
    .from('referral_rewards')
    .upsert(rewardPayload, { onConflict: 'referral_id' })
    .select('*')
    .single();

  if (rewardError) throw rewardError;

  return { referral: updatedReferral, reward };
}

export async function markReferralRewardAppliedManually(rewardId, adminUserId, notes = '') {
  assertAdminClient();
  if (!rewardId) throw new Error('rewardId obrigatório.');
  const admin = await isSuperAdminUser(adminUserId);
  if (!admin) throw new Error('Acesso restrito a super admins.');

  const { data: reward, error: rewardError } = await supabaseAdmin
    .from('referral_rewards')
    .select('id, referral_id, status')
    .eq('id', rewardId)
    .maybeSingle();

  if (rewardError) throw rewardError;
  if (!reward) throw new Error('Recompensa não encontrada.');
  if (!['approved', 'applied'].includes(reward.status)) {
    throw new Error('Apenas recompensas aprovadas podem ser marcadas como aplicadas.');
  }

  const nowIso = new Date().toISOString();
  const { data: updatedReward, error: updateRewardError } = await supabaseAdmin
    .from('referral_rewards')
    .update({
      status: 'applied',
      reason: notes || null,
      applied_at: nowIso,
      applied_by: adminUserId,
      updated_at: nowIso,
    })
    .eq('id', reward.id)
    .select('*')
    .single();

  if (updateRewardError) throw updateRewardError;

  await supabaseAdmin
    .from('referrals')
    .update({ status: 'reward_applied', updated_at: nowIso })
    .eq('id', reward.referral_id);

  return updatedReward;
}
