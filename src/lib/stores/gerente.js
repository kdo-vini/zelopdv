import { get, writable } from 'svelte/store';
import { supabase as defaultSupabase } from '$lib/supabaseClient.js';

export const unreadCount = writable(0);
export const hasUnreadCritical = writable(false);

export async function fetchUnread(client = defaultSupabase) {
  if (!client) return 0;
  const { count, error } = await client.from('business_signals').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  unreadCount.set(count || 0);
  return count || 0;
}

// `signalType`/`severity`/`mutedTypes` let the caller (which already has the
// full signal in hand) keep this store's counters consistent with the
// muted-type filter the unread badge applies: a muted-type signal was never
// counted in unreadCount/hasUnreadCritical, so marking it read must not
// decrement them either. When reading a critical, non-muted signal we
// re-check for other unread critical signals so the badge only turns off
// once none remain, instead of going stale until the sidebar remounts.
export async function markRead(ids, client = defaultSupabase, { signalType = null, severity = null, mutedTypes = [] } = {}) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length || !client) return;
  const isMuted = signalType != null && mutedTypes.includes(signalType);
  const previousCount = get(unreadCount);
  const previousCritical = get(hasUnreadCritical);
  if (!isMuted) unreadCount.update((count) => Math.max(0, count - uniqueIds.length));
  const { error } = await client.from('business_signals').update({ read_at: new Date().toISOString() }).in('id', uniqueIds).is('read_at', null);
  if (error) {
    if (!isMuted) unreadCount.set(previousCount);
    hasUnreadCritical.set(previousCritical);
    throw error;
  }
  if (severity === 'critical' && !isMuted) {
    let query = client.from('business_signals').select('id', { count: 'exact', head: true }).is('read_at', null).eq('severity', 'critical');
    if (mutedTypes.length) query = query.not('type', 'in', `(${mutedTypes.join(',')})`);
    const { count, error: criticalError } = await query;
    if (!criticalError) hasUnreadCritical.set((count || 0) > 0);
  }
}

