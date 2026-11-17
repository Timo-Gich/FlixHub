import { useCallback, useEffect, useRef, useState } from 'react';

export default function HorizontalScrollRail({ label, contentLength, className, children }) {
  const railRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setCanScrollLeft(rail.scrollLeft > 0);
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollArrows();
    window.addEventListener('resize', updateScrollArrows);
    return () => window.removeEventListener('resize', updateScrollArrows);
  }, [contentLength, updateScrollArrows]);

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="group/rail relative">
      <div
        ref={railRef}
        onScroll={updateScrollArrows}
        className={className}
      >
        {children}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollRail(-1)}
          aria-label={`Scroll ${label} row left`}
          title="Scroll left"
          className="pointer-events-none absolute left-0 top-1/2 z-[60] hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                     rounded-full border border-ink-border bg-ink-raised/90 text-white opacity-0 shadow transition
                     group-hover/rail:pointer-events-auto group-hover/rail:opacity-100 focus-visible:pointer-events-auto
                     focus-visible:opacity-100 hover:bg-brand md:flex"
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
          onClick={() => scrollRail(1)}
          aria-label={`Scroll ${label} row right`}
          title="Scroll right"
          className="pointer-events-none absolute right-0 top-1/2 z-[60] hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                     rounded-full border border-ink-border bg-ink-raised/90 text-white opacity-0 shadow transition
                     group-hover/rail:pointer-events-auto group-hover/rail:opacity-100 focus-visible:pointer-events-auto
                     focus-visible:opacity-100 hover:bg-brand md:flex"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
