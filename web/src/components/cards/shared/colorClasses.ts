/**
 * Static Tailwind class maps for status-card rows.
 *
 * Every class the maps can produce is a literal string in this file, so the
 * Tailwind JIT / content scanner sees them regardless of which card imports
 * them at runtime. Do not construct these class strings dynamically at call
 * sites (e.g. `text-${color}-400`) — that pattern is invisible to Tailwind's
 * static scan and depends on the class happening to appear elsewhere in the
 * consumer bundle.
 *
 * Cards should look up by the same short color name they use in their
 * `getStatusColor()` mapper (green / red / blue / yellow / gray / orange) and
 * fall back to `orange` for unknown values, matching the existing convention
 * in `openkruise_status/ItemRow.tsx`.
 */

export const ICON_COLOR_CLASS: Record<string, string> = {
  green: 'text-green-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  yellow: 'text-yellow-400',
  gray: 'text-gray-400',
  orange: 'text-orange-400',
}

export const BADGE_COLOR_CLASS: Record<string, string> = {
  green: 'bg-green-500/20 text-green-400',
  red: 'bg-red-500/20 text-red-400',
  blue: 'bg-blue-500/20 text-blue-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  gray: 'bg-gray-500/20 text-gray-400',
  orange: 'bg-orange-500/20 text-orange-400',
}
