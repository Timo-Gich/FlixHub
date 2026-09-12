import { useState } from 'react';

/**
 * Brand logo, rendered as an inline SVG so no image asset is required.
 */
export default function Logo({ className = 'h-9 w-auto' }) {
  const [hover, setHover] = useState(false);

  return (
    <a
      href="/"
      aria-label="FlixHub home"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`shrink-0 select-none ${className}`}
    >
      <span className="flex items-center gap-2">
        <svg
          viewBox="0 0 36 50"
          className={`h-full w-auto transition-transform duration-200 ${
            hover ? 'scale-105' : ''
          }`}
          role="img"
          aria-label="FlixHub N"
        >
          <path
            fill="#E50914"
            d="M0 0h8.2L25 34.6V0h10.6v49.2H27.5L10.6 14.5v34.7H0V0z"
          />
        </svg>
        <span className="text-xl font-extrabold tracking-tight text-white md:text-2xl">
          FLIX<span className="text-brand">HUB</span>
        </span>
      </span>
    </a>
  );
}