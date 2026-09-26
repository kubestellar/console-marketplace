import { Package } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardSearchInput, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardShell } from '../../../lib/cards/useCardShell'
import { type BuildpacksDemoImage, type BuildpacksDemoData } from './demoData'
import { useBuildpacksStatus } from './useBuildpacksStatus'

export type { BuildpacksDemoImage }

interface BuildpacksDisplayRow extends BuildpacksDemoImage {
  id: string
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'text-green-400',
  failed: 'text-red-400',
  building: 'text-yellow-400',
  unknown: 'text-muted-foreground',
}

function toDisplayRows(raw: BuildpacksDemoData): BuildpacksDisplayRow[] {
  return raw.images.map(image => ({ ...image, id: `${image.cluster}/${image.name}` }))
}

const hasAnyData = (raw: BuildpacksDemoData) => raw.images.length > 0

export function BuildpacksStatus() {
  const {
    t,
    showSkeleton,
    showEmptyState,
    card: {
      items: displayRows,
      totalItems,
      currentPage,
      totalPages,
      itemsPerPage,
      goToPage,
      needsPagination,
      filters,
      containerRef,
      containerStyle,
    },
  } = useCardShell<BuildpacksDemoData, BuildpacksDisplayRow>({
    useStatus: useBuildpacksStatus,
    toRows: toDisplayRows,
    hasAnyData,
    cardOptions: {
      filter: { searchFields: ['name', 'namespace', 'builder', 'status'] },
      sort: { defaultField: 'status', defaultDirection: 'asc' },
    },
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-2">
        <Skeleton variant="rounded" height={36} />
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Package className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t('buildpacksStatus.noImages')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      <div className="mb-3">
        <CardSearchInput
          value={filters.search}
          onChange={filters.setSearch}
          placeholder={t('buildpacksStatus.searchPlaceholder')}
        />
      </div>

      <div
        ref={containerRef}
        className="flex-1 space-y-2 overflow-y-auto"
        style={containerStyle}
      >
        {displayRows.map(row => (
          <div
            key={row.id}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            title={row.image}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate">{row.name}</span>
              <ClusterBadge cluster={row.cluster} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{row.namespace}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className={STATUS_COLORS[row.status] ?? 'text-muted-foreground'}>
                {row.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />
    </div>
  )
}
