import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../hooks/useLibrary';
import { signOut } from '../services/authService';
import NotificationCenter from '../components/NotificationCenter';
import { uploadAvatar, removeAvatar, fetchProfileAvatar, validateAvatarFile } from '../services/avatarService';

function SignedInBody({ userId, oauthAvatar, displayName, email, provider, memberSince, syncing, counts, signingOut, error, onSignOut }) {
  const stats = [
    {
      label: 'Watchlist', value: counts.watchLater, to: '/watch-later',
      blurb: 'Saved for later',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      label: 'History', value: counts.history, to: '/history',
      blurb: 'Titles played',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
      ),
    },
    {
      label: 'Live favorites', value: counts.favoritesLive, to: '/live',
      blurb: 'Starred channels',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="15" rx="2" />
          <path d="M17 7l4-4M8 7V4M6 2l-3 3" />
        </svg>
      ),
    },
  ];
  const links = [
    {
      label: 'My Watchlist', hint: 'Titles you saved for later', to: '/watch-later',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      label: 'Watch History', hint: 'What you have played, grouped by day', to: '/history',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
      ),
    },
    {
      label: 'Live TV favorites', hint: 'Channels you starred', to: '/live',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="15" rx="2" />
          <path d="M17 7l4-4M8 7V4M6 2l-3 3" />
        </svg>
      ),
    },
  ];
  const [customAvatar, setCustomAvatar] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const fileRef = useRef(null);
  const avatarWrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfileAvatar(userId).then((url) => {
      if (!cancelled) setCustomAvatar(url);
    });
    return () => { cancelled = true; };
  }, [userId]);

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
    } catch (err) {
      setAvatarError(err.message || 'Remove failed. Try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <>
      <section aria-label="Profile" className="relative mt-6 rounded-xl border border-ink-border">
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-gradient-to-r from-brand/25 via-ink-soft to-ink-soft" aria-hidden="true">
        {avatar && (
          <div className="absolute inset-0 opacity-20 blur-2xl" aria-hidden="true">
            <img src={avatar} alt="" className="h-full w-full scale-110 object-cover" />
          </div>
        )}
        </div>
        <div className="relative flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:p-8 sm:text-left">
        <div ref={avatarWrapRef} className="flex shrink-0 flex-col items-center gap-2">
          <span
            className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full
                       bg-ink-raised text-2xl font-black text-white ring-2 ring-brand/70 ring-offset-2
                       ring-offset-ink-soft shadow-xl shadow-black/50 sm:h-28 sm:w-28"
          >
            {avatarBusy ? (
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden="true" />
            ) : avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              String(displayName).trim().charAt(0).toUpperCase() || 'F'
            )}
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            aria-label={hasCustom ? 'Change profile picture' : 'Upload profile picture'}
            title={hasCustom ? 'Change profile picture' : 'Upload profile picture'}
            className="flex items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-4
                       text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur
                       transition hover:bg-brand hover:ring-brand disabled:opacity-50"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
            {hasCustom ? 'Change picture' : 'Upload picture'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={onPickFile}
          />
          {avatarError && (
            <p role="alert" className="rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand-light">
              {avatarError}
            </p>
          )}
          {hasCustom && (
            <button
              type="button"
              onClick={onRemove}
              disabled={avatarBusy}
              className="text-xs font-semibold text-muted underline-offset-2 transition hover:text-brand-light hover:underline disabled:opacity-50"
            >
              Remove picture
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl font-semibold uppercase tracking-wide text-white sm:text-3xl">{displayName}</p>
          {email && <p className="mt-0.5 truncate text-sm text-muted">{email}</p>}
          <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted sm:justify-start">
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
        </div>
      </section>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-brand-light">
          {error}
        </p>
      )}
      <section aria-label="Library" className="mt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          Your library
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s, i) => (
          <Link
            key={s.label}
            to={s.to}
            className="group relative overflow-hidden rounded-xl border border-ink-border bg-gradient-to-b
                       from-ink-raised to-ink-soft p-5 transition duration-300
                       hover:-translate-y-0.5 hover:border-brand/60 hover:shadow-xl hover:shadow-brand/10"
          >
            <div className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition opacity-40 group-hover:opacity-70 ${
              i === 0 ? 'bg-brand/50' : i === 1 ? 'bg-amber-400/40' : 'bg-emerald-400/30'
            }`} aria-hidden="true" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-black/40 text-brand-light ring-1 ring-white/10">
              {s.icon}
            </span>
            <span className="relative mt-4 block font-display text-4xl font-semibold text-white">
              {s.value}
            </span>
            <span className="relative mt-1 block text-sm font-bold text-white">{s.label}</span>
            <span className="relative block text-xs text-muted">{s.blurb}</span>
            <span className="relative mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-light opacity-0 transition group-hover:opacity-100">
              Open <span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
        </div>
      </section>
      <section aria-label="Manage" className="mt-8">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          Manage
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-ink-border bg-ink-soft/80 backdrop-blur">
        {links.map((row) => (
          <Link
            key={row.label}
            to={row.to}
            className="group flex items-center gap-4 border-b border-ink-border/70 px-5 py-4 transition last:border-0 hover:bg-gradient-to-r hover:from-brand/15 hover:to-transparent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-raised text-muted ring-1 ring-ink-border transition group-hover:text-brand-light group-hover:ring-brand/50">
              {row.icon}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-white">{row.label}</span>
              <span className="block text-xs text-muted">{row.hint}</span>
            </span>
            <span className="text-muted transition group-hover:translate-x-1 group-hover:text-brand-light" aria-hidden="true">→</span>
          </Link>
        ))}
        </div>
      </section>
    </>
  );
}

export default function AccountPage() {
  const { user, configured, loading } = useAuth();
  const { watchLater, history, favoritesLive, syncing } = useLibrary();
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#notifications') {
      const el = document.getElementById('notification-settings');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);
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
    <div className="relative min-h-screen overflow-hidden bg-ink text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(229,9,20,0.22),transparent_70%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-32 top-64 h-72 w-72 rounded-full bg-brand/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 top-96 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" aria-hidden="true" />
      <Navbar />
      <main className="relative mx-auto w-full max-w-[900px] px-4 pb-16 pt-24 sm:px-8">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-brand-light">
          FlixHub
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide text-white sm:text-4xl">
          Account
        </h1>
        {loading ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-muted">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden="true" />
            Loading account…
          </div>
        ) : !configured ? (
          <div className="relative mt-6 overflow-hidden rounded-xl border border-ink-border bg-ink-soft px-6 py-12 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_0%,rgba(229,9,20,0.18),transparent_70%)]" aria-hidden="true" />
            <p className="relative font-display text-2xl font-semibold uppercase tracking-wide text-white">Accounts are not enabled yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              The app is running in guest mode. Add your Supabase keys (see{' '}
              <code>docs/accounts.md</code>) to turn on sign-in and sync.
            </p>
            <Link
              to="/"
              className="relative mt-6 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark"
            >
              Back to browsing
            </Link>
          </div>
        ) : !user ? (
          <div className="relative mt-6 overflow-hidden rounded-xl border border-ink-border bg-ink-soft">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(229,9,20,0.20),transparent_70%)]" aria-hidden="true" />
            <div className="relative flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ink-raised text-muted ring-2 ring-brand/50 shadow-xl shadow-black/40">
                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor"
                     strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <p className="mt-5 font-display text-2xl font-semibold uppercase tracking-wide text-white sm:text-3xl">Browsing as a guest</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Everything works without an account. Sign in to back up your watchlist,
                history and favorites — and pick up where you left off on any device.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/login"
                  className="rounded-md bg-brand px-7 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark"
                >
                  Sign in / Sign up
                </Link>
                <Link
                  to="/"
                  className="rounded-md bg-ink-raised px-7 py-2.5 text-sm font-semibold text-white ring-1 ring-ink-border transition hover:bg-white/10"
                >
                  Continue as guest
                </Link>
              </div>
            </div>
            <ul className="relative grid gap-px border-t border-ink-border bg-ink-border sm:grid-cols-3">
              {[
                { label: 'Watchlist sync', blurb: 'Saved titles follow you' },
                { label: 'History sync', blurb: 'Resume anywhere' },
                { label: 'Continue watching', blurb: 'Pick up on any device' },
              ].map((perk) => (
                <li key={perk.label} className="bg-ink-soft px-4 py-4 text-center">
                  <span className="block text-sm font-bold text-white">{perk.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{perk.blurb}</span>
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
