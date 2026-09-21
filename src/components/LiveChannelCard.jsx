import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  subscribeLibrary,
  isFavLive,
  toggleFavLive,
} from '../services/libraryService';

/**
 * A single live-channel tile for the /live browser.
 *
 * Shows the logo (falling back to an initial badge), the channel name, its
 * category tag and country badge, a play affordance on hover, and a favorite
 * (✚/♥) toggle. The whole card links to /live/:channelId.
 *
 * Props:
 *   - channel : a LiveChannel (id, name, logo, category, country, streamUrl, tvgId)
 */
export default function LiveChannelCard({ channel }) {
  const [imgFailed, setImgFailed] = useState(!channel?.logo);
  const [hover, setHover] = useState(false);
  const [saved, setSaved] = useState(() =>
    channel?.id ? isFavLive(channel.id) : false,
  );

  useEffect(() => {
    if (!channel?.id) return;
    setSaved(isFavLive(channel.id));
    return subscribeLibrary(() => setSaved(isFavLive(channel.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, channel?.logo]);

  if (!channel) return null;

  const to = `/live/${encodeURIComponent(channel.id)}`;
  const countryBadge = channel.country ? channel.country.toUpperCase() : null;

  const handleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSaved(toggleFavLive(channel));
  };

  return (
    <Link
      to={to}
      aria-label={`Watch ${channel.name}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative block aspect-[4/5] w-full overflow-hidden rounded-lg border
                  border-ink-border bg-ink-raised transition
                  ${hover ? 'z-10 scale-[1.02] border-brand/40 shadow-xl shadow-black/40' : ''}`}
    >
      {/* Logo or initial placeholder */}
      <div className="absolute inset-0">
        {!imgFailed ? (
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full p-3 object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-ink-raised to-ink">
            <span className="select-none text-5xl font-black text-white/25">
              {(channel.name || '?').trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Bottom strip */}
      <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-10">
        <p className="line-clamp-2 text-shadow-hero text-sm font-semibold leading-tight text-white">
          {channel.name}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {channel.category && (
            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-light">
              {channel.category}
            </span>
          )}
          {countryBadge && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">
              {countryBadge}
              <span className="ml-1 opacity-60">● LIVE</span>
            </span>
          )}
        </div>
      </div>

      {/* Play affordance on hover */}
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center
                    bg-black/50 transition-opacity duration-200 ${hover ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand shadow-lg shadow-brand/50 transition group-hover:scale-110"
              aria-hidden="true">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
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
    </Link>
  );
}