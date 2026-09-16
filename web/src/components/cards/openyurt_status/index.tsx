import { useState } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Radio,
  Server,
  Wifi,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useOpenYurtStatus } from './useOpenYurtStatus'
import { StatTile, NodePoolRow, GatewayRow, DemoBadge, useFormatRelativeTime } from './components'

interface OpenYurtStatusProps {
  config?: {
    cluster?: string
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpenYurtStatus({ config }: OpenYurtStatusProps = {}) {
  const { t } = useTranslation('cards')
  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()
  const formatRelativeTime = useFormatRelativeTime()

  // Resolve the cluster for cluster-scoped endpoints. Config wins, then the
  // first globally-selected cluster, else undefined (single-cluster context).
  const cluster = config?.cluster ?? selectedClusters?.[0]

  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
  } = useOpenYurtStatus(cluster)

  const [search, setSearch] = useState('')

  const nodePools = data.nodePools || []
  const gateways = data.gateways || []
  const controllerPods = data.controllerPods || { ready: 0, total: 0 }
  const fetchError = data.fetchError ?? null

  // isDemoData is true whenever we're showing demo-sourced data — either the
  // user flipped demo mode explicitly, or the live fetcher failed/returned
  // nothing and useCache fell back to OPENYURT_DEMO_DATA. Mirrors the
  // pattern from Resource Quota / Ingress (PRs #9356, #9357).
  const isDemoData = isDemoMode || isDemoFallback

  const hasAnyData =
    nodePools.length > 0 ||
    gateways.length > 0 ||
    controllerPods.total > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({ isLoading, hasAnyData, isFailed })

  const stats = {
    totalPools: nodePools.length,
    readyPools: nodePools.filter(p => p.status === 'ready').length,
    edgePools: nodePools.filter(p => p.type === 'edge').length,
    connectedGateways: gateways.filter(g => g.status === 'connected').length,
  }

  const filteredPools = (() => {
    if (!search.trim()) return nodePools
    const q = search.toLowerCase()
    return nodePools.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q),
    )
  })()

  // ── Loading ──────────────────────────────────────────────────────────────
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4" data-testid="openyurt-skeleton">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={120} height={28} />
          <Skeleton variant="rounded" width={80} height={20} />
        </div>
        <SkeletonStats className="grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  // ── Hard error with no cached data: render a scoped error message ────────
  if (showEmptyState && isFailed && !hasAnyData && !isDemoData) {
    const msg = fetchError
      ? t(`openyurt.fetchError_${fetchError.resource}`, {
          defaultValue:
            fetchError.resource === 'nodepools'
              ? 'Failed to list nodepools.apps.openyurt.io — check RBAC.'
              : fetchError.resource === 'gateways'
                ? 'Failed to list gateways.raven.openyurt.io — check RBAC.'
                : 'Failed to fetch OpenYurt pods.',
          message: fetchError.message,
        })
      : t('openyurt.fetchError', 'Failed to fetch OpenYurt status')
    return (
      <div
        className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2"
        data-testid="openyurt-error"
      >
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400 text-center max-w-xs">{msg}</p>
      </div>
    )
  }

  // ── Not installed ─────────────────────────────────────────────────────────
  if (data.health === 'not-installed' && !isDemoData) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Radio className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('openyurt.notInstalled', 'OpenYurt not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'openyurt.notInstalledHint',
            'No OpenYurt controller pods found. Deploy OpenYurt to enable edge computing features.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'

  // Demo fallback gives a yellow outline so the user can visually distinguish
  // demo data from live data at a glance.
  const rootOutlineClass = isDemoData
    ? 'ring-1 ring-yellow-500/30 rounded-lg'
    : ''

  return (
    <div
      className={`h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden ${rootOutlineClass}`}
      data-testid="openyurt-card"
    >
      {/* ── Header: health badge + controller pods + demo badge + last check ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}
          >
            {isHealthy ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {isHealthy
              ? t('openyurt.healthy', 'Healthy')
              : t('openyurt.degraded', 'Degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {controllerPods.ready}/{controllerPods.total}{' '}
            {t('openyurt.controllerPods', 'pods')}
          </span>
          {isDemoData && <DemoBadge />}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Soft-error banner when we fell back to demo but one sub-fetch
          still failed — lets the user know which RBAC is missing. */}
      {!isDemoMode && fetchError && (
        <div className="text-[11px] px-2 py-1 rounded-md bg-red-500/10 text-red-300 border border-red-500/20">
          {fetchError.resource === 'nodepools' &&
            t('openyurt.fetchError_nodepools', {
              defaultValue:
                'Failed to list nodepools.apps.openyurt.io — check RBAC.',
            })}
          {fetchError.resource === 'gateways' &&
            t('openyurt.fetchError_gateways', {
              defaultValue:
                'Failed to list gateways.raven.openyurt.io — check RBAC.',
            })}
          {fetchError.resource === 'pods' &&
            t('openyurt.fetchError_pods', {
              defaultValue: 'Failed to fetch OpenYurt pods.',
            })}
        </div>
      )}

      {nodePools.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            icon={<Server className="w-4 h-4 text-blue-400" />}
            label={t('openyurt.totalNodes', 'Nodes')}
            value={data.totalNodes}
            colorClass="text-blue-400"
            borderClass="border-blue-500/20"
          />
          <StatTile
            icon={<Radio className="w-4 h-4 text-purple-400" />}
            label={t('openyurt.edgePools', 'Edge Pools')}
            value={stats.edgePools}
            colorClass="text-purple-400"
            borderClass="border-purple-500/20"
          />
          <StatTile
            icon={<CheckCircle className="w-4 h-4 text-green-400" />}
            label={t('openyurt.readyPools', 'Ready')}
            value={stats.readyPools}
            colorClass="text-green-400"
            borderClass="border-green-500/20"
          />
          <StatTile
            icon={<Wifi className="w-4 h-4 text-cyan-400" />}
            label={t('openyurt.gateways', 'Gateways')}
            value={stats.connectedGateways}
            colorClass="text-cyan-400"
            borderClass="border-cyan-500/20"
          />
        </div>
      )}

      {nodePools.length > 0 && (
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('openyurt.searchPlaceholder', 'Search node pools…')}
        />
      )}

      <div className="flex-1 space-y-2 overflow-y-auto">
        {filteredPools.length > 0 ? (
          filteredPools.map(pool => (
            <NodePoolRow key={pool.name} pool={pool} />
          ))
        ) : nodePools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
            <Radio className="w-6 h-6 opacity-40" />
            <p className="text-sm">{t('openyurt.noNodePools', 'Controller running')}</p>
            <p className="text-xs text-center">
              {t(
                'openyurt.noNodePoolsHint',
                'NodePool data requires the OpenYurt CRD API.',
              )}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {t('openyurt.noSearchResults', 'No node pools match your search.')}
          </div>
        )}
      </div>

      {gateways.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">
            {t('openyurt.ravenGateways', 'Raven Gateways')}
          </div>
          {gateways.map(gw => (
            <GatewayRow key={gw.name} gw={gw} />
          ))}
        </div>
      )}
    </div>
  )
}
