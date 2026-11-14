import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../hooks/useLibrary.jsx';

/**
 * Live channel tile with channel details and favorite controls.
 */
export default function LiveChannelCard({ channel, to: channelTo }) {
  const [imgFailed, setImgFailed] = useState(!channel?.logo);
  const [hover, setHover] = useState(false);
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

  const to = channelTo || `/live/${encodeURIComponent(channel.id)}`;

  const handleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFav(channel).then((next) => setSaved(next));
  };

  return (
    <Link
      to={to}
      aria-label={`Watch ${channel.name}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative block w-full overflow-hidden rounded-lg border
                  border-ink-border bg-ink-raised transition
                  ${hover ? 'z-10 scale-[1.02] border-brand/40 shadow-xl shadow-black/40' : ''}`}
    >
      {/* Logo header 16:9 */}
      <div className="relative aspect-video bg-black/50">
        {!imgFailed ? (
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-contain p-3"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-ink-raised to-ink">
            <span className="select-none text-4xl font-black text-white/25">
              {(channel.name || '?').trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> Live
        </span>
        {/* Favorite toggle */}
        <button
          type="button"
          onClick={handleFav}
          aria-label={saved ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
          title={saved ? 'Remove from favorites' : 'Add to favorites'}
          className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full
                      shadow transition ${saved ? 'bg-brand text-white' : 'bg-black/60 text-white/80 hover:bg-brand'}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? 'currentColor' : 'none'}
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        {/* Play affordance on hover */}
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center
                      bg-black/50 transition-opacity duration-200 ${hover ? 'opacity-100' : 'opacity-0'}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand shadow-lg shadow-brand/50 transition group-hover:scale-110"
                aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </div>

      {/* Channel details */}
      <div className="p-3">
        <p className="truncate text-sm font-bold text-white">{channel.name}</p>
        <p className="mt-1 truncate text-[11px] text-muted">
          {[channel.category, channel.country?.toUpperCase()].filter(Boolean).join(' · ') || 'Live channel'}
        </p>
      </div>
    </Link>
  );
}
