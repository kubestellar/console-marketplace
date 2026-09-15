/**
 * Shared types and constants for the Kubeflow status card.
 *
 * Extracted from index.tsx so the display-item shape and sort-option types
 * can be reused by the mapping hook (useDisplayItems.ts) and the
 * presentational row component (ItemRow.tsx) without pulling in the full
 * container component.
 */

/** Unified display item that all four Kubeflow resource types map into. */
export interface KubeflowDisplayItem {
  id: string
  name: string
  namespace: string
  cluster: string
  category: 'pipeline' | 'experiment' | 'notebook' | 'training'
  status: string
  primaryDetail: string
  secondaryDetail: string
  timestamp: string
}

export type CategoryOption = '' | 'pipeline' | 'experiment' | 'notebook' | 'training'
export type SortByOption = 'status' | 'name' | 'category' | 'timestamp'
export type SortTranslationKey =
  | 'common:common.status'
  | 'common:common.name'
  | 'cards:kubeflowStatus.category'
  | 'cards:kubeflowStatus.updated'

export const SORT_OPTIONS_KEYS: ReadonlyArray<{
  value: SortByOption
  labelKey: SortTranslationKey
}> = [
  { value: 'status', labelKey: 'common:common.status' },
  { value: 'name', labelKey: 'common:common.name' },
  { value: 'category', labelKey: 'cards:kubeflowStatus.category' },
  { value: 'timestamp', labelKey: 'cards:kubeflowStatus.updated' },
]
