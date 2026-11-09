import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MovieCard from './MovieCard';
import SectionHeading from './SectionHeading';

const rowCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

export default function DiscoveryRow({ id, title, description, fetcher, seeAll }) {
  const sectionRef = useRef(null);
  const railRef = useRef(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cached = rowCache.get(id);
  const hasFreshCache = cached && Date.now() - cached.savedAt < CACHE_DURATION;
  const [visible, setVisible] = useState(false);
  const [results, setResults] = useState(hasFreshCache ? cached.results : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px' },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || results || error) return undefined;
    let active = true;
    setLoading(true);
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((response) => {
        const items = Array.isArray(response) ? response : response?.results ?? [];
        if (!active) return;
        setResults(items);
        rowCache.set(id, { results: items, savedAt: Date.now() });
      })
      .catch((requestError) => {
        if (active) setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [error, id, retryCount, results, visible]);

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.8,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section
      ref={sectionRef}
      aria-label={title}
      className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8"
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <SectionHeading className="text-xl md:text-2xl">{title}</SectionHeading>
          {description && <p className="mt-2 text-sm text-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {seeAll && (
            <Link
              to={seeAll}
              className="hidden text-sm font-semibold text-muted transition hover:text-white sm:inline"
            >
              See all <span aria-hidden="true">→</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => scrollRail(-1)}
            aria-label={`Scroll ${title} left`}
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-ink-border
                       bg-ink-soft text-white transition hover:border-brand hover:bg-brand md:flex"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={() => scrollRail(1)}
            aria-label={`Scroll ${title} right`}
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-ink-border
                       bg-ink-soft text-white transition hover:border-brand hover:bg-brand md:flex"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex gap-3 overflow-hidden sm:gap-4" aria-label={`Loading ${title}`}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[2/3] w-[38vw] shrink-0 animate-pulse rounded-md bg-ink-raised
                         sm:w-[25vw] md:w-[19vw] lg:w-[15vw] xl:w-[12.5vw]"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-6 text-center">
          <p className="mb-3 text-sm text-foreground">We couldn’t load this collection.</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRetryCount((count) => count + 1);
            }}
            className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-dark"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && results?.length === 0 && (
        <p className="py-6 text-sm text-muted">No titles to show right now.</p>
      )}

      {!loading && !error && results?.length > 0 && (
        <div
          ref={railRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2
                     [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4"
        >
          {results.map((movie) => (
            <div
              key={`${movie.media_type ?? 'title'}-${movie.id}`}
              className="w-[38vw] shrink-0 snap-start sm:w-[25vw] md:w-[19vw] lg:w-[15vw] xl:w-[12.5vw]"
            >
              <MovieCard movie={movie} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
