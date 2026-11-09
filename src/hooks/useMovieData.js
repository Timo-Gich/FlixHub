import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Small data-fetching hook with graceful loading / error states.
 *
 * A fresh request runs whenever `deps` change (and again after `reload()`).
 * Failed requests are retried with exponential backoff, and a restored network
 * connection triggers an immediate retry. Errors are exposed only after the
 * automatic retries are exhausted.
 *
 * @param {() => Promise<any>} fetcher  async function returning the payload
 * @param {Array} [deps]                values that trigger a refetch
 * @returns {{ data:any, loading:boolean, error:Error|null, reload:()=>void }}
 */
export function useMovieData(fetcher, deps = []) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: null });

  // Always call the latest fetcher without re-triggering the effect on every
  // render (callers often pass inline arrow functions).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    let retryTimer;
    let cancelRetry;

    // Enter loading state if we're (re)running, but don't blow away previous
    // data if we already have it — keeps stale-while-revalidate feel.
    setState((prev) => (prev.data ? prev : { data: null, loading: true, error: null }));
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const fetchWithRetry = async () => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const res = await fetcherRef.current();
          if (active) setState({ data: res, loading: false, error: null });
          return;
        } catch (err) {
          if (!active) return;
          if (attempt === MAX_RETRIES) {
            setState({ data: null, loading: false, error: err });
            return;
          }

          await new Promise((resolve) => {
            cancelRetry = resolve;
            retryTimer = setTimeout(() => {
              cancelRetry = null;
              resolve();
            }, RETRY_DELAY_MS * (2 ** attempt));
          });
        }
      }
    };

    const handleOnline = () => reload();
    window.addEventListener('online', handleOnline);
    fetchWithRetry();

    return () => {
      active = false;
      clearTimeout(retryTimer);
      cancelRetry?.();
      window.removeEventListener('online', handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload };
}