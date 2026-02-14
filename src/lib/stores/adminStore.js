import { writable } from 'svelte/store';

// Boolean state: true = admin area unlocked for this session
export const adminUnlocked = writable(false);

// Helper to check if a PIN is valid (simple check against profile data)
// Actual validation happens by comparing input vs empresa_perfil.pin_admin
