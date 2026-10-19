import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../hooks/useLibrary';
import { signOut } from '../services/authService';
import { uploadAvatar, removeAvatar, fetchProfileAvatar, validateAvatarFile } from '../services/avatarService';

function SignedInBody({ userId, oauthAvatar, displayName, email, provider, memberSince, syncing, counts, signingOut, error, onSignOut }) {
  const stats = [
    { label: 'Watchlist', value: counts.watchLater, to: '/watch-later' },
    { label: 'History', value: counts.history, to: '/history' },
    { label: 'Live favorites', value: counts.favoritesLive, to: '/live' },
  ];
  const [customAvatar, setCustomAvatar] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const fileRef = useRef(null);
  const avatarWrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfileAvatar(userId).then((url) => {
      if (!cancelled) setCustomAvatar(url);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onDoc = (e) => {
      if (avatarWrapRef.current && !avatarWrapRef.current.contains(e.target)) setAvatarMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [avatarMenuOpen]);

  const avatar = customAvatar || oauthAvatar || null;
  const hasCustom = Boolean(customAvatar);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateAvatarFile(file);
    if (problem) {
      setAvatarError(problem);
      return;
    }
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const url = await uploadAvatar(userId, file);
      setCustomAvatar(url.split('?')[0]);
      setAvatarMenuOpen(false);
    } catch (err) {
      setAvatarError(err.message || 'Upload failed. Try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRemove = async () => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await removeAvatar(userId);
      setCustomAvatar(null);
      setAvatarMenuOpen(false);
    } catch (err) {
      setAvatarError(err.message || 'Remove failed. Try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <>
      <section className="mt-6 flex flex-col gap-4 rounded-md border border-ink-border bg-ink-soft p-5 sm:flex-row sm:items-center">
        <div ref={avatarWrapRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAvatarMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={avatarMenuOpen}
            aria-label="Change profile picture"
            title="Change profile picture"
            className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full
                       bg-ink-raised text-xl font-black text-white ring-1 ring-ink-border
                       transition hover:ring-brand/60"
          >
            {avatarBusy ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden="true" />
            ) : avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              String(displayName).trim().charAt(0).toUpperCase() || 'F'
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-0.5" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={onPickFile}
          />
          {avatarMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-30 mt-2 w-48 origin-top-left overflow-hidden rounded-xl border
                         border-ink-border bg-ink-raised/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => fileRef.current?.click()}
                className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-white/5 hover:text-white"
              >
                {hasCustom ? 'Change picture…' : 'Upload picture…'}
              </button>
              {hasCustom && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={onRemove}
                  className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-white/5 hover:text-white"
                >
                  Remove picture
                </button>
              )}
            </div>
          )}
        </div>
        {avatarError && (
          <p role="alert" className="rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand-light sm:hidden">
            {avatarError}
          </p>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-white">{displayName}</p>
          {email && <p className="truncate text-sm text-muted">{email}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {memberSince && <span>Member since {memberSince}</span>}
            {provider && (
              <span className="rounded bg-ink-raised px-2 py-0.5 font-semibold capitalize ring-1 ring-ink-border">
                {provider}
              </span>
            )}
            {!syncing ? (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                Synced
              </span>
            ) : (
              <span className="rounded bg-ink-raised px-2 py-0.5 font-semibold ring-1 ring-ink-border">
                Syncing…
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="rounded-md bg-ink-raised px-5 py-2 text-sm font-bold text-white ring-1 ring-ink-border
                     transition hover:bg-brand hover:ring-brand disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-brand-light">
          {error}
        </p>
      )}
      <section aria-label="Library" className="mt-6 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="rounded-md border border-ink-border bg-ink-soft px-4 py-5 text-center transition hover:border-brand/50"
          >
            <span className="block text-2xl font-black text-white">{s.value}</span>
            <span className="mt-1 block text-xs font-semibold text-muted">{s.label}</span>
          </Link>
        ))}
      </section>
      <section aria-label="Manage" className="mt-6 overflow-hidden rounded-md border border-ink-border bg-ink-soft">
        {[
          { label: 'My Watchlist', hint: 'Titles you saved for later', to: '/watch-later' },
          { label: 'Watch History', hint: 'What you have played, grouped by day', to: '/history' },
          { label: 'Live TV favorites', hint: 'Channels you starred', to: '/live' },
        ].map((row) => (
          <Link
            key={row.label}
            to={row.to}
            className="flex items-center gap-3 border-b border-ink-border px-5 py-4 transition last:border-0 hover:bg-white/5"
          >
            <span className="flex-1">
              <span className="block text-sm font-bold text-white">{row.label}</span>
              <span className="block text-xs text-muted">{row.hint}</span>
            </span>
            <span className="text-muted" aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </>
  );
}

export default function AccountPage() {
  const { user, configured, loading } = useAuth();
  const { watchLater, history, favoritesLive, syncing } = useLibrary();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  const meta = user?.user_metadata || {};
  const displayName = meta.full_name || meta.name || (user?.email ? user.email.split('@')[0] : 'Member');
  const email = user?.email || null;
  const avatar = meta.avatar_url || meta.picture || null;
  const provider = user?.app_metadata?.provider || null;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const doSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Sign out failed. Try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-[900px] px-4 pt-24 sm:px-8">
        <h1 className="text-2xl font-black text-white">Account</h1>
        {loading ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-muted">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden="true" />
            Loading account…
          </div>
        ) : !configured ? (
          <div className="mt-6 rounded-md border border-ink-border bg-ink-soft px-6 py-10 text-center">
            <p className="text-xl font-bold text-white">Accounts are not enabled yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              The app is running in guest mode. Add your Supabase keys (see{' '}
              <code>docs/accounts.md</code>) to turn on sign-in and sync.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
            >
              Back to browsing
            </Link>
          </div>
        ) : !user ? (
          <div className="mt-6 overflow-hidden rounded-md border border-ink-border bg-ink-soft">
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-raised text-muted ring-1 ring-ink-border">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <p className="mt-4 text-xl font-bold text-white">You are browsing as a guest</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Everything works without an account. Sign in to back up your watchlist,
                history and favorites — and pick up where you left off on any device.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/login"
                  className="rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
                >
                  Sign in / Sign up
                </Link>
                <Link
                  to="/"
                  className="rounded-md bg-ink-raised px-6 py-2.5 text-sm font-semibold text-white ring-1 ring-ink-border transition hover:bg-white/10"
                >
                  Continue as guest
                </Link>
              </div>
            </div>
            <ul className="grid gap-px border-t border-ink-border bg-ink-border sm:grid-cols-3">
              {['Watchlist sync', 'Watch history sync', 'Cross-device continue watching'].map((perk) => (
                <li key={perk} className="bg-ink-soft px-4 py-3 text-center text-xs font-semibold text-muted">
                  {perk}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <SignedInBody
            userId={user.id}
            oauthAvatar={avatar}
            displayName={displayName}
            email={email}
            provider={provider}
            memberSince={memberSince}
            syncing={syncing}
            counts={{ watchLater: watchLater.length, history: history.length, favoritesLive: favoritesLive.length }}
            signingOut={signingOut}
            error={error}
            onSignOut={doSignOut}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
