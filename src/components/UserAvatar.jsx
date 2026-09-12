/**
 * Circular user profile avatar with initials and an online status dot.
 * Props:
 *   - name: user's display name (used for initial + aria-label)
 */
export default function UserAvatar({ name = 'Guest' }) {
  // Accessor placeholder — swap for real auth/avatar source later.
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="relative">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full
                     bg-gradient-to-br from-brand to-brand-dark text-xs font-bold text-white
                     ring-2 ring-ink-border transition hover:ring-brand"
          role="img"
          aria-label={`${name || 'Guest'} avatar`}
        >
          {initials || <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8v1H4z" /></svg>}
        </div>
        <span
          className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-ink bg-emerald-500"
          title="Online"
        />
      </div>
      <span className="hidden text-sm text-muted lg:inline">{name}</span>
    </div>
  );
}