import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MovieRow from '../components/MovieRow';

/**
 * A generic collection page: a heading followed by one or more self-fetching
 * content rows. Used by the Series / Movies / New & Popular routes.
 * Props:
 *   - title: page heading
 *   - rows : [{ id, title, fetcher }]
 */
export default function CategoryPage({ title, rows }) {
  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="pt-24">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-2 sm:px-8">
          <h1 className="text-3xl font-black text-white">{title}</h1>
        </div>
        {rows.map((row) => (
          <MovieRow key={row.id} title={row.title} fetcher={row.fetcher} />
        ))}
      </main>

      <Footer />
    </div>
  );
}