import type { SVGProps } from 'react'

/**
 * Hand-drawn icon set.
 *
 * Icon libraries are a common tell: an app wearing Lucide or Heroicons looks
 * like every other app wearing them, and pulling a whole package in for
 * eighteen glyphs is 40 KB for shapes we can draw. These are all built on the
 * same 16-unit grid with a 1.5 stroke and square-ish joins, which is what makes
 * them read as one family rather than eighteen separate drawings.
 *
 * Every icon here is decorative: the accessible name always comes from the
 * control that contains it, so `aria-hidden` is set at the root.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.2 10.2 13.5 13.5" />
  </Svg>
)

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.25" />
    <path d="M10.25 3.25a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m2.75 8.5 3.25 3.25 7.25-7.5" />
  </Svg>
)

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.75 3.75 12.25 12.25M12.25 3.75 3.75 12.25" />
  </Svg>
)

export const IconStar = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M8 1.9 9.94 5.9l4.31.64-3.13 3.1.74 4.36L8 11.93 4.14 14l.74-4.36-3.13-3.1 4.31-.64z" />
  </Svg>
)

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.5V8l2.5 1.75" />
  </Svg>
)

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3.25" />
    <path d="M8 .9v1.6M8 13.5v1.6M15.1 8h-1.6M2.5 8H.9M13 3l-1.13 1.13M4.13 11.87 3 13M13 13l-1.13-1.13M4.13 4.13 3 3" />
  </Svg>
)

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.6 9.6A5.9 5.9 0 0 1 6.4 2.4a6 6 0 1 0 7.2 7.2Z" />
  </Svg>
)

export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.25" />
    <path d="M5.5 14h5M8 11.25V14" />
  </Svg>
)

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Svg>
)

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.5 6 4.5 4.5L12.5 6" />
  </Svg>
)

export const IconArrowSwap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 2.75 2 5.25l2.5 2.5M2 5.25h12M11.5 13.25 14 10.75l-2.5-2.5M14 10.75H2" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.75v8M4.75 6.75 8 10l3.25-3.25M2 11.5v1.25a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V11.5" />
  </Svg>
)

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 10.25v-8M4.75 5.25 8 2l3.25 3.25M2 11.5v1.25a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V11.5" />
  </Svg>
)

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4h11M6 4V2.75a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V4M3.75 4l.6 9a1.25 1.25 0 0 0 1.25 1.15h4.8a1.25 1.25 0 0 0 1.25-1.15l.6-9" />
  </Svg>
)

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.6 9.4a2.75 2.75 0 0 0 4 .1l2-2a2.75 2.75 0 0 0-3.9-3.9l-1.1 1.1" />
    <path d="M9.4 6.6a2.75 2.75 0 0 0-4-.1l-2 2a2.75 2.75 0 0 0 3.9 3.9l1.1-1.1" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
)

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.75 8a5.75 5.75 0 1 1-1.9-4.27" />
    <path d="M13.9 1.75v3.1h-3.1" />
  </Svg>
)

export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.13 2.4 1.6 12a1 1 0 0 0 .87 1.5h11.06a1 1 0 0 0 .87-1.5L8.87 2.4a1 1 0 0 0-1.74 0Z" />
    <path d="M8 6.25v3M8 11.4h.01" />
  </Svg>
)

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.4v3.6M8 5.1h.01" />
  </Svg>
)

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 4h12M2 8h12M2 12h12" />
  </Svg>
)

export const IconKeyboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.25" y="3.75" width="13.5" height="8.5" rx="1.5" />
    <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 9h.01M11.5 9h.01M6.25 9.75h3.5" />
  </Svg>
)

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M1.9 6.25h12.2M1.9 9.75h12.2" />
    <path d="M8 1.75c1.7 1.85 2.6 3.95 2.6 6.25S9.7 12.4 8 14.25C6.3 12.4 5.4 10.3 5.4 8s.9-4.4 2.6-6.25Z" />
  </Svg>
)

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.75 2.75 3.9v4.1c0 3 2.2 5.3 5.25 6.25 3.05-.95 5.25-3.25 5.25-6.25V3.9Z" />
    <path d="m5.9 8.1 1.5 1.5 2.9-3" />
  </Svg>
)

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.9 1.9 5 8 8.1 14.1 5Z" />
    <path d="m1.9 8 6.1 3.1L14.1 8" />
    <path d="m1.9 11 6.1 3.1 6.1-3.1" />
  </Svg>
)
