import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../hooks/useLibrary.jsx';

/**
 * Live channel tile with channel details and favorite controls.
 */
export default function LiveChannelCard({ channel, to: channelTo }) {
  const [imgFailed, setImgFailed] = useState(!channel?.logo);
  const { isFavLive, toggleFav } = useLibrary();
  const [saved, setSaved] = useState(() =>
    channel?.id ? isFavLive(channel.id) : false,
  );

  useEffect(() => {
    if (!channel?.id) return;
    setSaved(isFavLive(channel.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, channel?.logo, isFavLive]);

  if (!channel) return null;

  const to = channelTo || (
    channel.source === 'daddylive'
      ? `/live/daddylive/${encodeURIComponent(channel.id)}`
      : `/live/${encodeURIComponent(channel.id)}`
  );

  const handleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFav(channel).then((next) => setSaved(next));
  };

  return (
    <Link
      to={to}
      aria-label={`Watch ${channel.name}`}
      className="group relative block w-full overflow-hidden rounded-2xl border border-white/[0.09] bg-[#17171c] transition duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-2xl hover:shadow-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-white/[0.09] via-[#17171c] to-brand/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.08),transparent_65%)]" aria-hidden="true" />
        {!imgFailed ? (
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-contain p-6 transition duration-500 group-hover:scale-105 sm:p-7"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 select-none items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-4xl font-black text-white/40">
              {(channel.name || '?').trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow-lg backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> Live
        </span>
        <button
          type="button"
          onClick={handleFav}
          aria-label={saved ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
          title={saved ? 'Remove from favorites' : 'Add to favorites'}
          className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 shadow-lg backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
            saved ? 'bg-brand text-white' : 'bg-black/55 text-white/80 hover:border-brand/60 hover:bg-brand hover:text-white'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? 'currentColor' : 'none'}
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand shadow-xl shadow-brand/40 transition duration-200 group-hover:scale-110" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </div>

      <div className="px-3.5 pb-4 pt-3 sm:px-4">
        <p className="truncate text-sm font-bold text-white sm:text-[15px]">{channel.name}</p>
        <div className="mt-2 flex min-h-5 items-center gap-2">
          {channel.category && (
            <span className="max-w-[75%] truncate rounded-md bg-white/[0.07] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/60">
              {channel.category}
            </span>
          )}
          {channel.country && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {channel.country}
            </span>
          )}
          {!channel.category && !channel.country && (
            <span className="text-[11px] text-white/40">Live channel</span>
          )}
        </div>
      </div>
    </Link>
  );
}
