import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { canSendBrowserNotifications } from '../services/notificationService';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function NotificationCenter() {
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    settings,
    ready,
    error,
    updateSettings,
    enableBrowserNotifications,
    disableBrowserNotifications,
    sendTestNotification,
    markRead,
    markAllRead,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = async (key, value) => {
    setBusy(true);
    setMessage('');
    try {
      if (key === 'browser_enabled') {
        if (value) await enableBrowserNotifications();
        else await disableBrowserNotifications();
      } else {
        await updateSettings({ [key]: value });
      }
    } catch (toggleError) {
      setMessage(toggleError.message || 'Could not save this preference.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage('');
    try {
      await sendTestNotification();
      setMessage('Test notification sent. Check this device and any other subscribed devices.');
    } catch (sendError) {
      setMessage(sendError.message || 'Could not send the test notification.');
    } finally {
      setBusy(false);
    }
  };

  const openNotification = (notification) => {
    if (!notification.read_at) markRead(notification.id);
    if (notification.payload?.href) setOpen(false);
  };

  const browserSupported = canSendBrowserNotifications() &&
    'serviceWorker' in navigator && 'PushManager' in window;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-white/5 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          id="notification-panel"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden
                     rounded-2xl border border-ink-border bg-ink-raised shadow-2xl shadow-black/50"
        >
          <header className="flex items-center justify-between border-b border-ink-border px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-white">Notifications</h2>
              <p className="mt-0.5 text-xs text-muted">{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</p>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-brand-light transition hover:text-white">
                Mark all read
              </button>
            )}
          </header>

          <div className="max-h-64 overflow-y-auto">
            {!ready ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Loading notifications…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No notifications yet.</p>
            ) : (
              <ul>
                {notifications.map((notification) => {
                  const content = (
                    <>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? 'bg-transparent' : 'bg-brand-light'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{notification.payload?.title || 'FlixHub'}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted">{notification.payload?.body || 'You have a new notification.'}</span>
                        <time className="mt-1.5 block text-[10px] text-muted/70" dateTime={notification.created_at}>
                          {formatDate(notification.created_at)}
                        </time>
                      </span>
                    </>
                  );
                  return (
                    <li key={notification.id} className="border-b border-ink-border/70 last:border-0">
                      {notification.payload?.href ? (
                        <Link to={notification.payload.href} onClick={() => openNotification(notification)} className="flex gap-3 px-4 py-3 transition hover:bg-white/5">
                          {content}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => openNotification(notification)} className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-white/5">
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-ink-border px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Preferences</p>
            {[
              ['in_app_enabled', 'In-app notifications'],
              ['notify_continue_watching', 'Continue watching reminders'],
            ].map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-xs text-white/85">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  disabled={busy}
                  onChange={(event) => toggle(key, event.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
              </label>
            ))}
            <label className="flex items-center justify-between gap-3 py-1.5 text-xs text-white/85">
              <span>Background browser notifications</span>
              <input
                type="checkbox"
                checked={settings.browser_enabled}
                disabled={busy || !user || !browserSupported}
                onChange={(event) => toggle('browser_enabled', event.target.checked)}
                className="h-4 w-4 accent-brand"
              />
            </label>
            {!user && (
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                Sign in to enable background notifications and sync preferences. <Link to="/login" onClick={() => setOpen(false)} className="text-brand-light hover:underline">Sign in</Link>
              </p>
            )}
            {!browserSupported && (
              <p className="mt-1 text-[10px] text-muted">This browser does not support Web Push notifications.</p>
            )}
            {user && settings.browser_enabled && (
              <button
                type="button"
                disabled={busy}
                onClick={sendTest}
                className="mt-2 rounded-md border border-ink-border px-2.5 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/5 disabled:opacity-50"
              >
                Send test notification
              </button>
            )}
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              Web Push can reach subscribed devices while FlixHub is closed. Requires HTTPS and browser notification permission.
            </p>
            {(message || error) && (
              <p role={error || message.includes('failed') ? 'alert' : 'status'} className="mt-2 text-[11px] leading-relaxed text-brand-light">
                {message || error}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
