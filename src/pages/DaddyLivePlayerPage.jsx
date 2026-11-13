import { useParams } from 'react-router-dom';
import Footer from '../components/Footer';
import LiveVideoPlayer from '../components/LiveVideoPlayer';
import { DADDYLIVE_CHANNELS } from '../data/daddyliveChannels';
import { DADDYLIVE_SERVERS } from '../services/liveServers';

export default function DaddyLivePlayerPage() {
  const { id } = useParams();
  const channel = DADDYLIVE_CHANNELS.find((item) => item.id === id) || null;

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <LiveVideoPlayer
        channel={channel}
        missing={!channel}
        backHref="/live/daddylive"
        servers={DADDYLIVE_SERVERS}
        defaultServerId="daddylive-server1"
      />
      <Footer />
    </div>
  );
}
