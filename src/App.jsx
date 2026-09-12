import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WatchPage from './pages/WatchPage';
import WatchLaterPage from './pages/WatchLaterPage';
import HistoryPage from './pages/HistoryPage';
import MoviesPage from './pages/MoviesPage';
import SeriesPage from './pages/SeriesPage';
import NewAndPopularPage from './pages/NewAndPopularPage';
import TVDetailPage from './pages/TVDetailPage';
import WatchTVPage from './pages/WatchTVPage';

/**
 * Application root. Installs client-side routing so the VidKing player can live
 * at /watch/:id while everything else stays on the home page.
 *
 * Note: With BrowserRouter, direct deep-links work in the Vite dev server. For
 * a static production host, configure a SPA fallback so unknown paths serve
 * index.html (e.g. rewrite /* -> / in the host's routing rules).
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/watch/:id" element={<WatchPage />} />
        <Route path="/watch/tv/:id/:season/:episode" element={<WatchTVPage />} />
        <Route path="/tv/:id" element={<TVDetailPage />} />
        <Route path="/watch-later" element={<WatchLaterPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/series" element={<SeriesPage />} />
        <Route path="/new-popular" element={<NewAndPopularPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}