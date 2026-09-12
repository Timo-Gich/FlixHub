/**
 * Search input with a magnifier icon. Controlled — the parent owns the query
 * value so results can be fetched elsewhere. Submitting triggers onSearch.
 * Props:
 *   - id          : unique input id
 *   - value       : current query string
 *   - onChange    : (nextValue) => void
 *   - onSubmit    : () => void
 *   - placeholder : input placeholder text
 *   - loading     : when true, shows a small spinner in place of the icon
 *   - className   : extra classes forwarded to the wrapper
 */
export default function SearchBar({
  id = 'app-search',
  value = '',
  onChange,
  onSubmit,
  placeholder,
  loading = false,
  className = '',
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className={`relative w-full ${className}`}
    >
      <span className={`pointer-events-none absolute inset-y-0 left-2 flex items-center ${loading ? 'hidden' : ''}`}>
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      {loading && (
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-brand"
            aria-hidden="true"
          />
        </span>
      )}
      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder ?? 'Search titles…'}
        className="w-full rounded-full border border-ink-border bg-ink-raised/80 py-2 pl-9 pr-4
                   text-sm text-foreground placeholder:text-muted
                   outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
      />
    </form>
  );
}