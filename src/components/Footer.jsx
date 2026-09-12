const FOOTER_COLUMNS = [
  {
    heading: 'Browse',
    links: ['Home', 'Series', 'Films', 'New & Popular', 'My List'],
  },
  {
    heading: 'Company',
    links: ['About Us', 'Careers', 'Press', 'Investor Relations'],
  },
  {
    heading: 'Legal',
    links: ['Terms of Use', 'Privacy', 'Cookie Preferences', 'Legal Notices'],
  },
];

/**
 * Standard page footer with link columns and a small brand note.
 */
export default function Footer() {
  return (
    <footer className="mt-12 border-t border-ink-border bg-ink-soft">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <svg viewBox="0 0 36 50" className="h-6 w-auto" aria-hidden="true">
              <path fill="#E50914" d="M0 0h8.2L25 34.6V0h10.6v49.2H27.5L10.6 14.5v34.7H0V0z" />
            </svg>
            <span className="text-lg font-extrabold text-white">
              FLIX<span className="text-brand">HUB</span>
            </span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            A Netflix-inspired concept shell. Streamlined UI, dark theme, built
            for the movies you love.
          </p>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
              {col.heading}
            </h3>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-muted transition hover:text-white">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-ink-border py-5">
        <p className="mx-auto max-w-[1600px] px-4 text-center text-xs text-muted sm:px-8">
          © {new Date().getFullYear()} FlixHub · Concept UI shell — no real content or
          services included.
        </p>
      </div>
    </footer>
  );
}