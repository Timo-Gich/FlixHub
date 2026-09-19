import { Link } from 'react-router-dom';

// Bundled copy of the official TMDB logo (WebP) used for API attribution. It is
// served locally so it never depends on TMDb's externally hosted asset (which is
// access-controlled and can fail to load). The image falls back to text-only
// automatically if it ever fails to load.
const TMDB_LOGO_URL = '/logos/tmdb-logo.webp';
const TMDB_WEBSITE = 'https://www.themoviedb.org';

const FOOTER_COLUMNS = [
  {
    heading: 'Browse',
    links: [
      ['Home', '/'],
      ['Movies', '/movies'],
      ['Series', '/series'],
      ['New & Popular', '/new-popular'],
      ['Watchlist', '/watch-later'],
    ],
  },
  {
    heading: 'Company',
    links: [
      ['About Us', '/about'],
      ['Careers', '/careers'],
      ['Press', '/press'],
      ['Investor Relations', '/investors'],
    ],
  },
  {
    heading: 'Legal',
    links: [
      ['Terms of Service', '/terms'],
      ['Privacy Policy', '/privacy'],
      ['Cookie Preferences', '/cookies'],
      ['Legal Notices', '/legal'],
      ['Accessibility', '/accessibility'],
    ],
  },
];

/**
 * Standard page footer with link columns and a small brand note.
 */
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-border bg-ink-soft">
      <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 border-b border-ink-border pb-10 md:flex-row md:items-end">
          <div className="max-w-xl">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-sm font-black text-white">
                FH
              </span>
              <span className="text-lg font-extrabold tracking-tight text-white">
                FLIX<span className="text-brand">HUB</span>
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              A better place to find your next favorite story.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
              Keep your watchlist close, discover something new, and pick up
              exactly where you left off.
            </p>
          </div>
          <a
            href="mailto:gichigotimothy@gmail.com"
            className="w-fit rounded-md border border-ink-border px-4 py-2.5 text-sm font-semibold text-white transition hover:border-brand hover:bg-brand"
          >
            Contact support
          </a>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">FlixHub</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Thoughtful discovery for the films and series worth making time for.
            </p>
            <p className="mt-5 flex items-center gap-2 text-xs text-muted">
              Powered by
              <a
                href={TMDB_WEBSITE}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="TMDB — The Movie Database"
                className="inline-flex items-center transition opacity-90 hover:opacity-100"
              >
                <img
                  src={TMDB_LOGO_URL}
                  alt="TMDB"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="h-5 w-auto"
                />
              </a>
            </p>
            <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-muted/70">
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
                {col.heading}
              </h3>
              <ul className="space-y-2">
                {col.links.map(([label, to]) => (
                  <li key={to}>
                    <Link to={to} className="text-sm text-muted transition hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="border-t border-ink-border py-5">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 text-xs text-muted sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} FlixHub. All rights reserved.</p>
          <p>Built for better evenings.</p>
        </div>
      </div>
    </footer>
  );
}