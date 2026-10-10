// Line illustrations drawn in the page's ink and stamp colours, so they
// follow light and dark mode without image files.

export function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 340" className={className} role="img" aria-label="A magnifying glass inspecting a file, next to a review stamp">
      {/* back sheet */}
      <rect x="92" y="38" width="230" height="270" rx="6" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" transform="rotate(-4 207 173)" />
      {/* front sheet: a README */}
      <g transform="rotate(2 200 170)">
        <rect x="78" y="30" width="240" height="282" rx="6" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />
        <path d="M278 30v28h40" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <text x="100" y="66" fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink-2)">README.md</text>
        {[92, 112, 132, 164, 184, 204, 236, 256, 276].map((y, i) => (
          <line key={y} x1="100" x2={[290, 250, 270, 280, 220, 260, 240, 286, 200][i]} y1={y} y2={y} stroke="var(--line-strong)" strokeWidth="6" strokeLinecap="round" />
        ))}
        <line x1="100" x2="190" y1="164" y2="164" stroke="var(--stamp)" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
      </g>
      {/* magnifier */}
      <g className="art-scan">
        <circle cx="236" cy="168" r="54" fill="var(--paper)" fillOpacity="0.55" stroke="var(--ink)" strokeWidth="5" />
        <path d="M206 146a36 36 0 0 1 30-14" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        <line x1="276" y1="208" x2="322" y2="254" stroke="var(--ink)" strokeWidth="14" strokeLinecap="round" />
      </g>
      {/* stamp */}
      <g transform="rotate(-12 346 92)">
        <circle cx="346" cy="92" r="46" fill="none" stroke="var(--stamp)" strokeWidth="3" />
        <circle cx="346" cy="92" r="38" fill="none" stroke="var(--stamp)" strokeWidth="1.5" strokeDasharray="3 4" />
        <text x="346" y="102" textAnchor="middle" fontFamily="var(--font-display)" fontSize="34" fontWeight="700" fill="var(--stamp)">7</text>
        <text x="346" y="120" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="2" fill="var(--stamp)">/ 10</text>
      </g>
      {/* little sparks */}
      <path d="M44 120l10 4M40 146h12M46 170l9-5" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function RepoIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden>
      <path d="M12 6h18l8 8v28H12z" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M30 6v8h8" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 24h14M18 30h10M18 36h12" stroke="var(--stamp)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function SiteIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden>
      <rect x="6" y="10" width="36" height="28" rx="3" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M6 17h36" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="11" cy="13.5" r="1.4" fill="var(--ink)" />
      <circle cx="16" cy="13.5" r="1.4" fill="var(--ink)" />
      <path d="M13 27l5 4 6-8 6 6 5-4" fill="none" stroke="var(--stamp)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReportIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden>
      <rect x="9" y="6" width="30" height="36" rx="3" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M15 16l3 3 5-6M15 27l3 3 5-6" fill="none" stroke="var(--pass)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 17h6M27 28h6" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M15 37h18" stroke="var(--stamp)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Squiggle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 14" preserveAspectRatio="none" className={className} aria-hidden>
      <path d="M2 9c18-8 30 6 48 0s30-8 48 0 30 6 48 0 30-8 48 0 18 4 24 2" fill="none" stroke="var(--stamp)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
