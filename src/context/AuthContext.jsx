import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';
import { fetchProfileAvatar } from '../services/avatarService';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  configured: false,
  isGuest: true,
  refresh: async () => {},
  avatar: null,
  refreshAvatar: async () => {},
});

export function AuthProvider({ children }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(() => configured);
  const [avatar, setAvatar] = useState(null);

  const refreshAvatar = useCallback(async (userId) => {
    const id = userId ?? session?.user?.id;
    if (!id) { setAvatar(null); return null; }
    const url = await fetchProfileAvatar(id);
    setAvatar(url);
    return url;
  }, [session?.user?.id]);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    setSession(data.session ?? null);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) { setAvatar(null); return; }
    let cancelled = false;
    fetchProfileAvatar(session.user.id).then((url) => { if (!cancelled) setAvatar(url); });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (mounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }
    })();
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured,
      isGuest: !session?.user,
      refresh,
      avatar,
      refreshAvatar,
    }),
    [session, loading, configured, refresh, avatar, refreshAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
