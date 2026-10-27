import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { configureVapid, getAdminClient } from './_lib/push.mjs';

const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 240;

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function validAppPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://flixhub.invalid');
    return url.origin === 'https://flixhub.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    try {
      configureVapid();
      getAdminClient();
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error('Supabase authentication credentials are not configured.');
    } catch (error) {
      console.error('[push] server configuration is invalid', error);
      return json(res, 503, { error: 'Push server configuration is incomplete or invalid.' });
    }
    return json(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: 'Sign in is required.' });

  try {
    configureVapid();
  } catch (error) {
    console.error('[push] VAPID configuration is invalid', error);
    return json(res, 503, { error: 'Push server configuration is incomplete or invalid.' });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (error) {
    console.error('[push] server credentials are not configured', error);
    return json(res, 503, { error: 'Push service is not configured on the server.' });
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(res, 503, { error: 'Supabase authentication is not configured on the server.' });
  }
  const authClient = createClient(
    supabaseUrl,
    anonKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json(res, 401, { error: 'Sign-in session is invalid or expired.' });
  const userId = authData.user.id;

  const [{ data: preference, error: preferenceError }, { data: subscriptions, error: subscriptionsError }] =
    await Promise.all([
      admin.from('notification_settings').select('notifications_enabled, browser_enabled').eq('user_id', userId).maybeSingle(),
      admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId),
    ]);
  if (preferenceError || subscriptionsError) {
    console.error('[push] could not load push settings or subscriptions', preferenceError || subscriptionsError);
    return json(res, 500, { error: 'Could not load notification subscriptions.' });
  }
  if (!preference?.notifications_enabled || !preference.browser_enabled) {
    return json(res, 403, { error: 'Background notifications are disabled.' });
  }
  if (!subscriptions?.length) return json(res, 409, { error: 'No registered devices for background notifications.' });

  const payload = req.body || {};
  const message = JSON.stringify({
    title: String(payload.title || 'FlixHub').slice(0, MAX_TITLE_LENGTH),
    body: String(payload.body || 'You have a new notification.').slice(0, MAX_BODY_LENGTH),
    url: validAppPath(payload.url),
    tag: String(payload.tag || `flixhub-${Date.now()}`).slice(0, 100),
  });

  const outcomes = await Promise.allSettled(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        message,
        { TTL: 60 * 60 * 24 },
      );
      return true;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        const { error: deleteError } = await admin
          .from('push_subscriptions')
          .delete()
          .eq('id', row.id)
          .eq('user_id', userId);
        if (deleteError) console.error('[push] could not remove expired subscription', deleteError);
        return false;
      }
      throw error;
    }
  }));

  const sent = outcomes.filter((result) => result.status === 'fulfilled' && result.value).length;
  const failures = outcomes.filter((result) => result.status === 'rejected');
  failures.forEach((result) => console.error('[push] delivery failed', result.reason));
  if (!sent && failures.length) return json(res, 502, { error: 'Push delivery failed for all registered devices.' });
  return json(res, 200, { sent, failed: failures.length });
}
