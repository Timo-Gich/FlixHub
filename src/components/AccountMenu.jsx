import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../services/authService';

/**
 * Right-side account control: "Sign in" pill for guests, avatar menu for
 * signed-in users (Watchlist / History / Sign out).
 */
export default function AccountMenu() {
  const { user, configured } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  if (!configured) return null;

  if (!user) {
    return (
      <Link
        to="/login"
        aria-label="Sign in"
        title="Sign in"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted
                   transition hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </Link>
    );
  }

  const meta = user.user_metadata || {};
  const label = meta.full_name || meta.name || user.email || 'Account';
  const initial = String(label).trim().charAt(0).toUpperCase() || 'F';
  const avatar = meta.avatar_url || meta.picture || null;

  const doSignOut = async () => {
    setOpen(false);
    try {
      await signOut();
    } catch (err) {
      console.warn('[auth] sign out failed', err);
    }
  };

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => navigate('/account')}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        title={label}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full
                   bg-ink-raised text-sm font-black text-white ring-1 ring-ink-border
                   transition hover:ring-brand/60"
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl
                     border border-ink-border bg-ink-raised/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur"
        >
          <p className="truncate px-2.5 py-2 text-xs text-muted">{label}</p>
          <Link
            to="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-sm font-medium text-white transition hover:bg-white/5"
          >
            My Account
          </Link>
          <Link
            to="/watch-later"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-white"
          >
            My Watchlist
          </Link>
          <Link
            to="/history"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-white"
          >
            Watch History
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={doSignOut}
            className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
