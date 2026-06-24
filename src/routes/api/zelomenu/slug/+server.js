import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

function validarSlug(slug) {
  if (!slug) return 'Slug não pode ser vazio.';
  if (slug.length < 3) return 'Slug muito curto (mínimo 3 caracteres).';
  if (slug.length > 50) return 'Slug muito longo (máximo 50 caracteres).';
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug))
    return 'Use apenas letras minúsculas, números e hífens. Não pode começar ou terminar com hífen.';
  return null;
}

export async function GET({ request }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('empresa_perfil')
    .select('zelomenu_slug')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ slug: data?.zelomenu_slug ?? null });
}

export async function PUT({ request }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Não autorizado' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, { status: 400 }); }

  const slug = (body.slug || '').trim().toLowerCase().replace(/\s+/g, '-');
  const erroValidacao = validarSlug(slug);
  if (erroValidacao) return json({ error: erroValidacao }, { status: 400 });

  const { data: existente } = await supabaseAdmin
    .from('empresa_perfil')
    .select('user_id')
    .eq('zelomenu_slug', slug)
    .neq('user_id', user.id)
    .maybeSingle();

  if (existente) return json({ error: 'Este link já está em uso. Escolha outro.' }, { status: 409 });

  const { error } = await supabaseAdmin
    .from('empresa_perfil')
    .update({ zelomenu_slug: slug })
    .eq('user_id', user.id);

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ slug });
}
