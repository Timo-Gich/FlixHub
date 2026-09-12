import CategoryPage from './CategoryPage';
import {
  fetchTrendingMovies,
  fetchPopularMovies,
  fetchUpcomingMovies,
} from '../services/tmdbService';

/** /new-popular — trending, popular and upcoming titles. */
export default function NewAndPopularPage() {
  return (
    <CategoryPage
      title="New & Popular"
      rows={[
        { id: 'trending', title: 'Trending Now', fetcher: () => fetchTrendingMovies() },
        { id: 'popular', title: 'Popular', fetcher: () => fetchPopularMovies() },
        { id: 'upcoming', title: 'Upcoming', fetcher: () => fetchUpcomingMovies() },
      ]}
    />
  );
}