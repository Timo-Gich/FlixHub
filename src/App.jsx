import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { isPlayerPath, saveScroll, readScroll } from './services/scrollMem';
import HomePage from './pages/HomePage';
import WatchPage from './pages/WatchPage';
import WatchLaterPage from './pages/WatchLaterPage';
import HistoryPage from './pages/HistoryPage';
import MoviesPage from './pages/MoviesPage';
import SeriesPage from './pages/SeriesPage';
import NewAndPopularPage from './pages/NewAndPopularPage';
import TVDetailPage from './pages/TVDetailPage';
import WatchTVPage from './pages/WatchTVPage';
import MovieDetailPage from './pages/MovieDetailPage';
import ImdbDetailPage from './pages/ImdbDetailPage';
import ImdbWatchPage from './pages/ImdbWatchPage';
import InfoPage from './pages/InfoPage';
import { AuthProvider } from './context/AuthContext';
import BottomNav from './components/BottomNav';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import AccountPage from './pages/AccountPage';

// Live TV pages are loaded on demand so the heavy Vidstack player stays out of
// the initial bundle for the movies/series browsing routes.
const LiveTVPage = lazy(() => import('./pages/LiveTVPage'));
const LivePlayerPage = lazy(() => import('./pages/LivePlayerPage'));

/**
 * Application root. Installs client-side routing so the VidKing player can live
 * at /watch/:id while everything else stays on the home page.
 *
 * Note: With BrowserRouter, direct deep-links work in the Vite dev server. For
 * a static production host, configure a SPA fallback so unknown paths serve
 * index.html (e.g. rewrite /* -> / in the host's routing rules).
 *
 * Vercel Web Analytics is bound to the router so pageviews are reported on every
 * route change. We use `@vercel/analytics/react` (the entry for React/Vite apps)
 * because this project is Vite + React, not Next.js — the `/next` entry imports
 * `next/navigation`, which isn't installed here and would break the build.
 */
function VercelAnalytics() {
  const location = useLocation();
  return (
    <Analytics
      route={location.pathname}
      path={location.pathname + location.search}
    />
  );
}

/**
 * Restores / remembers each route's vertical scroll position so "back" lands
 * the user where they left off (a standard pattern in streaming apps).
 * Full-screen players are excluded — they ignore scroll restoration.
 */
function ScrollMem() {
  const { pathname } = useLocation();

  // On arrival, restore this page's saved offset (0 for players / first visit).
  useEffect(() => {
    window.scrollTo(0, isPlayerPath(pathname) ? 0 : readScroll(pathname));
  }, [pathname]);

  // While on a page, follow its scrolling; persist the final offset on leave.
  useEffect(() => {
    if (isPlayerPath(pathname)) return;
    const onScroll = () => saveScroll(pathname);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      saveScroll(pathname); // capture the position we're leaving from
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <VercelAnalytics />
      <ScrollMem />
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-ink">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
          </div>
        }
      >
        <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/watch/:id" element={<WatchPage />} />
        <Route path="/movie/:id" element={<MovieDetailPage />} />
        <Route path="/imdb/:imdbId" element={<ImdbDetailPage />} />
        <Route path="/watch/imdb/:imdbId" element={<ImdbWatchPage />} />
        <Route path="/watch/tv/:id/:season/:episode" element={<WatchTVPage />} />
        <Route path="/tv/:id" element={<TVDetailPage />} />
        <Route path="/watch-later" element={<WatchLaterPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/series" element={<SeriesPage />} />
        <Route path="/new-popular" element={<NewAndPopularPage />} />
        <Route path="/live" element={<LiveTVPage />} />
        <Route path="/live/:channelId" element={<LivePlayerPage />} />
        <Route path="/about" element={<InfoPage />} />
        <Route path="/careers" element={<InfoPage />} />
        <Route path="/press" element={<InfoPage />} />
        <Route path="/investors" element={<InfoPage />} />
        <Route path="/terms" element={<InfoPage />} />
        <Route path="/privacy" element={<InfoPage />} />
        <Route path="/cookies" element={<InfoPage />} />
        <Route path="/legal" element={<InfoPage />} />
        <Route path="/accessibility" element={<InfoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>

      {/* Mobile bottom navigation (md:hidden) + spacer so content isn't obscured */}
      <BottomNav />
      <div className="h-14 md:hidden" aria-hidden="true" />
    </BrowserRouter>
    </AuthProvider>
  );
}