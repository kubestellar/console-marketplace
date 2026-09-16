import { Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OpenYurtNodePool, OpenYurtGateway } from './demoData'
import { POOL_STATUS_CONFIG, POOL_TYPE_CONFIG, GATEWAY_STATUS_CONFIG } from './statusConfig'

export function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('openyurt.syncedJustNow')
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return t('openyurt.syncedJustNow')
    if (diff < hour) return t('openyurt.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('openyurt.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('openyurt.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

export function StatTile({
  icon,
  label,
  value,
  colorClass,
  borderClass,
}: {
  icon: React.ReactNode
  label: string
  value: number
  colorClass: string
  borderClass: string
}) {
  return (
    <div className={`p-3 rounded-lg bg-secondary/30 border ${borderClass}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={`text-xs ${colorClass}`}>{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
    </div>
  )
}

export function NodeReadinessBar({
  ready,
  total,
}: {
  ready: number
  total: number
}) {
  const pct = total > 0 ? Math.min((ready / total) * 100, 100) : 0
  const allReady = ready === total && total > 0
  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute h-full rounded-full transition-all ${allReady ? 'bg-green-500' : 'bg-yellow-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function NodePoolRow({ pool }: { pool: OpenYurtNodePool }) {
  const { t } = useTranslation('cards')
  const statusCfg = POOL_STATUS_CONFIG[pool.status]
  const typeCfg = POOL_TYPE_CONFIG[pool.type]

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {statusCfg.icon}
          <span className="text-xs font-medium truncate">{pool.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {pool.readyNodes}/{pool.nodeCount} {t('openyurt.nodes', 'nodes')}
          </span>
          <span className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {typeCfg.icon}
          {typeCfg.label}
        </span>
        {pool.autonomyEnabled && (
          <span className="flex items-center gap-1 text-purple-400/80">
            <Shield className="w-3 h-3" />
            {t('openyurt.autonomous', 'Autonomous')}
          </span>
        )}
      </div>

      <NodeReadinessBar ready={pool.readyNodes} total={pool.nodeCount} />
    </div>
  )
}

export function GatewayRow({ gw }: { gw: OpenYurtGateway }) {
  const cfg = GATEWAY_STATUS_CONFIG[gw.status]

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-muted/20">
      <div className="flex items-center gap-1.5 min-w-0">
        {cfg.icon}
        <span className="text-xs truncate">{gw.name}</span>
        <span className="text-xs text-muted-foreground truncate">→ {gw.nodePool}</span>
      </div>
      <span className={`text-xs shrink-0 ${cfg.color}`}>{cfg.label}</span>
    </div>
  )
}

export function DemoBadge() {
  const { t } = useTranslation('cards')
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
      data-testid="openyurt-demo-badge"
      title={t('openyurt.demoBadgeHint', 'Showing demo data — live backend unavailable')}
    >
      {t('openyurt.demoBadge', 'Demo')}
    </span>
  )
}
