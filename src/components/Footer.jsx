import { Link } from 'react-router-dom';

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