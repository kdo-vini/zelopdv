import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { requireOwner } from '$lib/server/gerente/ownerAuth';
import { startPairing } from '$lib/server/gerente/phoneLinks';

export async function POST({ request }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const { code, expiresAt } = await startPairing(supabaseAdmin, { ownerUserId: auth.ownerUserId });
  return json({ code, expires_at: expiresAt, whatsapp_number: env.GERENTE_WHATSAPP_NUMBER || null });
}
