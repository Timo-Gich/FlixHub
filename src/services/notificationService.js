import { getSupabase } from './supabaseClient';

const GUEST_NOTIFICATIONS_KEY = 'flixhub.notifications';
const GUEST_SETTINGS_KEY = 'flixhub.notificationSettings';

export const DEFAULT_NOTIFICATION_SETTINGS = {
  in_app_enabled: true,
  browser_enabled: false,
  notify_continue_watching: true,
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[notifications] local storage write failed', error);
    throw error;
  }
}

function requireSupabase() {
  const sb = getSupabase();
  if (!sb) throw new Error('Sign in with a configured Supabase account to sync notifications.');
  return sb;
}

export async function fetchNotifications(userId) {
  if (!userId) return readJSON(GUEST_NOTIFICATIONS_KEY, []);
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function fetchNotificationSettings(userId) {
  if (!userId) return { ...DEFAULT_NOTIFICATION_SETTINGS, ...readJSON(GUEST_SETTINGS_KEY, {}) };
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('notification_settings')
    .select('in_app_enabled, browser_enabled, notify_continue_watching')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...data };
}

export async function saveNotificationSettings(userId, settings) {
  if (!userId) {
    const next = { ...DEFAULT_NOTIFICATION_SETTINGS, ...readJSON(GUEST_SETTINGS_KEY, {}), ...settings };
    writeJSON(GUEST_SETTINGS_KEY, next);
    return next;
  }
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('notification_settings')
    .upsert(
      { user_id: userId, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select('in_app_enabled, browser_enabled, notify_continue_watching')
    .single();
  if (error) throw error;
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...data };
}

export async function createNotification(userId, notification) {
  if (!userId) {
    const items = readJSON(GUEST_NOTIFICATIONS_KEY, []);
    if (items.some((item) => item.dedupe_key === notification.dedupe_key)) return null;
    const item = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      ...notification,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    writeJSON(GUEST_NOTIFICATIONS_KEY, [item, ...items].slice(0, 50));
    return item;
  }
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('notifications')
    .upsert(
      {
        user_id: userId,
        type: notification.type,
        payload: notification.payload,
        dedupe_key: notification.dedupe_key,
      },
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function markNotificationRead(userId, notificationId) {
  if (!userId) {
    writeJSON(
      GUEST_NOTIFICATIONS_KEY,
      readJSON(GUEST_NOTIFICATIONS_KEY, []).map((item) => (
        item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item
      )),
    );
    return;
  }
  const sb = requireSupabase();
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId) {
  if (!userId) {
    const readAt = new Date().toISOString();
    writeJSON(GUEST_NOTIFICATIONS_KEY, readJSON(GUEST_NOTIFICATIONS_KEY, []).map((item) => (
      item.read_at ? item : { ...item, read_at: readAt }
    )));
    return;
  }
  const sb = requireSupabase();
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

export function subscribeToNotifications(userId, onChange) {
  const sb = getSupabase();
  if (!sb || !userId) return () => {};
  const channel = sb
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[notifications] realtime subscription failed', status, error);
      }
    });
  return () => {
    sb.removeChannel(channel);
  };
}

export function canSendBrowserNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission() {
  if (!canSendBrowserNotifications()) throw new Error('This browser does not support notifications.');
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked in browser settings.');
  return Notification.permission === 'granted' ? 'granted' : Notification.requestPermission();
}

function encodeApplicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function getVapidPublicKey() {
  const response = await fetch('/api/push', { headers: { Accept: 'application/json' } });
  const result = await response.json();
  if (!response.ok || !result.publicKey) {
    throw new Error(result.error || 'Background notifications are not configured on the server.');
  }
  return result.publicKey;
}

async function getPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support background notifications.');
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  return registration.pushManager;
}

export async function enablePushNotifications(userId, accessToken) {
  const sb = requireSupabase();
  if (!userId || !accessToken) throw new Error('Sign in to enable background notifications.');
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const pushManager = await getPushSubscription();
  const publicKey = await getVapidPublicKey();
  const subscription = await pushManager.getSubscription() || await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: encodeApplicationServerKey(publicKey),
  });
  const json = subscription.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent.slice(0, 500),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    await subscription.unsubscribe();
    throw error;
  }
  return subscription;
}

export async function removePushSubscription(userId) {
  const sb = requireSupabase();
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const { error } = await sb
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', subscription.endpoint);
    if (error) throw error;
    await subscription.unsubscribe();
  }
}

export async function sendPushNotification(accessToken, payload) {
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not send background notification.');
  return result;
}
