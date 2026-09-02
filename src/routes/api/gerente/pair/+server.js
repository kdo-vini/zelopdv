import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { requireOwner } from '$lib/server/gerente/ownerAuth';
import { getLink, maskPhone, unlinkPhone } from '$lib/server/gerente/phoneLinks';

export async function GET({ request }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const link = await getLink(supabaseAdmin, auth.ownerUserId);
  return json({
    linked: !!link,
    phone_masked: link ? maskPhone(link.phone_normalized) : null,
    verified_at: link?.verified_at || null,
    whatsapp_number: env.GERENTE_WHATSAPP_NUMBER || null,
  });
}

export async function DELETE({ request }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  await unlinkPhone(supabaseAdmin, auth.ownerUserId);
  return json({ ok: true });
}
