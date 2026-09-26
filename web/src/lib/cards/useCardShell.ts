import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from '../../components/cards/CardDataContext'
import { useClusterFilteredRows } from '../../components/cards/shared/useClusterFilteredRows'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import type { UseCacheResult } from '../cache'
import { useCardData, type CardDataOptions } from './cardHooks'

/** `t` as returned by `useTranslation`. */
export type CardTFunction = ReturnType<typeof useTranslation>['t']

/** Minimal row shape the shell can cluster-filter. */
export interface ClusterScopedRow {
  cluster: string
}

const DEFAULT_TRANSLATION_NAMESPACES: readonly string[] = ['cards', 'common']

/**
 * Options for {@link useCardShell}.
 *
 * @template TRaw The status hook's data shape.
 * @template TRow The flat row shape the card renders.
 */
export interface CardShellOptions<TRaw, TRow extends ClusterScopedRow> {
  /** Status hook, e.g. `useNotaryStatus`. Must return a {@link UseCacheResult}. */
  useStatus: () => UseCacheResult<TRaw>
  /** Pure raw → row mapper. Re-runs only when `raw` or `t` change. */
  toRows: (raw: TRaw, t: CardTFunction) => TRow[]
  /** Whether `raw` holds anything worth rendering (drives skeleton / empty state). */
  hasAnyData: (raw: TRaw) => boolean
  /** Options forwarded verbatim to `useCardData` (search fields, sort, page size). */
  cardOptions?: CardDataOptions
  /** i18n namespaces for `useTranslation`. Defaults to `['cards', 'common']`. */
  translationNs?: string | string[]
}

/**
 * Value returned by {@link useCardShell}.
 *
 * @template TRaw The status hook's data shape.
 * @template TRow The flat row shape the card renders.
 * @template SortKey The sort-field union accepted by `useCardData`.
 */
export interface CardShellResult<TRaw, TRow extends ClusterScopedRow, SortKey extends string> {
  t: CardTFunction
  /** Unfiltered data from the status hook (for card-level aggregates). */
  raw: TRaw
  /** `isDemoMode || isDemoFallback` — true whenever demo-sourced data is on screen. */
  isDemoData: boolean
  showSkeleton: boolean
  showEmptyState: boolean
  /** All rows after the global cluster selector, before search / sort / paging. */
  rows: TRow[]
  /** `useCardData` state (paged items, pagination, filters, sorting, refs). */
  card: ReturnType<typeof useCardData<TRow, SortKey>>
}

/**
 * Owns the render-scaffolding contract every status card used to redeclare
 * by hand — the "required hook #1..#4 + required pattern #5" preamble:
 *
 * 1. `useTranslation(namespaces)`
 * 2. `useDemoMode()`
 * 3. `useGlobalFilters()` → `selectedClusters`
 * 4. the card's status hook → `{ data, isLoading, isRefreshing, isFailed, isDemoFallback }`
 * 5. `isDemoData = isDemoMode || isDemoFallback`
 * 6. `useCardLoadingState({ isLoading, isRefreshing, hasAnyData, isFailed, isDemoData })`
 * 7. `useMemo(toRows)` → `useClusterFilteredRows(rows, selectedClusters)`
 * 8. `useCardData(filteredRows, cardOptions)`
 *
 * A card supplies only its status hook, its raw → row mapper, and its
 * `hasAnyData` predicate; the wiring between the hooks is typed and lives in
 * one place, so a new card cannot forget `isDemoFallback` or skip the global
 * cluster filter.
 */
export function useCardShell<
  TRaw,
  TRow extends ClusterScopedRow,
  SortKey extends string = string,
>(options: CardShellOptions<TRaw, TRow>): CardShellResult<TRaw, TRow, SortKey> {
  const { useStatus, toRows, hasAnyData, cardOptions, translationNs } = options

  const { t } = useTranslation(translationNs ?? [...DEFAULT_TRANSLATION_NAMESPACES])
  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()

  const { data: raw, isLoading, isRefreshing, isFailed, isDemoFallback } = useStatus()
  const isDemoData = isDemoMode || isDemoFallback

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData: hasAnyData(raw),
    isFailed,
    isDemoData,
  })

  const allRows = useMemo(() => toRows(raw, t), [raw, t, toRows])
  const rows = useClusterFilteredRows(allRows, selectedClusters)
  const card = useCardData<TRow, SortKey>(rows, cardOptions)

  return { t, raw, isDemoData, showSkeleton, showEmptyState, rows, card }
}
