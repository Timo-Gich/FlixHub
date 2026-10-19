import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const KEY = 'flixhub.syncNudgeDismissed';

/**
 * Dismissible "sign in to sync" banner shown to guests who already have local
 * items. Never blocks — browsing stays fully functional.
 */
export default function SyncNudge({ hasItems }) {
  const { isGuest, configured } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!isGuest || !configured || !hasItems || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-brand/30 bg-brand/10 px-4 py-3">
      <p className="flex-1 text-sm text-white">
        <strong>Sync across devices?</strong>{' '}
        <span className="text-white/70">Sign in to back up your list and pick up where you left off anywhere.</span>
      </p>
      <Link
        to="/login"
        className="rounded-md bg-brand px-4 py-1.5 text-sm font-bold text-white transition hover:bg-brand-dark"
      >
        Sign in
      </Link>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-md px-3 py-1.5 text-sm font-semibold text-white/60 transition hover:text-white"
      >
        Not now
      </button>
    </div>
  );
}
