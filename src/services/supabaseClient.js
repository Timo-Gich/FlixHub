// ----------------------------------------------------------------------------
// Supabase client (optional). Accepts either VITE_SUPABASE_* or SUPABASE_*
// (Vercel envs were created without the VITE_ prefix). If both are missing,
// getSupabase() returns null and the app runs fully in guest mode
// (localStorage only). This keeps accounts truly optional.
// ----------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

let client = null;
let warned = false;

function readKey(...names) {
  for (const name of names) {
    const value = import.meta.env[name];
    if (value) return value;
  }
  return '';
}

export function getSupabase() {
  const url = readKey('VITE_SUPABASE_URL', 'SUPABASE_URL');
  const anonKey = readKey('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
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
  return Boolean(readKey('VITE_SUPABASE_URL', 'SUPABASE_URL') && readKey('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'));
}
