import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MovieCard from '../components/MovieCard';
import SectionHeading from '../components/SectionHeading';
import SyncNudge from '../components/SyncNudge';
import ConfirmDialog from '../components/ConfirmDialog';
import { useLibrary } from '../hooks/useLibrary.jsx';
import { getPosterUrl } from '../services/tmdbService';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'year', label: 'Release year' },
  { value: 'rating', label: 'Rating' },
];

function CollectionIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2h7.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

function CollectionArtwork({ posters }) {
  const images = posters.slice(0, 4)
    .map((movie) => ({ path: movie.poster_path, url: getPosterUrl(movie.poster_path, 342) }))
    .filter((poster) => poster.url);

  if (!images.length) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand/30 via-ink-raised to-ink">
        <CollectionIcon className="h-9 w-9 text-white/30" />
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <img src={images[0].url} alt="" aria-hidden="true" className="h-full w-full scale-110 object-cover blur-[2px]" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden">
      {images.map((image, index) => (
        <img
          key={`${image.path}-${index}`}
          src={image.url}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ))}
    </div>
  );
}

export default function WatchLaterPage() {
  const {
    watchLater: items,
    collections,
    toggleSaved,
    createCollection,
    renameCollection,
    deleteCollection,
    moveMovieToCollection,
    syncing,
  } = useLibrary();
  const [sort, setSort] = useState('recent');
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [draggedMovieId, setDraggedMovieId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  const validItems = items.filter((entry) => entry?.movie?.id != null);
  const visibleItems = validItems.filter((entry) => {
    if (selectedCollection === 'all') return true;
    return entry.collectionId === selectedCollection;
  });
  const sorted = [...visibleItems].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.savedAt - b.savedAt;
      case 'title':
        return (a.movie.title || '').localeCompare(b.movie.title || '');
      case 'year':
        return (b.movie.release_date || a.movie.release_date || '').localeCompare(
          a.movie.release_date || b.movie.release_date || '',
        );
      case 'rating':
        return (b.movie.vote_average || 0) - (a.movie.vote_average || 0);
      default:
        return b.savedAt - a.savedAt;
    }
  });

  const submitNewCollection = async (event) => {
    event.preventDefault();
    const collection = await createCollection(newCollectionName);
    if (!collection) return;
    setNewCollectionName('');
    setNewCollectionOpen(false);
    setSelectedCollection(collection.id);
  };

  const submitRename = async (event) => {
    event.preventDefault();
    const success = await renameCollection(editingId, renameValue);
    if (success) setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const success = await deleteCollection(id);
    if (success && selectedCollection === id) setSelectedCollection('all');
    setDeleteTarget(null);
  };

  const handleMovieDragStart = (event, movie) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(movie.id));
    setDraggedMovieId(String(movie.id));
  };

  const handleCollectionDrop = async (event, collection) => {
    event.preventDefault();
    const movieId = event.dataTransfer.getData('text/plain');
    setDropTargetId(null);
    setDraggedMovieId(null);
    const entry = validItems.find((item) => String(item.movie.id) === movieId);
    if (!entry || entry.collectionId === collection.id) return;
    await moveMovieToCollection(entry.movie.id, collection.id);
  };

  const collectionCards = [
    { id: 'all', name: 'All Saved', count: validItems.length, icon: 'all', posters: validItems.map((entry) => entry.movie) },
    ...collections.map((collection) => ({
      ...collection,
      count: validItems.filter((entry) => entry.collectionId === collection.id).length,
      posters: validItems.filter((entry) => entry.collectionId === collection.id).map((entry) => entry.movie),
      icon: 'collection',
    })),
  ];

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="mx-auto w-full max-w-[1600px] px-4 pt-24 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-white">Watchlist</h1>
          <span className="w-fit rounded bg-ink-raised px-2 py-0.5 text-xs font-semibold text-muted">
            {items.length} saved{syncing ? ' · syncing…' : ''}
          </span>
          <button
            type="button"
            onClick={() => setNewCollectionOpen((open) => !open)}
            className="ml-auto inline-flex items-center gap-2 rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-sm font-bold text-white hover:border-brand/60"
          >
            <span className="text-lg leading-none text-brand">+</span>
            New collection
          </button>
        </div>

        {newCollectionOpen && (
          <form onSubmit={submitNewCollection} className="mt-4 flex max-w-lg gap-2">
            <input
              autoFocus
              maxLength={40}
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              placeholder="Collection name"
              aria-label="New collection name"
              className="min-w-0 flex-1 rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-white outline-none focus:border-brand"
            />
            <button type="submit" disabled={!newCollectionName.trim()} className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create</button>
            <button type="button" onClick={() => setNewCollectionOpen(false)} className="rounded-md px-3 py-2 text-sm font-semibold text-muted hover:text-white">Cancel</button>
          </form>
        )}

        <SyncNudge hasItems={items.length > 0} />

        <section className="mt-6" aria-label="Watchlist collections">
          <SectionHeading className="mb-3 text-lg">Your collections</SectionHeading>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:-mx-8 sm:px-8">
            {collectionCards.map((collection) => {
              const isSelected = selectedCollection === collection.id;
              const isEditing = editingId === collection.id;
              return (
                <div
                  key={collection.id}
                  onDragOver={collection.icon === 'collection' ? (event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropTargetId(collection.id);
                  } : undefined}
                  onDragLeave={collection.icon === 'collection' ? (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setDropTargetId(null);
                  } : undefined}
                  onDrop={collection.icon === 'collection' ? (event) => handleCollectionDrop(event, collection) : undefined}
                  className={`relative h-32 w-48 shrink-0 snap-start overflow-hidden rounded-lg border transition ${
                    isSelected || dropTargetId === collection.id ? 'border-brand ring-2 ring-brand/70' : 'border-ink-border'
                  } ${collection.icon === 'collection' ? 'cursor-pointer' : ''}`}
                >
                  <CollectionArtwork posters={collection.posters} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/20" />
                  {isEditing ? (
                    <form onSubmit={submitRename} className="absolute inset-x-3 bottom-3 z-10 flex flex-col gap-2">
                      <input
                        autoFocus
                        maxLength={40}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        aria-label="Rename collection"
                        className="w-full rounded border border-ink-border bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs font-semibold text-muted hover:text-white">Cancel</button>
                        <button type="submit" disabled={!renameValue.trim()} className="text-xs font-bold text-brand disabled:opacity-50">Save</button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!draggedMovieId) setSelectedCollection(collection.id);
                      }}
                      aria-pressed={isSelected}
                      className={`absolute inset-0 z-[1] flex w-full flex-col items-start justify-end p-3 pb-3 text-left ${
                        collection.icon === 'collection' ? 'cursor-pointer' : ''
                      }`}
                    >
                      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/45 text-white/90 backdrop-blur-sm">
                        <CollectionIcon className="h-5 w-5" />
                      </span>
                      <span className="block w-full truncate pr-7 text-sm font-bold text-white">{collection.name}</span>
                      <span className="text-xs text-white/75">{collection.count} {collection.count === 1 ? 'movie' : 'movies'}</span>
                    </button>
                  )}

                  {dropTargetId === collection.id && collection.icon === 'collection' && (
                    <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-brand/25 text-sm font-black text-white">
                      Drop to move
                    </div>
                  )}

                  {collection.icon === 'collection' && !isEditing && (
                    <div className="absolute right-2 top-2 z-10">
                      <button
                        type="button"
                        aria-label={`Manage ${collection.name} collection`}
                        aria-expanded={openMenuId === collection.id}
                        onClick={() => setOpenMenuId((openId) => openId === collection.id ? null : collection.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white shadow-lg backdrop-blur-sm transition hover:border-white/60 hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                        </svg>
                      </button>
                      {openMenuId === collection.id && (
                        <div className="absolute right-0 top-8 z-20 w-40 rounded-md border border-ink-border bg-ink-raised p-1 shadow-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setRenameValue(collection.name);
                              setEditingId(collection.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                          >
                            Rename collection
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(collection);
                              setOpenMenuId(null);
                            }}
                            className="w-full rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-white/10"
                          >
                            Delete collection
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading className="text-xl">
            {collectionCards.find((collection) => collection.id === selectedCollection)?.name || 'All Saved'}
            <span className="ml-2 text-sm font-medium text-muted">({visibleItems.length})</span>
          </SectionHeading>
          {visibleItems.length > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-muted">
              Sort by
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="rounded-md border border-ink-border bg-ink-raised px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {sorted.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {sorted.map(({ movie }) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                saved
                onToggleSaved={toggleSaved}
                onMoveToCollection={(id, collectionId) => moveMovieToCollection(id, collectionId)}
                onDragStart={handleMovieDragStart}
                onDragEnd={() => {
                  setDraggedMovieId(null);
                  setDropTargetId(null);
                }}
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
            <p className="text-3xl font-black text-white">Nothing saved yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Add movies from any movie card, then organize them into collections here.
            </p>
            <Link to="/" className="mt-6 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark">
              Browse movies
            </Link>
          </div>
        ) : (
          <div className="mt-8 rounded-md border border-ink-border bg-ink-soft px-6 py-12 text-center">
            <CollectionIcon className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-lg font-bold text-white">No movies in this collection</p>
            <p className="mt-1 text-sm text-muted">Move saved movies here from the All Saved view.</p>
          </div>
        )}
      </main>

      <Footer />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete collection?"
        message={deleteTarget ? `“${deleteTarget.name}” will be deleted. Its movies will stay saved without a collection.` : ''}
        confirmLabel="Delete collection"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
