// ----------------------------------------------------------------------------
// Avatar service: upload / remove custom profile pictures via Supabase Storage.
// Files live in the public `avatars` bucket under `<userId>/avatar.<ext>`.
// The public URL is mirrored into profiles.avatar_url so it renders anywhere.
// Guest-safe: every function throws a clear error when unconfigured/guest.
// ----------------------------------------------------------------------------

import { getSupabase } from './supabaseClient';

export const AVATAR_BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

function extFor(file) {
  const fromName = (file?.name || '').split('.').pop()?.toLowerCase();
  if (ALLOWED_EXTS.includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (file?.type === 'image/png') return 'png';
  if (file?.type === 'image/webp') return 'webp';
  return 'jpg';
}

export function validateAvatarFile(file) {
  if (!file) return 'Choose an image file first.';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_BYTES) return 'Image must be 2 MB or smaller.';
  return null;
}

/** @returns {Promise<string>} public URL of the uploaded avatar */
export async function uploadAvatar(userId, file) {
  const sb = getSupabase();
  if (!sb) throw new Error('Accounts are not configured yet.');
  if (!userId) throw new Error('Sign in to change your picture.');
  const problem = validateAvatarFile(file);
  if (problem) throw new Error(problem);
  const ext = extFor(file);
  const path = `${userId}/avatar.${ext}`;
  // Remove a stale sibling with a different extension so only one file remains.
  try {
    const { data: existing } = await sb.storage.from(AVATAR_BUCKET).list(userId);
    const stale = (existing || []).map((o) => o.name).filter((n) => n.startsWith('avatar.') && n !== `avatar.${ext}`);
    if (stale.length) await sb.storage.from(AVATAR_BUCKET).remove(stale.map((n) => `${userId}/${n}`));
  } catch { /* best-effort cleanup */ }
  const { error: upErr } = await sb.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  });
  if (upErr) throw upErr;
  const { data } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const baseUrl = data?.publicUrl;
  if (!baseUrl) throw new Error('Upload succeeded but no public URL was returned.');
  // Cache-bust so the new picture shows immediately everywhere.
  const publicUrl = `${baseUrl}?t=${Date.now()}`;
  const cleanUrl = baseUrl; // stored value stays stable; bust param only for display
  const { error: dbErr } = await sb.from('profiles').update({ avatar_url: cleanUrl }).eq('id', userId);
  if (dbErr) throw dbErr;
  return publicUrl;
}

export async function removeAvatar(userId) {
  const sb = getSupabase();
  if (!sb) throw new Error('Accounts are not configured yet.');
  if (!userId) throw new Error('Sign in to change your picture.');
  try {
    const { data: existing } = await sb.storage.from(AVATAR_BUCKET).list(userId);
    const targets = (existing || []).map((o) => o.name).filter((n) => n.startsWith('avatar.'));
    if (targets.length) await sb.storage.from(AVATAR_BUCKET).remove(targets.map((n) => `${userId}/${n}`));
  } catch { /* file may already be gone — still clear the profile */ }
  const { error } = await sb.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) throw error;
}

/** Custom picture stored on the profile row (null when never uploaded). */
export async function fetchProfileAvatar(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return null;
  const { data, error } = await sb.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
  if (error) return null;
  return data?.avatar_url || null;
}
