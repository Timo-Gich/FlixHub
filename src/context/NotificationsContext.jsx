import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchCloudLibrary } from '../services/cloudLibrary';
import { getHistory, subscribeLibrary } from '../services/libraryService';
import {
  createNotification,
  DEFAULT_NOTIFICATION_SETTINGS,
  enablePushNotifications,
  fetchNotificationSettings,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  saveNotificationSettings,
  sendPushNotification,
  subscribeToNotifications,
} from '../services/notificationService';
import Toast from '../components/Toast';

const NotificationsContext = createContext(null);
const FINISH_THRESHOLD = 0.98;

function getUnfinishedHistory(history) {
  return history.filter((entry) => {
    const duration = Number(entry.durationSeconds) || 0;
    const progress = Number(entry.progressSeconds) || 0;
    return entry?.movie?.id != null && duration > 0 && progress > 0 && progress < duration * FINISH_THRESHOLD;
  }).sort((a, b) => (b.updatedAt || b.watchedAt || 0) - (a.updatedAt || a.watchedAt || 0));
}

export function NotificationsProvider({ children }) {
  const { user, session } = useAuth();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const toastTimer = useRef(null);
  const settingsRef = useRef(settings);
  const seenNotificationIds = useRef(new Set());
  settingsRef.current = settings;

  const showToast = useCallback((notification) => {
    if (!userId) return;
    if (settingsRef.current.notifications_enabled && settingsRef.current.in_app_enabled) {
      setToast(notification);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6500);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    seenNotificationIds.current.clear();
    setNotifications([]);
    setSettings(DEFAULT_NOTIFICATION_SETTINGS);
    setReady(false);
    setError('');
    (async () => {
      try {
        const [items, preferences] = await Promise.all([
          fetchNotifications(userId),
          fetchNotificationSettings(userId),
        ]);
        if (cancelled) return;
        setNotifications(items);
        setSettings(preferences);
        items.forEach((item) => seenNotificationIds.current.add(item.id));
      } catch (loadError) {
        if (cancelled) return;
        console.error('[notifications] failed to load notification data', loadError);
        setError('Notifications could not be loaded. Apply the latest supabase/schema.sql migration.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const receiveNotification = useCallback((notification, show = true) => {
    if (seenNotificationIds.current.has(notification.id)) return;
    seenNotificationIds.current.add(notification.id);
    setNotifications((current) => [notification, ...current].slice(0, 50));
    if (show) showToast(notification);
  }, [showToast]);

  useEffect(() => {
    if (!userId || !ready) return undefined;
    return subscribeToNotifications(userId, (event) => {
      const notification = event.new;
      if (event.eventType === 'UPDATE') {
        setNotifications((current) => current.map((item) => item.id === notification.id ? notification : item));
        return;
      }
      receiveNotification(notification);
    });
  }, [userId, ready, receiveNotification]);

  const createSmartReminder = useCallback(async () => {
    if (!userId) return;
    if (!settingsRef.current.notifications_enabled || !settingsRef.current.notify_continue_watching) return;
    let history = getHistory();
    if (userId) {
      try {
        const cloud = await fetchCloudLibrary(userId);
        const byEpisode = new Map(cloud.history.map((entry) => [
          `${entry.movie.id}:${entry.season || 0}:${entry.episode || 0}`,
          entry,
        ]));
        history.forEach((entry) => {
          const key = `${entry.movie.id}:${entry.season || 0}:${entry.episode || 0}`;
          const previous = byEpisode.get(key);
          if (!previous || (entry.updatedAt || entry.watchedAt || 0) > (previous.updatedAt || previous.watchedAt || 0)) {
            byEpisode.set(key, entry);
          }
        });
        history = [...byEpisode.values()];
      } catch (historyError) {
        console.warn('[notifications] could not refresh cloud history', historyError);
      }
    }

    const entry = getUnfinishedHistory(history)[0];
    if (!entry) return;
    const title = entry.movie.title || entry.movie.name || 'your title';
    const episodeLabel = entry.type === 'tv' && entry.season && entry.episode
      ? ` · S${entry.season} E${entry.episode}`
      : '';
    const href = entry.type === 'tv' && entry.season && entry.episode
      ? `/watch/tv/${entry.movie.id}/${entry.season}/${entry.episode}`
      : `/watch/${entry.movie.id}`;
    const notification = {
      type: 'continue_watching',
      dedupe_key: `continue-watching:${entry.movie.id}:${entry.season || 0}:${entry.episode || 0}:${new Date().toISOString().slice(0, 10)}`,
      payload: { title: 'Continue watching', body: `Pick up ${title}${episodeLabel} where you left off.`, href },
    };

    try {
      const created = await createNotification(userId, notification);
      if (!created) return;
      receiveNotification(created);
      if (userId && settingsRef.current.notifications_enabled && settingsRef.current.browser_enabled && session?.access_token) {
        try {
          await sendPushNotification(session.access_token, {
            title: notification.payload.title,
            body: notification.payload.body,
            url: notification.payload.href,
            tag: notification.dedupe_key,
          });
        } catch (pushError) {
          console.error('[notifications] background delivery failed', pushError);
          setError(pushError.message || 'Background notification delivery failed.');
        }
      }
    } catch (createError) {
      console.error('[notifications] failed to create continue-watching reminder', createError);
      setError('Could not save a notification. Apply the latest supabase/schema.sql migration.');
    }
  }, [userId, session?.access_token, receiveNotification]);

  useEffect(() => {
    if (!userId || !ready || !settings.notifications_enabled || !settings.notify_continue_watching) return undefined;
    let active = true;
    const check = () => {
      if (active && document.visibilityState === 'visible') createSmartReminder();
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', check);
    };
  }, [ready, settings.notifications_enabled, settings.notify_continue_watching, createSmartReminder]);

  useEffect(() => {
    const onMessage = (event) => {
      if (!userId) return;
      if (event.data?.type !== 'flixhub:push') return;
      const notification = {
        id: `push-${Date.now()}`,
        type: 'push',
        read_at: null,
        created_at: new Date().toISOString(),
        payload: {
          title: event.data.title,
          body: event.data.body,
          href: event.data.url,
        },
      };
      showToast(notification);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [showToast]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const updateSettings = useCallback(async (patch) => {
    setError('');
    const next = { ...settingsRef.current, ...patch };
    try {
      const saved = await saveNotificationSettings(userId, next);
      settingsRef.current = saved;
      setSettings(saved);
      return saved;
    } catch (saveError) {
      console.error('[notifications] failed to save notification settings', saveError);
      setError('Could not save notification preferences. Apply the latest supabase/schema.sql migration.');
      throw saveError;
    }
  }, [userId]);

  const enableBrowserNotifications = useCallback(async () => {
    setError('');
    let subscription;
    try {
      subscription = await enablePushNotifications(userId, session?.access_token);
      await updateSettings({
        notifications_enabled: true,
        in_app_enabled: true,
        notify_continue_watching: true,
        browser_enabled: true,
      });
      return subscription;
    } catch (pushError) {
      if (subscription) {
        try {
          await removePushSubscription(userId);
        } catch (cleanupError) {
          console.error('[notifications] failed to clean up push subscription', cleanupError);
        }
      }
      console.error('[notifications] could not enable background notifications', pushError);
      setError(pushError.message || 'Could not enable background notifications.');
      throw pushError;
    }
  }, [userId, session?.access_token, updateSettings]);

  const disableBrowserNotifications = useCallback(async () => {
    setError('');
    try {
      await removePushSubscription(userId);
      await updateSettings({
        notifications_enabled: false,
        in_app_enabled: false,
        notify_continue_watching: false,
        browser_enabled: false,
      });
    } catch (pushError) {
      console.error('[notifications] could not disable background notifications', pushError);
      setError(pushError.message || 'Could not disable background notifications.');
      throw pushError;
    }
  }, [userId, updateSettings]);

  const sendTestNotification = useCallback(async () => {
    if (!session?.access_token) throw new Error('Sign in to send a test notification.');
    await sendPushNotification(session.access_token, {
      title: 'FlixHub test',
      body: 'Background notifications are working on this device.',
      url: '/',
      tag: `flixhub-test-${Date.now()}`,
    });
  }, [session?.access_token]);

  const markRead = useCallback(async (notificationId) => {
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, read_at: readAt } : item
    )));
    try {
      await markNotificationRead(userId, notificationId);
    } catch (markError) {
      setNotifications(previous);
      console.error('[notifications] failed to mark notification as read', markError);
      setError('Could not update notification read status.');
    }
  }, [notifications, userId]);

  const markAllRead = useCallback(async () => {
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (
      item.read_at ? item : { ...item, read_at: readAt }
    )));
    try {
      await markAllNotificationsRead(userId);
    } catch (markError) {
      setNotifications(previous);
      console.error('[notifications] failed to mark notifications as read', markError);
      setError('Could not update notification read status.');
    }
  }, [notifications, userId]);

  const value = useMemo(() => ({
    notifications,
    unreadCount: notifications.filter((item) => !item.read_at).length,
    settings,
    ready,
    error,
    updateSettings,
    enableBrowserNotifications,
    disableBrowserNotifications,
    sendTestNotification,
    markRead,
    markAllRead,
    dismissToast: () => setToast(null),
  }), [
    notifications, settings, ready, error, updateSettings, enableBrowserNotifications,
    disableBrowserNotifications, sendTestNotification, markRead, markAllRead,
  ]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {toast && <Toast notification={toast} onDismiss={() => setToast(null)} />}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used within NotificationsProvider.');
  return context;
}
