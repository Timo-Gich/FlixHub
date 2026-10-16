import { Link } from 'react-router-dom';
import { formatClock } from '../services/liveTvService';

const PX_PER_MIN = 4; // 30min = 120px
const SLOT_MIN = 30;

function fmtSlot(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Professional EPG timeline: frozen logo column + scrollable programme blocks
 * with a red NOW line. Rows virtualized by parent (only visible slice passed).
 */
export default function LiveGuide({ rows = [], winStart = 0, winEnd = 0, clock = Date.now(), epgStatus = 'idle' }) {
  const totalMin = Math.max(60, (winEnd - winStart) / 60000);
  const width = totalMin * PX_PER_MIN;
  const nowLeft = ((clock - winStart) / 60000) * PX_PER_MIN;
  const slots = [];
  for (let t = winStart; t < winEnd; t += SLOT_MIN * 60000) slots.push(t);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-border bg-ink-soft">
      <div className="flex items-center justify-between gap-3 border-b border-ink-border px-4 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          TV Guide <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand-light">LIVE</span>
        </p>
        <p className="text-xs text-muted">
          {epgStatus === 'loading' ? 'Loading guide…' : epgStatus === 'empty' ? 'No guide data — showing channels' : `${fmtSlot(winStart)} – ${fmtSlot(winEnd)}`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <div style={{ width: 200 + width }}>
          {/* time ruler */}
          <div className="flex border-b border-ink-border">
            <div className="sticky left-0 z-10 w-[200px] shrink-0 bg-ink-soft px-4 py-2 text-xs font-bold text-muted">Channel</div>
            <div className="relative flex-1">
              <div className="flex">
                {slots.map((s) => (
                  <span key={s} className="shrink-0 border-l border-ink-border/60 px-2 py-2 text-[11px] font-semibold text-muted" style={{ width: SLOT_MIN * PX_PER_MIN }}>
                    {formatClock(s)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {/* rows */}
          {rows.map(({ channel, progs }) => (
            <div key={channel.id} className="flex border-b border-ink-border/50 last:border-0 hover:bg-white/[0.02]">
              <Link to={`/live/${encodeURIComponent(channel.id)}`} className="sticky left-0 z-10 flex w-[200px] shrink-0 items-center gap-2.5 bg-ink-soft px-3 py-2">
                {channel.logo ? (
                  <img src={channel.logo} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="h-8 w-12 shrink-0 rounded border border-ink-border bg-black/50 object-contain p-1" />
                ) : (
                  <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded bg-white/10 text-sm font-black text-white/50">
                    {(channel.name || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-white">{channel.name}</span>
                  <span className="block text-[10px] text-muted">{channel.category || ''}</span>
                </span>
              </Link>
              <div className="relative flex-1 py-1.5" style={{ minWidth: width }}>
                <div className="relative flex h-[52px] gap-1 px-1">
                  {progs.length === 0 && (
                    <span className="flex items-center px-2 text-xs text-muted/60">No guide info</span>
                  )}
                  {progs.map((p, i) => {
                    const durMin = Math.max(15, (p.stopMs - p.startMs) / 60000);
                    const isNow = p.startMs <= clock && clock < p.stopMs;
                    return (
                      <Link key={`${p.startMs}-${i}`} to={`/live/${encodeURIComponent(channel.id)}`} title={`${p.title} · ${fmtSlot(p.startMs)}–${fmtSlot(p.stopMs)}`}
                        style={{ width: durMin * PX_PER_MIN }}
                        className={`flex shrink-0 flex-col justify-center overflow-hidden rounded-md border px-2.5 transition ${
                          isNow ? 'border-brand/60 bg-brand/20 hover:bg-brand/30' : 'border-ink-border bg-ink-raised hover:border-brand/40 hover:bg-ink-border/60'
                        }`}>
                        <span className={`truncate text-xs font-semibold ${isNow ? 'text-white' : 'text-white/85'}`}>{p.title}</span>
                        <span className="truncate text-[10px] text-muted">{fmtSlot(p.startMs)} – {fmtSlot(p.stopMs)}</span>
                      </Link>
                    );
                  })}
                  {nowLeft >= 0 && nowLeft <= width && (
                    <span className="pointer-events-none absolute top-0 h-full w-0.5 bg-brand shadow-[0_0_8px_rgba(229,9,20,0.9)]" style={{ left: nowLeft }} />
                  )}
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">No channels in this view.</p>
          )}
        </div>
      </div>
    </div>
  );
}
