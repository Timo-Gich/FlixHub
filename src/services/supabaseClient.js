// ----------------------------------------------------------------------------
// Supabase client (optional). If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
// missing, getSupabase() returns null and the app runs fully in guest mode
// (localStorage only). This keeps accounts truly optional.
// ----------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

let client = null;
let warned = false;

export function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (!warned) {
      warned = true;
      console.info('[auth] Supabase env missing — running in guest-only mode.');
    }
    return null;
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'flixhub.auth',
      },
    });
  }
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
