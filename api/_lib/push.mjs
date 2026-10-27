import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server notification credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function configureVapid() {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be configured.');
  }
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  } catch (error) {
    throw new Error('VAPID configuration is invalid.', { cause: error });
  }
  return true;
}

export async function sendPushToUser(admin, userId, payload) {
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw error;
  if (!subs?.length) return { sent: 0, failed: 0 };
  const message = JSON.stringify(payload);
  const outcomes = await Promise.allSettled(subs.map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, message, { TTL: 60 * 60 * 24 });
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
  const sent = outcomes.filter(r => r.status === 'fulfilled' && r.value).length;
  const failures = outcomes.filter(r => r.status === 'rejected');
  failures.forEach(r => console.error('[push] delivery failed', r.reason));
  return { sent, failed: failures.length };
}
