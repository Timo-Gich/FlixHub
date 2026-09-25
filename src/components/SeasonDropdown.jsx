import { useEffect, useRef, useState } from 'react';

/**
 * Custom season picker for the series detail page.
 *
 * Replaces the native <select> with a fully-styled dropdown so we can control
 * its appearance (Oswald display font, pill shape, brand accents) and make the
 * trigger icon interactive: a down chevron when collapsed, which switches to an
 * ✕ when the list is open (mirroring the app's nav hamburger → ✕ toggle).
 *
 * Props:
 *   - seasons : TMDb season objects [{ season_number, episode_count }]
 *   - value   : currently selected season number
 *   - onChange: (seasonNumber) => void
 */
export default function SeasonDropdown({ seasons = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click or Escape (same pattern as ServerDropdown).
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = seasons.find((s) => s.season_number === value) ?? seasons[0];

  return (
    <div ref={ref} className="relative inline-block shrink-0 text-left">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Season — ${active ? `Season ${active.season_number}` : 'select'}`}
        style={{ fontFamily: 'var(--font-display)' }}
        className="inline-flex items-center gap-2.5 rounded-full border border-ink-border bg-ink-raised py-1.5 pl-3.5 pr-3.5
                   text-sm font-semibold tracking-wide text-foreground shadow-md shadow-black/30 outline-none transition
                   hover:border-brand/60 focus:border-brand focus:ring-2 focus:ring-brand/40 active:scale-[0.98]"
      >
        <span>{active ? `Season ${active.season_number}` : 'Season'}</span>
        {/* Icon toggles: down chevron when collapsed → ✕ when open. */}
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 text-muted ${open ? 'text-brand-light' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <path d="M6 9l6 6 6-6" />
          )}
        </svg>
      </button>

      {/* Menu */}
      {open && (
        <ul
          role="listbox"
          aria-label="Season"
          className="absolute left-0 top-full z-50 mt-2 min-w-full overflow-hidden rounded-lg
                     border border-ink-border bg-ink-raised py-1 shadow-2xl shadow-black/40"
        >
          {seasons.map((s) => {
            const isActive = s.season_number === value;
            return (
              <li key={s.season_number} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(s.season_number);
                    setOpen(false);
                  }}
                  style={{ fontFamily: 'var(--font-display)' }}
                  className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm font-semibold transition ${
                    isActive
                      ? 'bg-brand/10 text-foreground'
                      : 'text-muted hover:bg-ink-soft hover:text-foreground'
                  }`}
                >
                  <span>Season {s.season_number}</span>
                  {s.episode_count ? (
                    <span className={`ml-auto text-[10px] font-normal ${isActive ? 'text-brand-light' : 'text-muted'}`}>
                      {s.episode_count} eps
                    </span>
                  ) : null}
                  {isActive ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}