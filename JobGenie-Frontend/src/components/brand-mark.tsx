/** The JobGenie mark and wordmark; the same glyph as public/favicon.svg. */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--primary)" />
        <path
          d="M19 8v11.5a4.5 4.5 0 0 1-9 0"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle cx="23.5" cy="8.5" r="2.5" fill="var(--signal)" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight text-foreground">JobGenie</span>
    </span>
  );
}
