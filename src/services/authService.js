// ----------------------------------------------------------------------------
// Auth service: Google OAuth + email magic link via Supabase Auth.
// Guest-first: every function no-ops safely when Supabase isn't configured.
// ----------------------------------------------------------------------------

import { getSupabase } from './supabaseClient';

export async function signInWithGoogle() {
  const sb = getSupabase();
  if (!sb) throw new Error('Accounts are not configured yet.');
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export async function signInWithEmail(email) {
  const sb = getSupabase();
  if (!sb) throw new Error('Accounts are not configured yet.');
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}
