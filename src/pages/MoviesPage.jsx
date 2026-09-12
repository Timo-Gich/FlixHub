import CategoryPage from './CategoryPage';
import {
  fetchNowPlayingMovies,
  fetchTopRatedMovies,
  fetchPopularMovies,
} from '../services/tmdbService';

/** /movies — curated movie sections. */
export default function MoviesPage() {
  return (
    <CategoryPage
      title="Movies"
      rows={[
        { id: 'now-playing', title: 'Now Playing', fetcher: () => fetchNowPlayingMovies() },
        { id: 'top-rated', title: 'Top Rated', fetcher: () => fetchTopRatedMovies() },
        { id: 'popular', title: 'Popular', fetcher: () => fetchPopularMovies() },
      ]}
    />
  );
}