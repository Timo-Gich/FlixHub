export default function VoiceSearchButton({ supported, listening, onClick, className = '' }) {
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? 'Stop voice search' : 'Search by voice'}
      aria-pressed={listening}
      title={listening ? 'Listening… Click to stop' : 'Search by voice'}
      className={`flex items-center justify-center transition-colors ${
        listening ? 'text-brand-light' : 'text-white/60 hover:text-white'
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-[18px] w-[18px] ${listening ? 'animate-pulse' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
      </svg>
    </button>
  );
}
