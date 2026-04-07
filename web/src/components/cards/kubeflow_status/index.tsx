import { useState, useMemo } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Server,
  Play,
  FlaskConical,
  BookOpen,
  Cpu,
} from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
  CardAIActions,
} from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import {
  KUBEFLOW_DEMO_DATA,
  type KubeflowDemoData,
} from './demoData'

interface KubeflowStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

/** Unified display item that all four Kubeflow resource types map into. */
interface KubeflowDisplayItem {
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

type CategoryOption = '' | 'pipeline' | 'experiment' | 'notebook' | 'training'
type SortByOption = 'status' | 'name' | 'category' | 'timestamp'
type SortTranslationKey =
  | 'common:common.status'
  | 'common:common.name'
  | 'cards:kubeflowStatus.category'
  | 'cards:kubeflowStatus.updated'

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  error: 0,
  degraded: 1,
  restarting: 1,
  pending: 2,
  created: 2,
  terminating: 2,
  suspended: 3,
  running: 4,
  active: 4,
  building: 4,
  succeeded: 5,
  healthy: 5,
  stopped: 6,
  idle: 6,
  skipped: 7,
}

const SORT_OPTIONS_KEYS: ReadonlyArray<{
  value: SortByOption
  labelKey: SortTranslationKey
}> = [
  { value: 'status', labelKey: 'common:common.status' },
  { value: 'name', labelKey: 'common:common.name' },
  { value: 'category', labelKey: 'cards:kubeflowStatus.category' },
  { value: 'timestamp', labelKey: 'cards:kubeflowStatus.updated' },
]

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

  const { isLoading: clustersLoading } = useClusters()
  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()

  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>(
    '' as CategoryOption,
  )

  // Data source -------------------------------------------------------
  // In production a real data hook (e.g. useCachedKubeflowData) would
  // fetch live data and fall back to demo data automatically, similar to
  // useCachedHelmReleases. Until that hook exists we source data from
  // useDemoMode and the static demo dataset.
  const isDemoData = isDemoMode
  const rawData: KubeflowDemoData = KUBEFLOW_DEMO_DATA

  // #1 + #5  Report loading / demo state to CardWrapper
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading,
    isRefreshing: false,
    hasAnyData:
      rawData.pipelineRuns.length > 0 ||
      rawData.notebooks.length > 0 ||
      rawData.trainingJobs.length > 0,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData,
  })

  // Transform every Kubeflow resource into a unified display item -----
  const allItems = useMemo<KubeflowDisplayItem[]>(() => {
    const items: KubeflowDisplayItem[] = []

    for (const run of rawData.pipelineRuns) {
      const metricsStr = Object.entries(run.metrics)
        .map(([k, v]) =>
          `${k}: ${typeof v === 'number' && v < 1 ? (v * 100).toFixed(1) + '%' : v}`,
        )
        .join(', ')
      items.push({
        id: run.id,
        name: run.name,
        namespace: run.namespace,
        cluster: run.cluster,
        category: 'pipeline',
        status: run.status,
        primaryDetail: run.pipelineName,
        secondaryDetail: metricsStr || run.experiment,
        timestamp: run.createdAt,
      })
    }

    for (const exp of rawData.experiments) {
      const status =
        exp.activeRuns > 0
          ? 'active'
          : exp.failedRuns > exp.totalRuns * 0.1
            ? 'degraded'
            : 'healthy'
      items.push({
        id: exp.id,
        name: exp.name,
        namespace: exp.namespace,
        cluster: exp.cluster,
        category: 'experiment',
        status,
        primaryDetail: `${exp.succeededRuns}/${exp.totalRuns} ${t('kubeflowStatus.passed')}`,
        secondaryDetail: exp.description,
        timestamp: exp.lastRunAt,
      })
    }

    for (const nb of rawData.notebooks) {
      const gpuStr =
        nb.gpu > 0 ? `, ${nb.gpu} ${t('kubeflowStatus.gpu')}` : ''
      items.push({
        id: `nb-${nb.name}`,
        name: nb.name,
        namespace: nb.namespace,
        cluster: nb.cluster,
        category: 'notebook',
        status: nb.status,
        primaryDetail: `${nb.serverType} \u2022 ${nb.cpu} ${t('kubeflowStatus.cpu')}, ${nb.memory}${gpuStr}`,
        secondaryDetail: nb.image.split('/').pop() || nb.image,
        timestamp: nb.lastActivity,
      })
    }

    for (const job of rawData.trainingJobs) {
      const epochStr =
        job.epoch !== null && job.totalEpochs !== null
          ? `${t('kubeflowStatus.epoch')} ${job.epoch}/${job.totalEpochs}`
          : ''
      items.push({
        id: `tj-${job.name}`,
        name: job.name,
        namespace: job.namespace,
        cluster: job.cluster,
        category: 'training',
        status: job.status,
        primaryDetail: `${job.framework} \u2022 ${job.workers} ${t('kubeflowStatus.workers')}`,
        secondaryDetail: epochStr,
        timestamp: job.createdAt,
      })
    }

    return items
  }, [rawData, t])

  // #3  Respect global cluster filters
  const globalFiltered = useMemo(() => {
    if (!selectedClusters || selectedClusters.length === 0) return allItems
    return allItems.filter(item => selectedClusters.includes(item.cluster))
  }, [allItems, selectedClusters])

  // Pre-filter by the resource-type selector
  const categoryFiltered = useMemo(() => {
    if (!selectedCategory) return globalFiltered
    return globalFiltered.filter(item => item.category === selectedCategory)
  }, [globalFiltered, selectedCategory])

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
  } = useCardData<KubeflowDisplayItem, SortByOption>(categoryFiltered, {
    filter: {
      searchFields: [
        'name',
        'namespace',
        'primaryDetail',
        'secondaryDetail',
      ] as (keyof KubeflowDisplayItem)[],
      clusterField: 'cluster' as keyof KubeflowDisplayItem,
      statusField: 'status' as keyof KubeflowDisplayItem,
      storageKey: 'kubeflow-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) =>
          (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
        name: (a, b) => a.name.localeCompare(b.name),
        category: (a, b) => a.category.localeCompare(b.category),
        timestamp: (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      },
    },
    defaultLimit: 5,
  })

  // Helpers -----------------------------------------------------------
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'healthy':
        return CheckCircle
      case 'failed':
      case 'error':
        return XCircle
      case 'running':
      case 'active':
      case 'building':
        return Play
      case 'pending':
      case 'created':
        return Clock
      default:
        return AlertTriangle
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'healthy':
        return 'green'
      case 'failed':
      case 'error':
        return 'red'
      case 'running':
      case 'active':
      case 'building':
        return 'blue'
      case 'pending':
      case 'created':
        return 'yellow'
      default:
        return 'orange'
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'pipeline':
        return Play
      case 'experiment':
        return FlaskConical
      case 'notebook':
        return BookOpen
      case 'training':
        return Cpu
      default:
        return Server
    }
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'pipeline':
        return t('kubeflowStatus.pipelineRun')
      case 'experiment':
        return t('kubeflowStatus.experiment')
      case 'notebook':
        return t('kubeflowStatus.notebook')
      case 'training':
        return t('kubeflowStatus.trainingJob')
      default:
        return category
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 3600000)
      return `${Math.max(1, Math.floor(diff / 60000))}m ${t('kubeflowStatus.ago')}`
    if (diff < 86400000)
      return `${Math.floor(diff / 3600000)}h ${t('kubeflowStatus.ago')}`
    return `${Math.floor(diff / 86400000)}d ${t('kubeflowStatus.ago')}`
  }

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
            {displayItems.map(item => {
              const StatusIcon = getStatusIcon(item.status)
              const CategoryIcon = getCategoryIcon(item.category)
              const color = getStatusColor(item.status)

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg ${
                    item.status === 'failed' || item.status === 'error'
                      ? 'bg-red-500/10 border border-red-500/20'
                      : 'bg-secondary/30'
                  } hover:bg-secondary/50 transition-colors cursor-pointer group`}
                  title={`${item.name} \u2014 ${getCategoryLabel(item.category)}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span title={`${t('common:common.status')}: ${item.status}`}>
                        <StatusIcon
                          className={`w-4 h-4 text-${color}-400`}
                        />
                      </span>
                      <span
                        className="text-sm text-foreground font-medium group-hover:text-purple-400"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(item.status === 'failed' ||
                        item.status === 'error' ||
                        item.status === 'degraded') && (
                        <CardAIActions
                          resource={{
                            kind: getCategoryLabel(item.category),
                            name: item.name,
                            namespace: item.namespace,
                            cluster: item.cluster,
                            status: item.status,
                          }}
                          issues={[
                            {
                              name: `${getCategoryLabel(item.category)} ${item.status}`,
                              message: `Kubeflow ${getCategoryLabel(item.category).toLowerCase()} ${item.name} is in ${item.status} state`,
                            },
                          ]}
                        />
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}
                        title={`${t('common:common.status')}: ${item.status}`}
                      >
                        {item.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground min-w-0">
                    {item.cluster && (
                      <div className="shrink-0">
                        <ClusterBadge cluster={item.cluster} size="sm" />
                      </div>
                    )}
                    <span
                      className="shrink-0"
                      title={getCategoryLabel(item.category)}
                    >
                      <CategoryIcon className="w-3 h-3 inline mr-1" />
                      {getCategoryLabel(item.category)}
                    </span>
                    <span className="truncate" title={item.primaryDetail}>
                      {item.primaryDetail}
                    </span>
                    {item.secondaryDetail && (
                      <span
                        className="truncate text-muted-foreground/70"
                        title={item.secondaryDetail}
                      >
                        {item.secondaryDetail}
                      </span>
                    )}
                    <span
                      className="ml-auto shrink-0 whitespace-nowrap"
                      title={new Date(item.timestamp).toLocaleString()}
                    >
                      {formatTime(item.timestamp)}
                    </span>
                  </div>
                </div>
              )
            })}
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
