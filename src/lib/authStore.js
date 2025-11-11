import { writable } from 'svelte/store';
import { supabase } from './supabaseClient';

// Session store (null | Session)
export const sessionStore = writable(null);
export const authReadyStore = writable(false);

let initialized = false;
let readyPromise;

function init() {
  if (initialized) return;
  initialized = true;

  // Listener: keeps session fresh
  supabase?.auth.onAuthStateChange((event, sess) => {
    sessionStore.set(sess);
    if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
      authReadyStore.set(true);
      resolveReady();
    }
    if (event === 'SIGNED_OUT') {
      sessionStore.set(null);
      authReadyStore.set(true); // still "ready" (no session)
      resolveReady();
    }
  });

  // Prime session (with timeout to avoid hanging)
  const getSessionWithTimeout = (ms = 3500) => Promise.race([
    supabase.auth.getSession(),
    new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), ms))
  ]);

  (async () => {
    try {
      const { data } = await getSessionWithTimeout();
      if (data?.session) sessionStore.set(data.session);
    } catch (_) { /* ignore */ }
    authReadyStore.set(true); // mark ready regardless to avoid indefinite wait
    resolveReady();
  })();
}

let resolveReady = () => {};
readyPromise = new Promise(r => (resolveReady = r));

export function waitAuthReady() {
  init();
  return readyPromise;
}

// Convenience: ensure init on first import
init();
