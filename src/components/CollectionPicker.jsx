import { useEffect, useState } from 'react';

function CollectionIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2h7.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

export default function CollectionPicker({
  open,
  collections,
  onChoose,
  onCreate,
  onClose,
  title = 'Save to...',
  movieTitle,
  allowCreate = true,
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreating(false);
    setName('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const choose = async (collectionId) => {
    setBusy(true);
    try {
      const succeeded = await onChoose(collectionId);
      if (succeeded !== false) onClose();
    } finally {
      setBusy(false);
    }
  };

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const collection = await onCreate(name);
      if (!collection) return;
      const succeeded = await onChoose(collection.id);
      if (succeeded !== false) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:px-4" role="dialog" aria-modal="true" aria-labelledby="collection-picker-title">
      <button
        type="button"
        aria-label="Close collection picker"
        onClick={onClose}
        disabled={busy}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-ink-border bg-ink-soft p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-xl sm:p-6">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="collection-picker-title" className="text-lg font-black text-white">{title}</h2>
            {movieTitle && <p className="mt-1 line-clamp-1 text-sm text-muted">{movieTitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-white/10 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {creating ? (
          <form onSubmit={create} className="mt-5">
            <label htmlFor="new-collection-name" className="text-sm font-semibold text-foreground">Collection name</label>
            <input
              id="new-collection-name"
              autoFocus
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Weekend picks"
              className="mt-2 w-full rounded-md border border-ink-border bg-ink-raised px-3 py-2.5 text-white outline-none focus:border-brand"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} disabled={busy} className="rounded-md px-4 py-2 text-sm font-semibold text-muted hover:text-white">Back</button>
              <button type="submit" disabled={busy || !name.trim()} className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? 'Saving…' : 'Create & save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={() => choose(null)}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-lg border border-ink-border bg-ink-raised px-4 py-3 text-left hover:border-brand/60 disabled:opacity-50"
            >
              <CollectionIcon className="h-5 w-5 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-white">No collection</span>
                <span className="block text-xs text-muted">Save without choosing a collection</span>
              </span>
              <span className="text-xs font-bold text-brand">Quick save</span>
            </button>
            {collections.map((collection) => (
              <button
                type="button"
                key={collection.id}
                onClick={() => choose(collection.id)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-lg border border-ink-border bg-ink-raised px-4 py-3 text-left hover:border-brand/60 disabled:opacity-50"
              >
                <CollectionIcon className="h-5 w-5 text-brand" />
                <span className="font-semibold text-white">{collection.name}</span>
              </button>
            ))}
            {allowCreate && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-ink-border px-4 py-3 text-left font-bold text-foreground hover:border-brand/60 hover:text-white disabled:opacity-50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-sm leading-none text-white">+</span>
                New Collection
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
