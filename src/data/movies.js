// Placeholder catalogue data for the UI shell.
// NOTE: No external API is wired up yet — this is static seed content used
// only to render the layout and responsive grid.

export const featured = {
  title: 'Midnight Protocol',
  tagline: 'Everyone has a secret. Some are worth saving.',
  maturity: '18+',
};

export const rows = [
  {
    id: 'trending',
    title: 'Trending Now',
    items: [
      'Midnight Protocol',
      'The Last Signal',
      'Crimson Sky',
      'Echoes of Tomorrow',
      'Iron Harvest',
      'Silent Harbor',
      'Neon Drift',
      'The Forgotten Ward',
      'Golden Hour',
      'Runaway Romeo',
    ],
  },
  {
    id: 'originals',
    title: 'FlixHub Originals',
    items: [
      'The Crownless',
      'Paper Moons',
      'Static',
      'Blue Meridian',
      'Wild Avenues',
      'The Quiet Divide',
      'Starlight Motel',
      'Gravity Well',
      'Fox & Co.',
      'Last Exit',
    ],
  },
  {
    id: 'thrillers',
    title: 'Thrillers & Suspense',
    items: [
      'Dead Reckoning',
      'Veil of Lies',
      'The Watcher',
      'Sleeper Cell',
      'Zero Hour',
      'Cold Case File',
      'The Vault',
      'Night Auditor',
      'Hollow Point',
      'Smoke & Mirrors',
    ],
  },
  {
    id: 'comedy',
    title: 'Comedy',
    items: [
      'Roommate Roulette',
      'The Internship Fiasco',
      'Dinner Party Disaster',
      'Late Bloomer',
      'Office Chaos',
      'The Wrong Trousers Diaries',
      'Weekend Warriors',
      'Toast to Chaos',
      'Budget Royals',
      'Once a Clown',
    ],
  },
];

// Soft gradient presets so each card is distinguishable without real imagery.
export const gradients = [
  'from-brand/90 via-ink-raised to-ink',
  'from-orange-600/80 via-ink-raised to-ink',
  'from-emerald-600/80 via-ink-raised to-ink',
  'from-sky-600/80 via-ink-raised to-ink',
  'from-fuchsia-600/80 via-ink-raised to-ink',
  'from-amber-500/80 via-ink-raised to-ink',
  'from-teal-600/80 via-ink-raised to-ink',
  'from-rose-600/80 via-ink-raised to-ink',
];