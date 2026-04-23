import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const ALLOWED_ORIGINS = new Set([
  'https://zelochat.vercel.app',
  'https://chat.zelopdv.com.br',
  // local dev
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function buildCorsHeaders(request) {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;

  // When there's no Origin header (e.g. server-to-server), we avoid sending CORS headers.
  if (!allowOrigin) return {};

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function parseBoolean(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
  return defaultValue;
}

export function OPTIONS({ request }) {
  const cors = buildCorsHeaders(request);

  // If Origin is present but not allowed, return 403 explicitly.
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, { status: 204, headers: cors });
}

export async function GET({ request, url }) {
  if (!supabaseAdmin) return json({ error: 'Configuração do servidor ausente.' }, { status: 500 });

  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403 });
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

  const onlyVisible = parseBoolean(url.searchParams.get('onlyVisible'), true);

  try {
    let q = supabaseAdmin
      .from('produtos')
      .select('id, nome, preco, id_categoria, ocultar_no_pdv')
      .eq('id_usuario', user.id)
      .order('nome', { ascending: true });

    if (onlyVisible) {
      // "Visível no PDV" no app atual: ocultar_no_pdv é null ou false
      q = q.or('ocultar_no_pdv.is.null,ocultar_no_pdv.eq.false');
    }

    const { data, error } = await q;
    if (error) {
      console.warn('[api/produtos] supabase error:', error.message);
      return json({ error: 'Erro ao carregar produtos.' }, { status: 500, headers: cors });
    }

    return json({ data: data || [] }, { headers: cors });
  } catch (err) {
    console.error('[api/produtos] unexpected error:', err?.message || err);
    return json({ error: 'Erro inesperado ao carregar produtos.' }, { status: 500, headers: cors });
  }
}
