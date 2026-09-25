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
// Now shared across status-card rows; re-exported here to preserve the
// existing `from './types'` import surface used by ItemRow and tests.
export { ICON_COLOR_CLASS, BADGE_COLOR_CLASS } from '../shared/colorClasses'

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
