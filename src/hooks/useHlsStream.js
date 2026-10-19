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
  const [tracks, setTracks] = useState([]);
  const [quality, setQuality] = useState('');
  const [qualities, setQualities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState(null); // null | { ok, status, throttled }
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef(null);
  const lastKeyRef = useRef('');

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    const key = `${type}:${id}:${season ?? ''}:${episode ?? ''}`;
    if (!enabled || !id) {
      lastKeyRef.current = '';
      setStreamUrl(''); setError(''); setLoading(false); return;
    }
    // Same title + same manual attempt → don't refetch (stops remount loop
    // from hammering Railway + bcdn with duplicate resolve calls).
    if (key === lastKeyRef.current && attempt === 0) return;
    if (attempt === 0) lastKeyRef.current = key;
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
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Server7/useHlsStream] resolve status:', r.status, 'has streamUrl:', Boolean(data?.streamUrl));
        }
        if (!r.ok) throw new Error(friendlyResolveError(r.status, data));
        if (!data?.streamUrl) throw new Error(friendlyResolveError(404, data));
        return data;
      })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        // streamUrl is ALREADY a Railway /proxy URL (same trusted IP that
        // fetched the signed bcdn link). Mount it directly — NO preflight
        // probe: extra Range fetches burst Railway's hikari edge limiter
        // and CAUSE the 429s we're trying to detect. Throttle handling
        // lives in HlsPlayer via media-element error + backoff.
        const finalSrc = d.streamUrl;
        const quals = Array.isArray(d.qualities) ? d.qualities : [];
        // Dedupe: same src → no state churn → no MediaPlayer remount loop.
        setStreamUrl((prev) => (prev === finalSrc ? prev : finalSrc));
        setHeaders((prev) => {
          const next = { userAgent: d.userAgent, referer: d.referer, origin: d.origin };
          return prev.userAgent === next.userAgent && prev.referer === next.referer && prev.origin === next.origin ? prev : next;
        });
        setTracks((prev) => {
          const next = Array.isArray(d.subtitles) ? d.subtitles : [];
          return prev.length === next.length && prev.every((t, i) => t.url === next[i]?.url) ? prev : next;
        });
        setQuality((prev) => (prev === (d.quality || '') ? prev : (d.quality || '')));
        setQualities((prev) => {
          if (prev.length === quals.length && prev.every((q, i) => q.url === quals[i]?.url)) return prev;
          return quals;
        });
        setProbe({ ok: true, throttled: false, status: 200 });
        setLoading(false);
      })
      .catch((e) => {
        if (ctrl.signal.aborted || e?.name === 'AbortError') return;
        setStreamUrl('');
        setProbe(null);
        setError(e?.message || 'Stream unavailable');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [type, id, season, episode, enabled, attempt]);

  return { streamUrl, headers, tracks, quality, qualities, probe, loading, error, retry };
}
