import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';
import { fetchProfileAvatar } from '../services/avatarService';
import { clearLibraryCache } from '../services/libraryService';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  configured: false,
  isGuest: true,
  refresh: async () => {},
  avatar: null,
  avatarLoading: false,
  refreshAvatar: async () => {},
  updateAvatar: () => {},
});

export function AuthProvider({ children }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [loading, setLoading] = useState(() => configured);
  const [avatar, setAvatar] = useState(null);
  const [avatarLoading, setAvatarLoading] = useState(() => configured);

  const applySession = useCallback((nextSession) => {
    const previousUserId = sessionRef.current?.user?.id;
    const nextUserId = nextSession?.user?.id;
    if (previousUserId !== nextUserId) {
      if (previousUserId) clearLibraryCache();
      setAvatar(null);
      setAvatarLoading(Boolean(nextUserId));
    } else if (!nextUserId) {
      setAvatarLoading(false);
    }
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const refreshAvatar = useCallback(async (userId) => {
    const id = userId ?? session?.user?.id;
    if (!id) { setAvatar(null); return null; }
    const url = await fetchProfileAvatar(id);
    setAvatar(url);
    setAvatarLoading(false);
    return url;
  }, [session?.user?.id]);

  const updateAvatar = useCallback((url) => {
    setAvatar(url);
    setAvatarLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    applySession(data.session ?? null);
  }, [applySession]);

  useEffect(() => {
    if (!session?.user?.id) {
      setAvatar(null);
      setAvatarLoading(false);
      return;
    }
    let cancelled = false;
    fetchProfileAvatar(session.user.id).then((url) => {
      if (!cancelled) {
        setAvatar(url);
        setAvatarLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    let mounted = true;
    let authEventReceived = false;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (mounted && !authEventReceived) {
        applySession(data.session ?? null);
        setLoading(false);
      }
    })();
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true;
      applySession(next ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [applySession]);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured,
      isGuest: !session?.user,
      refresh,
      avatar,
      avatarLoading,
      refreshAvatar,
      updateAvatar,
    }),
    [session, loading, configured, refresh, avatar, avatarLoading, refreshAvatar, updateAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
