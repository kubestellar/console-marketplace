import { useState, useMemo } from 'react'
import { Server } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import { useKubeflowStatus } from './useKubeflowStatus'
import { useDisplayItems } from './useDisplayItems'
import { ItemRow } from './ItemRow'
import {
  SORT_OPTIONS_KEYS,
  type CategoryOption,
  type SortByOption,
  type KubeflowDisplayItem,
} from './types'

interface KubeflowStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export function KubeflowStatus({ config }: KubeflowStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = useMemo(
    () =>
      SORT_OPTIONS_KEYS.map(opt => ({
        value: opt.value,
        label: String(t(opt.labelKey)),
      })),
    [t],
  )

  // --- 1. useCardLoadingState  (required hook #1) ---
  // --- 2. useDemoMode          (required hook #2) ---
  // --- 3. useGlobalFilters     (required hook #3) ---
  // --- 4. useTranslation       (required hook #4, already called above) ---
  // --- 5. isDemoData wiring    (required pattern #5, see below) ---

  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()

  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>(
    '' as CategoryOption,
  )

  // Live data comes from useKubeflowStatus (backed by useCache). It falls
  // back to KUBEFLOW_DEMO_DATA via useCache's demoWhenEmpty path when the
  // fetcher fails or returns nothing, so the card always has something to
  // render.
  const {
    data: rawData,
    isLoading: dataLoading,
    isRefreshing: dataRefreshing,
    isDemoFallback,
  } = useKubeflowStatus()

  // isDemoData is true whenever we're showing demo-sourced data — explicit
  // demo mode or the live fetcher fell back.
  const isDemoData = isDemoMode || isDemoFallback

  // #1 + #5  Report loading / demo state to CardWrapper
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: dataLoading,
    isRefreshing: dataRefreshing,
    isDemoData,
  })

  // #3  Transform every Kubeflow resource into a unified display item,
  // then apply the global cluster filter and the resource-type selector.
  const { globalFiltered, categoryFiltered } = useDisplayItems(
    rawData,
    t,
    selectedClusters,
    selectedCategory,
  )

  // Shared card data hook (filter, sort, paginate) --------------------
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
  } = useCardData<KubeflowDisplayItem, SortByOption>(categoryFiltered)

  // Summary counts (from global+category filtered set, before search)
  const activeCount = globalFiltered.filter(
    i =>
      i.status === 'running' ||
      i.status === 'active' ||
      i.status === 'building',
  ).length
  const failedCount = globalFiltered.filter(
    i => i.status === 'failed' || i.status === 'error',
  ).length

  // --- Skeleton state ------------------------------------------------
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

  // --- Empty state ---------------------------------------------------
  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('kubeflowStatus.noResources')}</p>
        <p className="text-xs mt-1">
          {t('kubeflowStatus.connectCluster')}
        </p>
      </div>
    )
  }

  // --- Main render ---------------------------------------------------
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
        <select
          value={selectedCategory}
          onChange={e =>
            setSelectedCategory(e.target.value as CategoryOption)
          }
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
          title={t('kubeflowStatus.filterByResource')}
        >
          <option value="">{t('kubeflowStatus.allResources')}</option>
          <option value="pipeline">
            {t('kubeflowStatus.pipelineRuns')}
          </option>
          <option value="experiment">
            {t('kubeflowStatus.experiments')}
          </option>
          <option value="notebook">
            {t('kubeflowStatus.notebooks')}
          </option>
          <option value="training">
            {t('kubeflowStatus.trainingJobs')}
          </option>
        </select>
      </div>

      {availableClusters.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {t('kubeflowStatus.noClusters')}
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
            placeholder={t('kubeflowStatus.searchPlaceholder')}
            className="mb-4"
          />

          {/* Summary badges */}
          <div className="flex gap-2 mb-4">
            <div
              className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center cursor-default"
              title={`${totalItems} ${t('kubeflowStatus.totalResources')}`}
            >
              <span className="text-lg font-bold text-blue-400">
                {totalItems}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('common:common.total')}
              </p>
            </div>
            <div
              className="flex-1 p-2 rounded-lg bg-green-500/10 text-center cursor-default"
              title={`${activeCount} ${t('kubeflowStatus.activeResources')}`}
            >
              <span className="text-lg font-bold text-green-400">
                {activeCount}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('kubeflowStatus.active')}
              </p>
            </div>
            <div
              className="flex-1 p-2 rounded-lg bg-red-500/10 text-center cursor-default"
              title={`${failedCount} ${t('kubeflowStatus.failedResources')}`}
            >
              <span className="text-lg font-bold text-red-400">
                {failedCount}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('common:common.failed')}
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
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {t('kubeflowStatus.footer', {
              count: totalItems,
              scope:
                localClusterFilter.length === 1
                  ? localClusterFilter[0]
                  : t('kubeflowStatus.nClustersScope', {
                      count: availableClusters.length,
                    }),
            })}
          </div>
        </>
      )}
    </div>
  )
}
