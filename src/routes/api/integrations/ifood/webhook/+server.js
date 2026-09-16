import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabaseAdmin.js';
import { createIfoodInboxRepository } from '$lib/server/ifood/inboxRepository.js';
import { handleIfoodWebhook, jsonResponse } from '$lib/server/ifood/webhookHandler.js';

// SvelteKit only allows HTTP-verb (and a small set of well-known) exports
// from a `+server.js` module, so all the actual logic lives in
// `webhookHandler.js`; this file only wires `$env`/`supabaseAdmin` into it.
export async function POST({ request }) {
  const secret = env.IFOOD_CLIENT_SECRET || null;

  if (!supabaseAdmin) {
    return jsonResponse(503, { error: 'unavailable' });
  }

  return handleIfoodWebhook({
    request,
    secret,
    repository: createIfoodInboxRepository({ supabase: supabaseAdmin })
  });
}
