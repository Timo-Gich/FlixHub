import { useEffect, useRef, useState } from 'react';

/**
 * Single collapsed dropdown that shows the active embed server and lets the
 * user switch between Server 1 / Server 2 / Server 3. Placed in the player's
 * top bar to keep the player controls minimal.
 *
 * Props:
 *   - servers        : array from useEmbedServer ({ id, label, provider, usesImdb, available })
 *   - activeServerId : currently selected server id
 *   - onSelect       : (serverId) => void
 *   - loadingImdb    : while true, show a spinner on the trigger when the active
 *                      server is the IMDb-based one
 */
export default function ServerDropdown({
  servers = [],
  activeServerId,
  onSelect,
  loadingImdb = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const active = servers.find((s) => s.id === activeServerId) ?? servers[0];
  const activeLoading = active?.usesImdb && loadingImdb;

  // Close the menu on outside click or Escape.
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

  return (
    <div ref={ref} className="relative inline-block shrink-0 text-left">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white
                   ring-1 ring-ink-border transition hover:bg-zinc-700 active:scale-[0.98]"
      >
        {activeLoading ? (
          <span
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
            aria-hidden="true"
          />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0 rounded bg-red-600" aria-hidden="true" />
        )}
        <span>{active ? active.label : 'Server'}</span>
        {active?.provider && (
          <span className="hidden text-[10px] font-normal text-gray-400 sm:inline">
            {active.provider}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Menu */}
      {open && (
        <ul
          role="listbox"
          aria-label="Select server"
          className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md
                     border border-ink-border bg-zinc-900 py-1 shadow-xl"
        >
          {servers.map((server) => {
            const isActive = server.id === activeServerId;
            const disabled = server.usesImdb && !server.available && !loadingImdb;
            return (
              <li key={server.id} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  disabled={disabled}
                  title={disabled ? 'Not available for this title' : undefined}
                  onClick={() => {
                    onSelect(server.id);
                    setOpen(false);
                  }}
                  className={[
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ',
                    isActive
                      ? 'bg-red-600 text-white'
                      : disabled
                        ? 'cursor-not-allowed text-gray-500'
                        : 'text-gray-200 hover:bg-zinc-800',
                  ].join('')}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold leading-tight">{server.label}</span>
                    <span
                      className={`text-[10px] leading-tight ${
                        isActive ? 'text-white/70' : 'text-gray-400'
                      }`}
                    >
                      {server.provider}
                    </span>
                  </span>
                  {disabled ? (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      Unavailable
                    </span>
                  ) : isActive ? (
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