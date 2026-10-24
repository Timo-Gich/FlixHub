import { Link } from 'react-router-dom';

export default function Toast({ notification, onDismiss }) {
  const payload = notification.payload || {};
  const content = (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-bold text-white">{payload.title || 'FlixHub'}</span>
      <span className="mt-1 block text-sm text-white/75">{payload.body || 'You have a new notification.'}</span>
    </span>
  );
  const icon = (
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand-light" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    </span>
  );

  return (
    <div
      role="status"
      className="fixed bottom-20 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3
                 rounded-xl border border-ink-border bg-ink-raised p-4 shadow-2xl shadow-black/50
                 animate-[dropdown_0.2s_ease-out] md:bottom-5"
    >
      {payload.href ? (
        <Link to={payload.href} onClick={onDismiss} className="flex min-w-0 flex-1 gap-3 no-underline">
          {icon}
          {content}
        </Link>
      ) : (
        <>
          {icon}
          {content}
        </>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="rounded p-1 text-muted transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
