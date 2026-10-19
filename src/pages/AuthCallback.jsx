import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** OAuth / magic-link landing: waits for the session, then heads home. */
export default function AuthCallback() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink">
      <div className="text-center">
        <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
        <p className="mt-4 text-sm text-muted">Finishing sign-in…</p>
      </div>
    </div>
  );
}
