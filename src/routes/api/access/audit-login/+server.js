import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { logSubUserLogin } from '$lib/server/accessControl';

async function getAuthUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

export async function POST({ request }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const result = await logSubUserLogin(user.id, {
    source: body?.source || 'unknown',
    provider: body?.provider || 'unknown',
  });

  return json({ success: true, ...result });
}
