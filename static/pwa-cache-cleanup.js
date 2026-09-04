// Retire caches that were shared between authenticated accounts. Keep the
// app shell, public images and IndexedDB pending sales intact.
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.delete('supabase-api'),
    caches.delete('supabase-storage'),
  ]));
});
