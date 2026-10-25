import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: 'Sign in is required.' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    console.error('[account] account deletion server credentials are not configured');
    return json(res, 503, { error: 'Account deletion is not configured on the server.' });
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json(res, 401, { error: 'Sign-in session is invalid or expired.' });

  const userId = authData.user.id;
  const { data: avatarFiles, error: listError } = await admin.storage.from('avatars').list(userId);
  if (listError) {
    console.error('[account] failed to list account avatar files', listError);
    return json(res, 500, { error: 'Could not clean up account files. The account was not deleted.' });
  }
  const avatarPaths = (avatarFiles || []).map((file) => `${userId}/${file.name}`);
  if (avatarPaths.length) {
    const { error: removeError } = await admin.storage.from('avatars').remove(avatarPaths);
    if (removeError) {
      console.error('[account] failed to remove account avatar files', removeError);
      return json(res, 500, { error: 'Could not clean up account files. The account was not deleted.' });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('[account] failed to delete account', deleteError);
    return json(res, 500, { error: 'Could not delete the account. Please try again.' });
  }

  return json(res, 200, { deleted: true });
}
