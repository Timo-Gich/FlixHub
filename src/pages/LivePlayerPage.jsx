import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Footer from '../components/Footer';
import LiveVideoPlayer from '../components/LiveVideoPlayer';
import { fetchPlaylist } from '../services/liveTvService';
import { IPTV_SERVERS } from '../services/liveServers';

function safeDecode(param) {
  try {
    return decodeURIComponent(param || '');
  } catch {
    return param || '';
  }
}

/**
 * /live/:channelId — self-hosted HLS player.
 */
export default function LivePlayerPage() {
  const { channelId } = useParams();
  const decoded = safeDecode(channelId);

  const [channel, setChannel] = useState(null);
  const [missing, setMissing] = useState(false);

  // Resolve the channel and its backend stream endpoint from the server cache.
  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    setChannel(null);
    fetchPlaylist().then((list) => {
      if (cancelled) return;
      const found = list.find((c) => c.id === decoded || c.tvgId === decoded) ?? null;
      setChannel(found);
      if (!found) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [decoded]);

return (
    <div className="min-h-screen bg-ink text-foreground">
      <LiveVideoPlayer
        channel={channel}
        missing={missing}
        backHref="/live"
        servers={IPTV_SERVERS}
        defaultServerId="iptv"
      />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-8">
        {/* Channel identity */}
        {channel && (
          <div className="mb-4 flex items-center gap-3">
            {channel.logo ? (
              <img
                src={channel.logo}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="h-12 w-12 shrink-0 rounded-lg border border-ink-border bg-ink-raised object-contain p-1"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ink-raised text-xl font-black text-white/40">
                {(channel.name || '?').trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black text-white">{channel.name}</h1>
              <p className="flex items-center gap-2 text-xs text-muted">
                {channel.category && <span>{channel.category}</span>}
                {channel.country && <span>· {channel.country.toUpperCase()}</span>}
                <span className="inline-flex items-center gap-1 text-brand-light">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-light" aria-hidden="true" />
                  LIVE
                </span>
              </p>
            </div>
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
}
