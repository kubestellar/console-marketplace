import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardSearchInput, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import { COREDNS_DEMO_DATA, type CoreDNSDemoServer } from './demoData'

export type { CoreDNSDemoServer }

interface CoreDNSDisplayRow extends CoreDNSDemoServer {
  id: string
}

const STATUS_COLORS: Record<string, string> = {
  running: 'text-green-400',
  degraded: 'text-yellow-400',
  down: 'text-red-400',
  unknown: 'text-muted-foreground',
}

export function CoreDNSStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()

  const isDemoData = isDemoMode
  const rawData = COREDNS_DEMO_DATA

  const { showSkeleton, showEmptyState } = useCardLoadingState({ isDemoData })

  const allRows = useMemo<CoreDNSDisplayRow[]>(
    () =>
      rawData.servers.map(server => ({
        ...server,
        id: `${server.cluster}/${server.name}`,
      })),
    [rawData],
  )

  const globalFiltered = useMemo(() => {
    if (!selectedClusters || selectedClusters.length === 0) return allRows
    return allRows.filter(row => selectedClusters.includes(row.cluster))
  }, [allRows, selectedClusters])

  const {
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
  } = useCardData<CoreDNSDisplayRow>(globalFiltered, {
    filter: { searchFields: ['name', 'namespace', 'version', 'status'] },
    sort: { defaultField: 'status', defaultDirection: 'asc' },
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-2">
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={52} className="flex-1" />
          <Skeleton variant="rounded" height={52} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={36} />
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Radio className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t('corednsStatus.noServers')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Aggregate metrics */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-xs text-muted-foreground">{t('corednsStatus.totalQueries')}</p>
          <span className="text-sm font-semibold">{rawData.totalQueries.toLocaleString()}</span>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-xs text-muted-foreground">{t('corednsStatus.overallCacheHitRate')}</p>
          <span className="text-sm font-semibold">
            {Math.round(rawData.overallCacheHitRate * 100)}%
          </span>
        </div>
      </div>

      <div className="mb-3">
        <CardSearchInput
          value={filters.search}
          onChange={filters.setSearch}
          placeholder={t('corednsStatus.searchPlaceholder')}
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
            title={row.uptime}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate">{row.name}</span>
              <ClusterBadge cluster={row.cluster} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={STATUS_COLORS[row.status] ?? 'text-muted-foreground'}>
                {row.status}
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span>{row.version}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{Math.round(row.queriesPerSecond)} qps</span>
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
