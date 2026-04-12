"use client";

export function GradientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Blob 1 — warm amber, top-left drift */}
      <div className="gradient-blob gradient-blob-1" />
      {/* Blob 2 — soft peach, bottom-right drift */}
      <div className="gradient-blob gradient-blob-2" />
      {/* Blob 3 — cream rose, top-right → center */}
      <div className="gradient-blob gradient-blob-3" />
      {/* Blob 4 — warm sand, bottom-left → center */}
      <div className="gradient-blob gradient-blob-4" />
      {/* Noise texture overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.25] mix-blend-multiply dark:mix-blend-overlay pointer-events-none">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.5" intercept="0" />
            <feFuncG type="linear" slope="0.5" intercept="0" />
            <feFuncB type="linear" slope="0.5" intercept="0" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>
    </div>
  );
}
