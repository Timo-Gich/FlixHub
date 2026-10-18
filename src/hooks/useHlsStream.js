import { useCallback, useEffect, useRef, useState } from 'react';

function friendlyResolveError(status, payload) {
  const msg = payload?.error || payload?.message || '';
  // No resolver configured yet (or upstream returned HTML) -> explain, don't leak JSON syntax errors.
  if (status === 404) return 'Stream unavailable for this title yet';
  if (status === 501 || /not configured|RESOLVER_BASE_URL/i.test(msg)) {
    return 'Direct HLS is not configured yet';
  }
  if (status === 502) return 'Resolver is temporarily down';
  if (msg && !/unexpected token|is not valid json/i.test(msg)) return msg;
  return 'Stream unavailable';
}

export default function useHlsStream({ type, id, season, episode, enabled }) {
  const [streamUrl, setStreamUrl] = useState('');
  const [headers, setHeaders] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef(null);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!enabled || !id) { setStreamUrl(''); setError(''); setLoading(false); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    const q = new URLSearchParams({ type, id: String(id) });
    if (type === 'tv') { q.set('season', String(season)); q.set('episode', String(episode)); }
    fetch(`/api/resolve?${q.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        const text = await r.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!r.ok) throw new Error(friendlyResolveError(r.status, data));
        if (!data?.streamUrl) throw new Error(friendlyResolveError(404, data));
        return data;
      })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        const proxied = `/api/stream?url=${encodeURIComponent(d.streamUrl)}`
          + (d.userAgent ? `&ua=${encodeURIComponent(d.userAgent)}` : '')
          + (d.referer ? `&referer=${encodeURIComponent(d.referer)}` : '')
          + (d.origin ? `&origin=${encodeURIComponent(d.origin)}` : '');
        setStreamUrl(proxied);
        setHeaders({ userAgent: d.userAgent, referer: d.referer, origin: d.origin });
        setLoading(false);
      })
      .catch((e) => {
        if (ctrl.signal.aborted || e?.name === 'AbortError') return;
        setStreamUrl('');
        setError(e?.message || 'Stream unavailable');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [type, id, season, episode, enabled, attempt]);

  return { streamUrl, headers, loading, error, retry };
}
