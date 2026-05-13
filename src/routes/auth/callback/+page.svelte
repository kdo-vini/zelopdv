<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { trackLead } from '$lib/metaPixel';

  let status = 'Autenticando...';

  async function logSubUserLogin(session, source = 'auth-callback') {
    try {
      const token = session?.access_token;
      if (!token) return;
      await fetch('/api/access/audit-login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source, provider: 'oauth' }),
      });
    } catch {}
  }

  onMount(() => {
    if (!supabase) {
      window.location.href = '/login';
      return;
    }

    function maybeFireLeadPixel(session) {
      const createdAt = new Date(session.user.created_at);
      const isNewUser = Date.now() - createdAt.getTime() < 60_000;
      if (isNewUser) trackLead();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe();
        clearTimeout(timeout);
        maybeFireLeadPixel(session);
        logSubUserLogin(session, 'oauth-signed-in');
        window.location.href = '/app';
      } else if (event === 'INITIAL_SESSION' && !session) {
        // OAuth code not yet exchanged — wait for SIGNED_IN
      }
    });

    // Fallback: if already signed in or exchange completes quickly
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        subscription.unsubscribe();
        clearTimeout(timeout);
        maybeFireLeadPixel(data.session);
        logSubUserLogin(data.session, 'oauth-existing-session');
        window.location.href = '/app';
      }
    });

    // Safety timeout
    const timeout = setTimeout(() => {
      status = 'Tempo esgotado. Redirecionando...';
      subscription.unsubscribe();
      window.location.href = '/login';
    }, 10000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  });
</script>

<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg-app);">
  <div style="text-align:center;color:var(--text-muted);font-size:0.95rem;">
    <div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--primary);border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto 1rem;"></div>
    {status}
  </div>
</div>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
