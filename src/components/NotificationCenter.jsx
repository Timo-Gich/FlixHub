import { useState } from 'react';
import { useNotifications } from '../context/NotificationsContext';
import { canSendBrowserNotifications } from '../services/notificationService';

export default function NotificationCenter() {
  const {
    settings,
    ready,
    error,
    enableBrowserNotifications,
    disableBrowserNotifications,
  } = useNotifications();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const supported = canSendBrowserNotifications() &&
    'serviceWorker' in navigator && 'PushManager' in window;
  const enabled = settings.notifications_enabled;

  const toggleNotifications = async (shouldEnable) => {
    setBusy(true);
    setMessage('');
    try {
      if (shouldEnable) await enableBrowserNotifications();
      else await disableBrowserNotifications();
    } catch (toggleError) {
      setMessage(toggleError.message || 'Could not update notification settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="notification-settings"
      aria-label="Notification settings"
      className="mt-3 rounded-xl border border-ink-border bg-ink-soft/80 px-5 py-4 backdrop-blur"
    >
      <div className="flex items-center justify-between gap-4">
        <span id="notification-toggle-label" className="text-sm font-bold text-white">
          Enable Notifications
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="notification-toggle-label"
          disabled={!ready || busy || !supported}
          onClick={() => toggleNotifications(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2
            focus-visible:ring-offset-ink-soft disabled:cursor-not-allowed disabled:opacity-50
            ${enabled ? 'bg-brand' : 'bg-ink-border'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
              ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
      {!supported && (
        <p className="mt-3 text-xs text-muted">This browser does not support background notifications.</p>
      )}
      {(message || error) && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-brand-light">
          {message || error}
        </p>
      )}
    </section>
  );
}
