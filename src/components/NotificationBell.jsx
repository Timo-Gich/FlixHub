import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, ready } = useNotifications();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const unread = notifications.filter((notification) => !notification.read_at);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-bell-panel"
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
          id="notification-bell-panel"
          aria-label="Unread notifications"
          className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden
                     rounded-2xl border border-ink-border bg-ink-raised shadow-2xl shadow-black/50"
        >
          <header className="flex items-center justify-between border-b border-ink-border px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-white">Unread notifications</h2>
              <p className="mt-0.5 text-xs text-muted">{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-brand-light transition hover:text-white"
              >
                Mark all read
              </button>
            )}
          </header>
          <div className="max-h-72 overflow-y-auto">
            {!ready ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Loading notifications…</p>
            ) : unread.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">All caught up.</p>
            ) : (
              <ul>
                {unread.map((notification) => {
                  const content = (
                    <>
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-light" aria-hidden="true" />
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
                        <Link
                          to={notification.payload.href}
                          onClick={() => { markRead(notification.id); setOpen(false); }}
                          className="flex gap-3 px-4 py-3 transition hover:bg-white/5"
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markRead(notification.id)}
                          className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-ink-border px-4 py-2.5">
            <Link
              to="/account#notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-brand-light hover:underline"
            >
              Manage account →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
