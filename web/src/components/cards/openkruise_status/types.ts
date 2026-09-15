/**
 * Shared types and constants for the OpenKruise status card.
 *
 * Extracted from index.tsx so the display-item shape, filter/sort option
 * types, and static Tailwind color maps can be reused by the mapping hook
 * (useDisplayItems.ts) and the presentational row component (ItemRow.tsx)
 * without pulling in the full container component.
 */

/** Unified display item that all OpenKruise resource types map into. */
export interface OpenKruiseDisplayItem {
  id: string
  name: string
  namespace: string
  cluster: string
  category:
    | 'cloneset'
    | 'statefulset'
    | 'daemonset'
    | 'sidecarset'
    | 'broadcastjob'
    | 'cronjob'
  status: string
  primaryDetail: string
  secondaryDetail: string
  timestamp: string
}

export type CategoryOption =
  | ''
  | 'cloneset'
  | 'statefulset'
  | 'daemonset'
  | 'sidecarset'
  | 'broadcastjob'
  | 'cronjob'

export type SortByOption = 'status' | 'name' | 'category' | 'timestamp'
export type SortTranslationKey =
  | 'common:common.status'
  | 'common:common.name'
  | 'cards:openkruiseStatus.category'
  | 'cards:openkruiseStatus.updated'

// Static Tailwind class maps so the JIT can statically detect the classes.
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

// Named constants for relative-time formatting (previously magic numbers).
export const MS_PER_SECOND = 1000
export const MS_PER_MINUTE = 60 * MS_PER_SECOND
export const MS_PER_HOUR = 60 * MS_PER_MINUTE
export const MS_PER_DAY = 24 * MS_PER_HOUR

export const SORT_OPTIONS_KEYS: ReadonlyArray<{
  value: SortByOption
  labelKey: SortTranslationKey
}> = [
  { value: 'status', labelKey: 'common:common.status' },
  { value: 'name', labelKey: 'common:common.name' },
  { value: 'category', labelKey: 'cards:openkruiseStatus.category' },
  { value: 'timestamp', labelKey: 'cards:openkruiseStatus.updated' },
]
