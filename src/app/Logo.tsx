/**
 * The wordmark glyph: a dock rail with three tools seated in it.
 *
 * Drawn rather than borrowed, on the same 16-unit grid as the icon set, so the
 * brand mark and the UI icons share a stroke weight and a corner radius.
 */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="4.25" width="2" height="7.5" rx="1" fill="currentColor" />
      <rect x="7" y="4.25" width="2" height="4.25" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="10" y="4.25" width="2" height="6" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  )
}
