import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  {
    key: 'home',
    label: 'Home',
    to: '/',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9.5 12 3l9 6.5" />
        <path d="M5 10.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9.5" />
      </svg>
    ),
  },
  {
    key: 'live',
    label: 'Live TV',
    to: '/live',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="15" rx="2" />
        <path d="M17 7l4-4M8 7V4M6 2l-3 3" />
      </svg>
    ),
  },
  {
    key: 'movies',
    label: 'Movies',
    to: '/movies',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
      </svg>
    ),
  },
  {
    key: 'series',
    label: 'Series',
    to: '/series',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="m17 2-5 5-5-5" />
      </svg>
    ),
  },
  {
    key: 'watchlist',
    label: 'Watchlist',
    to: '/watch-later',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

/**
 * Mobile-only fixed bottom navigation bar. It is hidden on md+ screens where the
 * top hamburger menu is the primary navigation. Shown across all pages via App.
 */
export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-border bg-ink/95
                 backdrop-blur md:hidden"
    >
      <ul className="flex items-center justify-around pb-[env(safe-area-inset-bottom)] pt-1.5">
        {LINKS.map((item) => {
          const active =
            item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
          return (
            <li key={item.key}>
              <Link
                to={item.to}
                className={`flex min-w-[64px] flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition ${
                  active ? 'text-brand-light' : 'text-muted hover:text-white'
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center ${
                  active ? 'text-brand-light' : 'text-muted/80'
                }`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}