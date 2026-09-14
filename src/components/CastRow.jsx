import { getProfileUrl } from '../services/tmdbService';

/**
 * Horizontal, horizontally-scrollable cast row used on movie / TV detail pages.
 * Shows circular actor headshots with the person's name and the character they
 * play. Entries without a profile image are skipped so the row stays clean.
 *
 * Props:
 *   - people : an array of TMDb credit objects (from credits.cast)
 */
export default function CastRow({ people = [] }) {
  const cast = (people ?? []).filter((p) => p.profile_path && p.name).slice(0, 20);
  if (cast.length === 0) return null;

  return (
    <section aria-label="Cast" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
      <h2 className="mb-4 text-lg font-bold text-white md:text-xl">Cast</h2>

      <div className="scrollbar-hide -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
        {cast.map((person) => (
          <div key={person.id} className="w-24 shrink-0 snap-start text-center sm:w-28">
            <img
              src={getProfileUrl(person.profile_path)}
              alt={person.name}
              loading="lazy"
              className="aspect-square w-full rounded-full border-2 border-ink-border object-cover bg-ink-raised"
            />
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{person.name}</p>
            {person.character && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{person.character}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}