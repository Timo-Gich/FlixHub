import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchProfileAvatar } from '../services/avatarService';

/**
 * Right-side account control: sign-in icon for guests, avatar link to
 * /account for signed-in users (no dropdown — the account page owns
 * profile, library links and sign-out).
 */
export default function AccountMenu() {
  const { user, configured } = useAuth();
  const [customAvatar, setCustomAvatar] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (user?.id) {
      fetchProfileAvatar(user.id).then((url) => {
        if (!cancelled) setCustomAvatar(url);
      });
    } else {
      setCustomAvatar(null);
    }
    return () => { cancelled = true; };
  }, [user?.id]);

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

  const meta = user?.user_metadata || {};
  const label = meta.full_name || meta.name || user?.email || 'Account';
  const initial = String(label).trim().charAt(0).toUpperCase() || 'F';
  const avatar = customAvatar || meta.avatar_url || meta.picture || null;

  return (
    <Link
      to="/account"
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
    </Link>
  );
}
