import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small data-fetching hook with graceful loading / error states.
 *
 * A fresh request runs whenever `deps` change (and again after `reload()`),
 * protecting against setting state on an unmounted component via a cancelled
 * flag. Errors are normalised and exposed alongside `loading`, so consumers
 * never need to try/catch.
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

    // Enter loading state if we're (re)running, but don't blow away previous
    // data if we already have it — keeps stale-while-revalidate feel.
    setState((prev) => (prev.data ? prev : { data: null, loading: true, error: null }));
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetcherRef
      .current()
      .then((res) => {
        if (active) setState({ data: res, loading: false, error: null });
      })
      .catch((err) => {
        if (active) setState({ data: null, loading: false, error: err });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload };
}