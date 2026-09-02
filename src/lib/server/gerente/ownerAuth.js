import { json } from '@sveltejs/kit';
// Usar o alias $lib (e não caminho relativo) para que os vi.doMock('$lib/server/...') dos testes
// de rota também cubram este helper.
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';

export const OWNER_ONLY_MESSAGE = 'Por enquanto, só o dono da empresa conversa com o Zelinho Gerente.';

/** Autentica o JWT e exige que o ator seja o dono da empresa. */
export async function requireOwner(request) {
  if (!supabaseAdmin) return { ok: false, response: json({ error: 'Configuração do servidor ausente.' }, { status: 500 }) };
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { ok: false, response: json({ error: 'Não autorizado.' }, { status: 401 }) };
  const { data: { user } = {}, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { ok: false, response: json({ error: 'Não autorizado.' }, { status: 401 }) };
  const access = await getServerAccessContext(user.id);
  if (access.isSubUser) return { ok: false, response: json({ error: OWNER_ONLY_MESSAGE }, { status: 403 }) };
  return { ok: true, user, ownerUserId: access.ownerUserId };
}
