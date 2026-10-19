import type { ReactNode, Ref } from 'react'
import { ChevronLeft, ChevronRight, Filter, Server } from 'lucide-react'
import { ClusterBadge } from '../../components/ui/ClusterBadge'

/**
 * Minimal controlled search input primitive. Wire `value` / `onChange` to
 * `useCardData().filters.search` / `filters.setSearch` (or an equivalent
 * local `useState` pair) to get working search.
 */
export function CardSearchInput({ value, onChange, placeholder, className }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return <input data-testid="card-search" className={className} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
}

export interface CardClusterFilterProps {
  availableClusters: string[]
  selectedClusters: string[]
  onToggle: (cluster: string) => void
  onClear: () => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  containerRef?: Ref<HTMLDivElement>
  minClusters?: number
}

export type CardLimit = number | 'unlimited'

export interface CardControlsProps {
  limit: CardLimit
  onLimitChange: (limit: CardLimit) => void
  sortBy: string
  sortOptions: Array<{ value: string; label: string }>
  onSortChange: (value: string) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (direction: 'asc' | 'desc') => void
}

export interface CardControlsRowProps {
  children?: ReactNode
  clusterFilter?: CardClusterFilterProps
  cardControls?: CardControlsProps
}

const LIMIT_OPTIONS: CardLimit[] = [5, 10, 25, 50, 'unlimited']

/**
 * Row of optional card controls: a cluster-filter dropdown, a limit selector,
 * and sort field / direction controls. Anything passed as `children` renders
 * after the built-in controls.
 */
export function CardControlsRow({ children, clusterFilter, cardControls }: CardControlsRowProps) {
  const showClusterFilter =
    clusterFilter !== undefined &&
    clusterFilter.availableClusters.length >= (clusterFilter.minClusters ?? 1)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showClusterFilter && clusterFilter && (
        <div className="relative" ref={clusterFilter.containerRef}>
          <button
            type="button"
            data-testid="card-cluster-filter-button"
            aria-label="Filter clusters"
            aria-expanded={clusterFilter.isOpen}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border/50 hover:bg-secondary/50"
            onClick={() => clusterFilter.setIsOpen(!clusterFilter.isOpen)}
          >
            <Filter className="w-3 h-3" />
            {clusterFilter.selectedClusters.length > 0 && (
              <span>{clusterFilter.selectedClusters.length}</span>
            )}
          </button>
          {clusterFilter.isOpen && (
            <div
              data-testid="card-cluster-filter-dropdown"
              className="absolute right-0 z-10 mt-1 min-w-40 rounded border border-border bg-card p-1 shadow-lg"
            >
              {clusterFilter.selectedClusters.length > 0 && (
                <button
                  type="button"
                  data-testid="card-cluster-filter-clear"
                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary/50"
                  onClick={clusterFilter.onClear}
                >
                  Clear filter
                </button>
              )}
              {clusterFilter.availableClusters.map(cluster => (
                <label
                  key={cluster}
                  className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-secondary/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={clusterFilter.selectedClusters.includes(cluster)}
                    onChange={() => clusterFilter.onToggle(cluster)}
                  />
                  {cluster}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {cardControls && (
        <>
          <select
            data-testid="card-limit"
            aria-label="Items per card"
            className="text-xs px-1 py-1 rounded border border-border/50 bg-transparent"
            value={String(cardControls.limit)}
            onChange={e =>
              cardControls.onLimitChange(
                e.target.value === 'unlimited' ? 'unlimited' : Number(e.target.value),
              )
            }
          >
            {LIMIT_OPTIONS.map(option => (
              <option key={option} value={String(option)}>
                {option === 'unlimited' ? 'All' : option}
              </option>
            ))}
          </select>
          <select
            data-testid="card-sort"
            aria-label="Sort by"
            className="text-xs px-1 py-1 rounded border border-border/50 bg-transparent"
            value={cardControls.sortBy}
            onChange={e => cardControls.onSortChange(e.target.value)}
          >
            {cardControls.sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="card-sort-direction"
            aria-label="Toggle sort direction"
            className="text-xs px-2 py-1 rounded border border-border/50 hover:bg-secondary/50"
            onClick={() =>
              cardControls.onSortDirectionChange(
                cardControls.sortDirection === 'asc' ? 'desc' : 'asc',
              )
            }
          >
            {cardControls.sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </>
      )}
      {children}
    </div>
  )
}

export interface CardControlsHeaderProps {
  selectedClusterCount: number
  totalClusterCount: number
  clusterFilter: CardClusterFilterProps
  cardControls: CardControlsProps
}

/**
 * Header row pairing a "N/M clusters" count badge with {@link CardControlsRow}.
 * Extracted from kubeflow_status/openkruise_status, which had copy-pasted
 * this exact wrapper (see console-marketplace architecture sweep).
 */
export function CardControlsHeader({
  selectedClusterCount,
  totalClusterCount,
  clusterFilter,
  cardControls,
}: CardControlsHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2">
        {selectedClusterCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            <Server className="w-3 h-3" />
            {selectedClusterCount}/{totalClusterCount}
          </span>
        )}
      </div>
      <CardControlsRow clusterFilter={clusterFilter} cardControls={cardControls} />
    </div>
  )
}

export interface CardScopeBadgeProps {
  selectedClusters: string[]
  t: (key: string, options?: Record<string, unknown>) => string
}

/**
 * "Scope" indicator beneath the controls row: a single {@link ClusterBadge}
 * when exactly one cluster is selected, an "N clusters" pill when several
 * are, or "all clusters" when none are. Extracted from
 * kubeflow_status/openkruise_status, which had copy-pasted this exact block.
 */
export function CardScopeBadge({ selectedClusters, t }: CardScopeBadgeProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {selectedClusters.length === 1 ? (
        <ClusterBadge cluster={selectedClusters[0]} />
      ) : selectedClusters.length > 1 ? (
        <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
          {t('common:common.nClusters', { count: selectedClusters.length })}
        </span>
      ) : (
        <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
          {t('common:common.allClusters')}
        </span>
      )}
    </div>
  )
}

interface CardPaginationFooterProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  needsPagination: boolean
}

/**
 * Page-range indicator with previous/next controls. Renders an empty
 * (but still `data-testid="card-pagination"`-tagged) container when
 * `needsPagination` is false so cards can render it unconditionally.
 */
export function CardPaginationFooter({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  needsPagination,
}: CardPaginationFooterProps) {
  if (!needsPagination) {
    return <div data-testid="card-pagination" />
  }

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const rangeEnd = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div
      data-testid="card-pagination"
      className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground"
    >
      <span>
        {rangeStart}-{rangeEnd} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          className="p-1 rounded hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span>
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          className="p-1 rounded hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * PLACEHOLDER — renders an empty `<div>`. Not part of the search/pagination
 * stub tracked in issue #778; left as-is. Props mirror the real `console`
 * `CardAIActions` (lib/cards/CardAIActions.tsx there) so cards can pass the
 * same props in both environments — see kubestellar/console-marketplace#991.
 */
export interface CardAIActionsResource {
  kind: string
  name: string
  namespace?: string
  cluster?: string
  status?: string
}

export interface CardAIActionsProps {
  resource: CardAIActionsResource
  issues?: Array<{ name: string; message: string }>
  additionalContext?: Record<string, unknown>
  className?: string
  showRepair?: boolean
}

export function CardAIActions(_props: CardAIActionsProps) {
  return <div data-testid="card-ai-actions" />
}
