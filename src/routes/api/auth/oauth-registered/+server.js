import { json } from '@sveltejs/kit';
import { sanitizeAcquisition } from '$lib/server/acquisition';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getPostHogClient } from '$lib/server/posthog';

// Counterpart to POST /api/auth/signup's `user_registered` capture, but for
// accounts created via Google OAuth (routes/auth/callback). That flow never
// goes through /api/auth/signup — Supabase creates the user during the OAuth
// code exchange — so without this endpoint, Google signups fire marketing
// pixels (Meta/GA4/Google Ads, see routes/auth/callback/+page.svelte) but are
// invisible in PostHog's activation funnel entirely.
//
// Client-side PostHog capture isn't an option here: /auth/callback is in
// posthogClient's BLOCKED_PREFIXES (the URL can carry auth tokens), so
// before_send drops anything captured on that path. Firing server-side, keyed
// off Supabase's own `created_at`, sidesteps that and matches how the email
// flow already does it.
//
// NEW_USER_WINDOW_MS is deliberately generous (vs. the ~seconds it actually
// takes) to tolerate a slow Google consent screen; it exists to reject calls
// against old sessions, not to be a tight race guard. No DB dedupe flag is
// written — a legitimate double-call in-window just double-counts one
// analytics event for the caller's own account, the same trade-off the
// marketing pixels a few lines away in auth/callback already accept.
const NEW_USER_WINDOW_MS = 2 * 60 * 1000;

async function getAuthUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : user;
}

export async function POST({ request }) {
  const user = await getAuthUser(request);
  if (!user) return json({ error: 'Não autorizado' }, { status: 401 });

  const createdAtMs = new Date(user.created_at || 0).getTime();
  const isNewUser = createdAtMs > 0 && Date.now() - createdAtMs < NEW_USER_WINDOW_MS;
  if (!isNewUser) {
    return json({ recorded: false, reason: 'not-new' });
  }

  const body = await request.json().catch(() => ({}));
  const method = body?.method === 'google' ? 'google' : 'oauth';
  const acquisition = sanitizeAcquisition(body?.acquisition);

  // Persiste first-touch no user_metadata (paridade com signup e-mail), sem
  // apagar outras chaves já gravadas pelo provedor OAuth.
  if (acquisition && supabaseAdmin) {
    try {
      const prevMeta = user.user_metadata && typeof user.user_metadata === 'object'
        ? user.user_metadata
        : {};
      if (!prevMeta.acquisition) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: { ...prevMeta, acquisition },
        });
      }
    } catch (err) {
      console.warn('[oauth-registered] acquisition metadata update failed:', err?.message || err);
    }
  }

  const posthog = getPostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: user.id,
      event: 'user_registered',
      properties: {
        $set: { email: user.email },
        ...(acquisition?.ai_source ? { $set_once: { ai_source: acquisition.ai_source } } : {}),
        method,
        has_referral: !!body?.hasReferral,
        ...(acquisition || {}),
      },
    });
    await posthog.flush();
  }

  return json({ recorded: true });
}
