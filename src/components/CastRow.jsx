import { useCallback, useEffect, useRef, useState } from 'react';
import { getProfileUrl } from '../services/tmdbService';
import SectionHeading from './SectionHeading';

/**
 * Horizontal, horizontally-scrollable cast row used on movie / TV detail pages.
 * Shows circular actor headshots with the person's name and the character they
 * play. Entries without a profile image are skipped so the row stays clean.
 *
 * Props:
 *   - people : an array of TMDb credit objects (from credits.cast)
 */
export default function CastRow({ people = [] }) {
  const cast = (people ?? []).filter((p) => p.profile_path && p.name).slice(0, 20);
  const rowRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setCanScrollLeft(row.scrollLeft > 0);
    setCanScrollRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollArrows();
    window.addEventListener('resize', updateScrollArrows);
    return () => window.removeEventListener('resize', updateScrollArrows);
  }, [cast.length, updateScrollArrows]);

  const scrollRow = (direction) => {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (cast.length === 0) return null;

  return (
    <section aria-label="Cast" className="group/cast mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
      <SectionHeading className="mb-4 text-xl md:text-2xl">Cast</SectionHeading>

      <div className="relative">
        <div
          ref={rowRef}
          onScroll={updateScrollArrows}
          className="scrollbar-hide -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8"
        >
          {cast.map((person) => (
            <div key={person.id} className="w-24 shrink-0 snap-start text-center sm:w-28">
              <img
                src={getProfileUrl(person.profile_path)}
                alt={person.name}
                loading="lazy"
                className="aspect-square w-full rounded-full border-2 border-ink-border object-cover bg-ink-raised"
              />
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{person.name}</p>
              {person.character && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{person.character}</p>
              )}
            </div>
          ))}
        </div>

        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollRow(-1)}
            aria-label="Scroll Cast row left"
            title="Scroll left"
            className="pointer-events-none absolute left-0 top-1/2 z-[60] hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                       rounded-full border border-ink-border bg-ink-raised/90 text-white opacity-0 shadow transition
                       group-hover/cast:pointer-events-auto group-hover/cast:opacity-100 hover:bg-brand md:flex"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollRow(1)}
            aria-label="Scroll Cast row right"
            title="Scroll right"
            className="pointer-events-none absolute right-0 top-1/2 z-[60] hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                       rounded-full border border-ink-border bg-ink-raised/90 text-white opacity-0 shadow transition
                       group-hover/cast:pointer-events-auto group-hover/cast:opacity-100 hover:bg-brand md:flex"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}