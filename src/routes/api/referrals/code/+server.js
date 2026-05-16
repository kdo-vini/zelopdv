import { json } from '@sveltejs/kit';
import {
  ensureReferralCodeForEmpresa,
  getUserFromBearerToken,
  resolveOwnerUserId,
} from '$lib/server/referrals';

export async function GET({ request, url }) {
  try {
    const user = await getUserFromBearerToken(request);
    if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

    const ownerUserId = await resolveOwnerUserId(user.id);
    const code = await ensureReferralCodeForEmpresa(ownerUserId);
    const origin = url.origin;

    return json({
      code,
      link: `${origin}/indica/${encodeURIComponent(code)}`,
      ownerUserId,
    });
  } catch (err) {
    console.error('[referrals/code] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao obter código de indicação.' }, { status: 500 });
  }
}
