import { Link } from 'react-router-dom';
import { formatRange, programmeProgress } from '../services/liveTvService';

/**
 * On-Now hero rail: featured live channel with progress + Watch button.
 */
export default function LiveHero({ items = [], clock = Date.now() }) {
  if (!items.length) return null;
  const [first, ...rest] = items;
  const pct = programmeProgress(first.info.now, clock);
  return (
    <section aria-label="On now" className="overflow-hidden rounded-xl border border-ink-border bg-ink-soft">
      <div className="flex flex-col md:flex-row">
        <Link
          to={`/live/${encodeURIComponent(first.ch.id)}`}
          className="group relative flex flex-1 items-center gap-4 bg-gradient-to-br from-brand/25 via-ink-soft to-ink p-5 sm:p-6"
        >
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> On now
          </span>
          {first.ch.logo ? (
            <img src={first.ch.logo} alt="" loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              className="mt-6 h-20 w-20 shrink-0 rounded-xl border border-white/10 bg-black/40 object-contain p-2 sm:h-24 sm:w-24" />
          ) : (
            <span className="mt-6 flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white/10 text-3xl font-black text-white/60">
              {(first.ch.name || '?').charAt(0)}
            </span>
          )}
          <span className="mt-6 min-w-0">
            <span className="block truncate text-lg font-black text-white sm:text-2xl">{first.ch.name}</span>
            <span className="mt-1 block truncate text-sm font-semibold text-brand-light">{first.info.now.title}</span>
            <span className="mt-1 block text-xs text-muted">{formatRange(first.info.now.startMs, first.info.now.stopMs)}{first.info.next ? `  ·  Next: ${first.info.next.title}` : ''}</span>
            {pct != null && (
              <span className="mt-3 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(pct * 100)}%` }} />
              </span>
            )}
            <span className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-bold text-white transition group-hover:bg-brand-dark">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M8 5v14l11-7z" /></svg>
              Watch live
            </span>
          </span>
        </Link>
        {rest.length > 0 && (
          <div className="grid shrink-0 grid-cols-2 gap-px bg-ink-border md:w-[380px] md:grid-cols-1 md:overflow-y-auto md:max-h-[240px]">
            {rest.slice(0, 4).map(({ ch, info }) => (
              <Link key={ch.id} to={`/live/${encodeURIComponent(ch.id)}`}
                className="flex items-center gap-3 bg-ink-soft px-4 py-3 transition hover:bg-ink-raised">
                {ch.logo ? (
                  <img src={ch.logo} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="h-9 w-14 shrink-0 rounded border border-ink-border bg-black/40 object-contain p-1" />
                ) : (
                  <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-white/10 text-sm font-black text-white/60">
                    {(ch.name || '?').charAt(0)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-white">{ch.name}</span>
                  <span className="block truncate text-xs text-muted">{info.now.title}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
