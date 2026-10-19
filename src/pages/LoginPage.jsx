import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle, signInWithEmail } from '../services/authService';
import { isSupabaseConfigured } from '../services/supabaseClient';

export default function LoginPage() {
  const { user, configured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null); // { kind: 'ok'|'err'|'busy', text }
  const ready = configured && isSupabaseConfigured();

  const google = async () => {
    setStatus({ kind: 'busy', text: 'Redirecting to Google…' });
    try {
      await signInWithGoogle();
    } catch (err) {
      setStatus({ kind: 'err', text: err.message });
    }
  };

  const magicLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus({ kind: 'busy', text: 'Sending sign-in link…' });
    try {
      await signInWithEmail(email);
      setStatus({ kind: 'ok', text: 'Check your inbox — tap the link to finish signing in.' });
    } catch (err) {
      setStatus({ kind: 'err', text: err.message });
    }
  };

  if (user) {
    return (
      <div className="min-h-screen bg-ink text-foreground">
        <Navbar />
        <main className="mx-auto w-full max-w-md px-4 pt-28 text-center">
          <p className="text-xl font-bold text-white">You are signed in</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-6 rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
          >
            Back to browsing
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-md px-4 pt-28">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-white sm:text-4xl">
          Sign in <span className="text-muted font-light normal-case tracking-normal">or</span>{' '}
          <span className="bg-gradient-to-r from-brand-light via-brand to-amber-400 bg-clip-text text-transparent">
            create your account
          </span>
        </h1>
        {!ready && (
          <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Accounts are not configured yet (missing Supabase keys). See{' '}
            <code>docs/accounts.md</code> to enable them. Guest mode still works.
          </p>
        )}
        <button
          type="button"
          onClick={google}
          disabled={!ready}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-white px-6 py-2.5
                     text-sm font-bold text-black transition hover:bg-neutral-200 disabled:opacity-40"
        >
          Continue with Google
          <span className="sr-only">(new accounts are created automatically)</span>
        </button>
        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-ink-border" /> or <span className="h-px flex-1 bg-ink-border" />
        </div>
        <form onSubmit={magicLink} className="space-y-3">
          <label className="block text-sm text-muted">
            Email magic link
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-md border border-ink-border bg-ink-raised px-3 py-2.5
                         text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40"
            />
          </label>
          <button
            type="submit"
            disabled={!ready}
            className="w-full rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white
                       transition hover:bg-brand-dark disabled:opacity-40"
          >
            Email me a sign-in link
          </button>
          <p className="text-center text-xs text-muted">
            We will email you a link — new accounts are created on first use.
          </p>
        </form>
        {status && (
          <p
            role="status"
            className={`mt-4 rounded-md px-4 py-3 text-sm ${
              status.kind === 'err'
                ? 'border border-brand/40 bg-brand/10 text-brand-light'
                : status.kind === 'ok'
                  ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'text-muted'
            }`}
          >
            {status.text}
          </p>
        )}
        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/" className="underline hover:text-white">Continue as guest →</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
