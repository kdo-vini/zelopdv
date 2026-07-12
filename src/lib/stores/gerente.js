import { get, writable } from 'svelte/store';
import { supabase as defaultSupabase } from '$lib/supabaseClient.js';

export const unreadCount = writable(0);

export async function fetchUnread(client = defaultSupabase) {
  if (!client) return 0;
  const { count, error } = await client.from('business_signals').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  unreadCount.set(count || 0);
  return count || 0;
}

export async function markRead(ids, client = defaultSupabase) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length || !client) return;
  const previous = get(unreadCount);
  unreadCount.update((count) => Math.max(0, count - uniqueIds.length));
  const { error } = await client.from('business_signals').update({ read_at: new Date().toISOString() }).in('id', uniqueIds).is('read_at', null);
  if (error) {
    unreadCount.set(previous);
    throw error;
  }
}

