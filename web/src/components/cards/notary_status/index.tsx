import { useMemo } from 'react'
import {
  ShieldCheck,
  ShieldOff,
  Shield,
  FileCheck,
  AlertTriangle,
  Server,
  ExternalLink,
} from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  CardPaginationFooter,
} from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'   // required hook #1
import { useDemoMode } from '../../hooks/useDemoMode'    // required hook #2
import { useGlobalFilters } from '../../hooks/useGlobalFilters' // required hook #3
import { useTranslation } from 'react-i18next'           // required hook #4
import {
  NOTARY_DEMO_DATA,
  type NotaryDemoData,
  type NotaryDemoClusterStatus,
  type NotaryDemoTrustPolicy,
} from './demoData'

// Re-export types so tree-shaking keeps them
export type { NotaryDemoData, NotaryDemoClusterStatus, NotaryDemoTrustPolicy }

interface NotaryStatusProps {
  config?: {
    cluster?: string
  }
}

/** Flat display row derived from NotaryDemoClusterStatus */
interface NotaryDisplayRow {
  id: string
  cluster: string
  installed: boolean
  signedImages: number
  unsignedImages: number
  trustPolicies: NotaryDemoTrustPolicy[]
}

export function NotaryStatus({ config: _config }: NotaryStatusProps) {
  // required hook #4 — every user-facing string goes through t()
  const { t } = useTranslation(['cards', 'common'])

  // --- required hook #2 ---
  const { isDemoMode } = useDemoMode()

  // --- required hook #3 ---
  const { selectedClusters } = useGlobalFilters()

  // Data source: use demo data until a real data hook exists (same rationale as KubeflowStatus)
  const isDemoData = isDemoMode                      // required pattern #5
  const rawData: NotaryDemoData = NOTARY_DEMO_DATA

  // --- required hook #1 + pattern #5: wire isDemoData into useCardLoadingState ---
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: false,
    isRefreshing: false,
    hasAnyData: rawData.clusters.length > 0,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData,                                      // pattern #5
  })

  // Flatten clusters into display rows
  const allRows = useMemo<NotaryDisplayRow[]>(() => {
    return rawData.clusters.map(c => ({
      id: c.cluster,
      cluster: c.cluster,
      installed: c.installed,
      signedImages: c.signedImages,
      unsignedImages: c.unsignedImages,
      trustPolicies: c.trustPolicies,
    }))
  }, [rawData])

  // required hook #3 — filter rows by selectedClusters from global filters
  const globalFiltered = useMemo(() => {
    if (!selectedClusters || selectedClusters.length === 0) return allRows
    return allRows.filter((row: NotaryDisplayRow) => selectedClusters.includes(row.cluster))
  }, [allRows, selectedClusters])

  // Shared card data hook (pagination)
  const {
    items: displayRows,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    containerRef,
    containerStyle,
  } = useCardData<NotaryDisplayRow, 'cluster'>(globalFiltered, {
    filter: {
      searchFields: ['cluster'] as (keyof NotaryDisplayRow)[],
      clusterField: 'cluster' as keyof NotaryDisplayRow,
      storageKey: 'notary-status',
    },
    sort: {
      defaultField: 'cluster',
      defaultDirection: 'asc',
      comparators: {
        cluster: (a: NotaryDisplayRow, b: NotaryDisplayRow) => a.cluster.localeCompare(b.cluster),
      },
    },
    defaultLimit: 5,
  })

  // Summary totals (computed across the global-filtered set, before pagination)
  const totalSigned   = globalFiltered.reduce((s: number, r: NotaryDisplayRow) => s + r.signedImages,          0)
  const totalUnsigned = globalFiltered.reduce((s: number, r: NotaryDisplayRow) => s + r.unsignedImages,        0)
  const totalPolicies = globalFiltered.reduce((s: number, r: NotaryDisplayRow) => s + r.trustPolicies.length,  0)
  const signedPct =
    totalSigned + totalUnsigned > 0
      ? Math.round((totalSigned / (totalSigned + totalUnsigned)) * 100)
      : 0

  // --- Skeleton state ------------------------------------------------
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="flex gap-2 mb-4">
          <Skeleton variant="rounded" height={52} className="flex-1" />
          <Skeleton variant="rounded" height={52} className="flex-1" />
          <Skeleton variant="rounded" height={52} className="flex-1" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={72} />
        </div>
      </div>
    )
  }

  // --- Empty state ---------------------------------------------------
  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <ShieldOff className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t('notaryStatus.notInstalled')}</p>
        <p className="text-xs mt-1">{t('notaryStatus.notInstalledHint')}</p>
        <a
          href="https://notaryproject.dev/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-xs text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('notaryStatus.installGuide')}
        </a>
      </div>
    )
  }

  // --- Main render ---------------------------------------------------
  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">

      {/* Summary badges */}
      <div className="flex gap-2 mb-4">
        <div
          className="flex-1 p-2 rounded-lg bg-green-500/10 text-center cursor-default"
          title={t('notaryStatus.signedCount', { count: totalSigned })}
        >
          <span className="text-lg font-bold text-green-400">{totalSigned}</span>
          <p className="text-xs text-muted-foreground">{t('notaryStatus.signed')}</p>
        </div>
        <div
          className="flex-1 p-2 rounded-lg bg-red-500/10 text-center cursor-default"
          title={t('notaryStatus.unsignedCount', { count: totalUnsigned })}
        >
          <span className="text-lg font-bold text-red-400">{totalUnsigned}</span>
          <p className="text-xs text-muted-foreground">{t('notaryStatus.unsigned')}</p>
        </div>
        <div
          className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center cursor-default"
          title={t('notaryStatus.policyCount', { count: totalPolicies })}
        >
          <span className="text-lg font-bold text-blue-400">{totalPolicies}</span>
          <p className="text-xs text-muted-foreground">{t('notaryStatus.clusters')}</p>
        </div>
      </div>

      {/* Signed % bar */}
      {totalSigned + totalUnsigned > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{t('notaryStatus.signedPct', { pct: signedPct })}</span>
            <span>{`${totalSigned + totalUnsigned} total`}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${signedPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Per-cluster rows */}
      <div
        ref={containerRef}
        className="flex-1 space-y-2 overflow-y-auto"
        style={containerStyle}
      >
        {displayRows.map((row: NotaryDisplayRow) => {
          const total = row.signedImages + row.unsignedImages
          const pct = total > 0 ? Math.round((row.signedImages / total) * 100) : 0

          return (
            <div
              key={row.id}
              className={`p-3 rounded-lg ${
                !row.installed
                  ? 'bg-orange-500/10 border border-orange-500/20'
                  : row.unsignedImages > 0
                  ? 'bg-red-500/5 border border-red-500/10'
                  : 'bg-secondary/30'
              } hover:bg-secondary/50 transition-colors group`}
              title={row.cluster}
            >
              {/* Row header: cluster name + installed badge */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {row.installed ? (
                    <ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
                  ) : (
                    <ShieldOff className="w-4 h-4 text-orange-400 shrink-0" />
                  )}
                  <ClusterBadge cluster={row.cluster} />
                </div>
                {!row.installed && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                    {t('notaryStatus.notInstalledShort')}
                  </span>
                )}
              </div>

              {row.installed && (
                <>
                  {/* Signed / unsigned counts */}
                  <div className="flex items-center gap-3 ml-6 text-xs text-muted-foreground mb-2">
                    <span
                      className="flex items-center gap-1 text-green-400"
                      title={t('notaryStatus.signedCount', { count: row.signedImages })}
                    >
                      <Shield className="w-3 h-3" />
                      {t('notaryStatus.signedCount', { count: row.signedImages })}
                    </span>
                    <span
                      className="flex items-center gap-1 text-red-400"
                      title={t('notaryStatus.unsignedCount', { count: row.unsignedImages })}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {t('notaryStatus.unsignedCount', { count: row.unsignedImages })}
                    </span>
                    <span className="ml-auto text-muted-foreground/70">
                      {t('notaryStatus.signedPct', { pct })}
                    </span>
                  </div>

                  {/* Trust policies */}
                  {row.trustPolicies.length > 0 && (
                    <div className="ml-6 flex flex-wrap gap-1">
                      {row.trustPolicies.slice(0, 2).map((policy: NotaryDemoTrustPolicy) => (
                        <span
                          key={policy.name}
                          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400"
                          title={policy.registryScopes.join(', ')}
                        >
                          <FileCheck className="w-2.5 h-2.5" />
                          {policy.name}
                        </span>
                      ))}
                      {row.trustPolicies.length > 2 && (
                        <span className="text-xs text-muted-foreground/70 px-1">
                          {t('notaryStatus.morePolicies', {
                            count: row.trustPolicies.length - 2,
                          })}
                        </span>
                      )}
                    </div>
                  )}
                  {row.trustPolicies.length === 0 && (
                    <p className="ml-6 text-xs text-muted-foreground/60">
                      {t('notaryStatus.trustPolicyCount', { count: 0 })}
                    </p>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-1.5">
        <Server className="w-3 h-3" />
        {t('notaryStatus.clusters')}: {totalItems}
        <a
          href="https://notaryproject.dev/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('notaryStatus.docs')}
        </a>
      </div>
    </div>
  )
}
