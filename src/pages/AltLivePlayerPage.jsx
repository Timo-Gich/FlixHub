import { useParams } from 'react-router-dom';
import Footer from '../components/Footer';
import LiveVideoPlayer from '../components/LiveVideoPlayer';
import altLiveChannels from '../data/altLiveChannels';
import { LIVE_SERVERS } from '../services/liveServers';

export default function AltLivePlayerPage() {
  const { id } = useParams();
  const channel = altLiveChannels.find((item) => item.id === id) || null;

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <LiveVideoPlayer
        channel={channel}
        missing={!channel}
        backHref="/live"
        servers={LIVE_SERVERS}
        defaultServerId="alt"
      />
      <Footer />
    </div>
  );
}
