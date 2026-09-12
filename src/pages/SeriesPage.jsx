import CategoryPage from './CategoryPage';
import {
  fetchTrendingTV,
  fetchPopularTV,
  fetchOnTheAirTV,
} from '../services/tmdbService';

/** /series — TV shows powered by TMDb TV endpoints. */
export default function SeriesPage() {
  return (
    <CategoryPage
      title="Series"
      rows={[
        { id: 'trending', title: 'Trending Shows', fetcher: () => fetchTrendingTV() },
        { id: 'popular', title: 'Popular Shows', fetcher: () => fetchPopularTV() },
        { id: 'on-the-air', title: 'On the Air', fetcher: () => fetchOnTheAirTV() },
      ]}
    />
  );
}