import { useEffect } from 'react';

export default function TrailerModal({ videoKey, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trailer-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl rounded-lg border border-ink-border bg-ink-soft p-3 shadow-2xl sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="trailer-modal-title" className="text-lg font-bold text-white">
            Watch Trailer
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="rounded-md p-2 text-foreground transition hover:bg-ink-raised hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
        <div className="aspect-video overflow-hidden rounded-md bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0`}
            title="YouTube trailer"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}
