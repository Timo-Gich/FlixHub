export default function SectionHeading({ as: Heading = 'h2', children, className = '', id }) {
  return (
    <Heading id={id} className={`flex items-center gap-3 font-display font-semibold uppercase tracking-[0.1em] text-white text-shadow-hero ${className}`}>
      <span className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand to-brand-light shadow-sm shadow-brand/40" aria-hidden="true" />
      {children}
    </Heading>
  );
}
