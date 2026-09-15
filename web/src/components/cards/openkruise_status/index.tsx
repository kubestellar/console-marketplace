import { useState, useMemo } from 'react'
import { ExternalLink, Layers, Server } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { Select } from '../../ui/Select'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../../lib/cards/CardComponents'
import { useCardData } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import { useOpenKruiseStatus } from './useOpenKruiseStatus'
import { useDisplayItems } from './useDisplayItems'
import { ItemRow } from './ItemRow'
import {
  SORT_OPTIONS_KEYS,
  type CategoryOption,
  type SortByOption,
  type OpenKruiseDisplayItem,
} from './types'

interface OpenKruiseStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export function OpenKruiseStatus({ config: _config }: OpenKruiseStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = useMemo(
    () =>
      SORT_OPTIONS_KEYS.map(opt => ({
        value: opt.value,
        label: String(t(opt.labelKey)),
      })),
    [t],
  )

  // --- Required hooks ---
  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()

  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>(
    '' as CategoryOption,
  )

  // Live data comes from useOpenKruiseStatus (backed by useCache). It falls
  // back to OPENKRUISE_DEMO_DATA via useCache's demoWhenEmpty path when the
  // fetcher fails or returns nothing, so the card always has something to
  // render.
  const {
    data: rawData,
    isLoading: dataLoading,
    isDemoFallback,
  } = useOpenKruiseStatus()

  // isDemoData is true whenever we're showing demo-sourced data — explicit
  // demo mode or the live fetcher fell back.
  const isDemoData = isDemoMode || isDemoFallback

  const { showSkeleton, showEmptyState } = useCardLoadingState({ isLoading: dataLoading, isDemoData })

  // Transform every OpenKruise resource into a unified display item, then
  // apply the global cluster filter and the resource-type selector.
  const { globalFiltered, categoryFiltered } = useDisplayItems(
    rawData,
    t,
    selectedClusters,
    selectedCategory,
  )

  // Shared card data hook (filter, sort, paginate)
  const {
    items: displayItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle,
  } = useCardData<OpenKruiseDisplayItem, SortByOption>(categoryFiltered)

  // Summary counts (from global+category filtered set, before search)
  const healthyCount = globalFiltered.filter(
    i => i.status === 'healthy' || i.status === 'succeeded',
  ).length
  const failedCount = globalFiltered.filter(
    i => i.status === 'failed' || i.status === 'error' || i.status === 'degraded',
  ).length
  const sidecarInjectedCount = rawData.totalInjectedPods

  // --- Skeleton state ----------------------------------------------
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="flex gap-2 mb-4">
          <Skeleton variant="rounded" height={52} className="flex-1" />
          <Skeleton variant="rounded" height={52} className="flex-1" />
          <Skeleton variant="rounded" height={52} className="flex-1" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  // --- Empty state -------------------------------------------------
  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Layers className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t('openkruiseStatus.noResources')}</p>
        <p className="text-xs mt-1">{t('openkruiseStatus.connectCluster')}</p>
        <a
          href="https://openkruise.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-xs text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('openkruiseStatus.installGuide')}
        </a>
      </div>
    )
  }

  // --- Main render -------------------------------------------------
  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>
        <CardControlsRow
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: v => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* Resource type selector */}
      <div className="mb-4">
        <Select
          value={selectedCategory}
          onChange={e =>
            setSelectedCategory(e.target.value as CategoryOption)
          }
          className="w-full"
          title={t('openkruiseStatus.filterByResource')}
          aria-label={t('openkruiseStatus.filterByResource')}
        >
          <option value="">{t('openkruiseStatus.allResources')}</option>
          <option value="cloneset">
            {t('openkruiseStatus.cloneSets')}
          </option>
          <option value="statefulset">
            {t('openkruiseStatus.advancedStatefulSets')}
          </option>
          <option value="daemonset">
            {t('openkruiseStatus.advancedDaemonSets')}
          </option>
          <option value="sidecarset">
            {t('openkruiseStatus.sidecarSets')}
          </option>
          <option value="broadcastjob">
            {t('openkruiseStatus.broadcastJobs')}
          </option>
          <option value="cronjob">
            {t('openkruiseStatus.advancedCronJobs')}
          </option>
        </Select>
      </div>

      {availableClusters.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {t('openkruiseStatus.noClusters')}
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
                {t('common:common.nClusters', {
                  count: localClusterFilter.length,
                })}
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
                {t('common:common.allClusters')}
              </span>
            )}
          </div>

          {/* Search */}
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder={t('openkruiseStatus.searchPlaceholder')}
            className="mb-4"
          />

          {/* Summary badges */}
          <div className="flex gap-2 mb-4">
            <div
              className="flex-1 p-2 rounded-lg bg-green-500/10 text-center cursor-default"
              title={`${healthyCount} ${t('openkruiseStatus.healthyResources')}`}
            >
              <span className="text-lg font-bold text-green-400">
                {healthyCount}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('openkruiseStatus.healthy')}
              </p>
            </div>
            <div
              className="flex-1 p-2 rounded-lg bg-red-500/10 text-center cursor-default"
              title={`${failedCount} ${t('openkruiseStatus.failedResources')}`}
            >
              <span className="text-lg font-bold text-red-400">
                {failedCount}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('common:common.failed')}
              </p>
            </div>
            <div
              className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center cursor-default"
              title={t('openkruiseStatus.injectedPodsTooltip', {
                count: sidecarInjectedCount,
              })}
            >
              <span className="text-lg font-bold text-blue-400">
                {sidecarInjectedCount}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('openkruiseStatus.sidecarPods')}
              </p>
            </div>
          </div>

          {/* Resource list */}
          <div
            ref={containerRef}
            className="flex-1 space-y-2 overflow-y-auto"
            style={containerStyle}
          >
            {displayItems.map(item => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>

          {/* Pagination */}
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={
              typeof itemsPerPage === 'number' ? itemsPerPage : 10
            }
            onPageChange={goToPage}
            needsPagination={
              needsPagination && itemsPerPage !== 'unlimited'
            }
          />

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-1.5">
            <Server className="w-3 h-3" />
            {t('openkruiseStatus.footer', {
              count: totalItems,
              version: rawData.controllerVersion,
              scope:
                localClusterFilter.length === 1
                  ? localClusterFilter[0]
                  : t('openkruiseStatus.nClustersScope', {
                      count:
                        localClusterFilter.length > 1
                          ? localClusterFilter.length
                          : availableClusters.length,
                    }),
            })}
            <a
              href="https://openkruise.io/docs/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-blue-400 hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              {t('openkruiseStatus.docs')}
            </a>
          </div>
        </>
      )}
    </div>
  )
}
