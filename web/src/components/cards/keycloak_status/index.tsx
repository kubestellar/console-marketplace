import { useMemo } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  Globe,
  KeyRound,
  ExternalLink,
  Shield,
} from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import {
  CardSearchInput,
  CardPaginationFooter,
} from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import {
  KEYCLOAK_DEMO_DATA,
  type KeycloakDemoData,
  type KeycloakRealm,
  type KeycloakRealmStatus,
} from './demoData'

export type { KeycloakDemoData, KeycloakRealm, KeycloakRealmStatus }

interface KeycloakStatusProps {
  config?: { cluster?: string; namespace?: string }
}

type SortByOption = 'status' | 'name'

const STATUS_ORDER: Record<KeycloakRealmStatus, number> = {
  error: 0,
  degraded: 1,
  provisioning: 2,
  ready: 3,
}

const STATUS_ICON: Record<KeycloakRealmStatus, React.FC<{ className?: string }>> = {
  ready: ({ className }) => <CheckCircle className={className} />,
  degraded: ({ className }) => <AlertTriangle className={className} />,
  provisioning: ({ className }) => <Loader2 className={`${className} animate-spin`} />,
  error: ({ className }) => <XCircle className={className} />,
}

const STATUS_COLOR: Record<KeycloakRealmStatus, string> = {
  ready: 'text-green-400',
  degraded: 'text-yellow-400',
  provisioning: 'text-blue-400',
  error: 'text-red-400',
}

function RealmRow({ realm }: { realm: KeycloakRealm }) {
  const { t } = useTranslation('cards')
  const Icon = STATUS_ICON[realm.status]
  const color = STATUS_COLOR[realm.status]

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
          <span className="text-xs font-medium truncate">{realm.name}</span>
          {!realm.enabled && (
            <span className="text-xs text-muted-foreground/60 shrink-0">
              ({t('keycloak.disabled')})
            </span>
          )}
        </div>
        <span className={`text-xs shrink-0 ${color}`}>{t(`keycloak.${realm.status}`)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{realm.namespace}</span>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {realm.users.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {realm.clients}
          </span>
          {realm.activeSessions > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              <KeyRound className="w-3 h-3" />
              {realm.activeSessions}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function KeycloakStatus({ config: _config }: KeycloakStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()

  const isDemoData = isDemoMode
  const rawData: KeycloakDemoData = KEYCLOAK_DEMO_DATA

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: false,
    isRefreshing: false,
    hasAnyData: rawData.health !== 'not-installed' || rawData.realms.length > 0,
    isFailed: false,
    consecutiveFailures: 0,
    isDemoData,
  })

  const { realms, operatorPods, totalUsers, totalClients } = rawData

  // Global cluster filter (no-op for single-cluster card but required pattern)
  const filteredRealms = useMemo(() => {
    if (!selectedClusters || selectedClusters.length === 0) return realms
    return realms
  }, [realms, selectedClusters])

  const {
    items: displayRealms,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    filters: { search, setSearch },
    containerRef,
    containerStyle,
  } = useCardData<KeycloakRealm, SortByOption>(filteredRealms, {
    filter: {
      searchFields: ['name', 'namespace'] as (keyof KeycloakRealm)[],
      storageKey: 'keycloak-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
        name: (a, b) => a.name.localeCompare(b.name),
      },
    },
    defaultLimit: 'unlimited',
  })

  const stats = {
    ready: realms.filter(r => r.status === 'ready').length,
    issues: realms.filter(r => r.status === 'degraded' || r.status === 'error').length,
  }

  // --- Skeleton ---
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <div className="grid grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={60} />
          ))}
        </div>
        <Skeleton variant="rounded" height={36} />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={56} />
          ))}
        </div>
      </div>
    )
  }

  // --- Not installed / empty state ---
  if (showEmptyState || rawData.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Shield className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t('keycloak.notInstalled')}</p>
        <p className="text-xs mt-1">{t('keycloak.notInstalledHint')}</p>
        <a
          href="https://www.keycloak.org/operator/installation"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-xs text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('keycloak.installGuide')}
        </a>
      </div>
    )
  }

  // --- Main render ---
  const healthColor =
    rawData.health === 'healthy'
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : rawData.health === 'degraded'
      ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
      : 'text-red-400 bg-red-500/10 border-red-500/20'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden gap-3">

      {/* Operator health + pod count */}
      <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${healthColor}`}>
        <span className="font-medium">{t(`keycloak.${rawData.health}`)}</span>
        <span>{t('keycloak.pods')}: {operatorPods.ready}/{operatorPods.total}</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: t('keycloak.realms'), value: realms.length, color: 'text-foreground' },
          { label: t('keycloak.ready'), value: stats.ready, color: 'text-green-400' },
          { label: t('keycloak.sessions'), value: rawData.totalActiveSessions, color: 'text-blue-400' },
          { label: t('keycloak.issues'), value: stats.issues, color: stats.issues > 0 ? 'text-red-400' : 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-2 rounded-lg bg-secondary/30 text-center">
            <span className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</span>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('keycloak.searchPlaceholder')}
      />

      {/* Realm list */}
      <div
        ref={containerRef}
        className="flex-1 space-y-1.5 overflow-y-auto"
        style={containerStyle}
      >
        {displayRealms.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {search ? t('keycloak.noSearchResults') : t('keycloak.noRealms')}
          </p>
        ) : (
          displayRealms.map(realm => <RealmRow key={`${realm.namespace}/${realm.name}`} realm={realm} />)
        )}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Footer */}
      <div className="pt-3 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-3">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{totalUsers.toLocaleString()} {t('keycloak.users')}</span>
        <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{totalClients} {t('keycloak.clients')}</span>
        <a
          href="https://www.keycloak.org/docs/latest/server_admin/"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('keycloak.docs')}
        </a>
      </div>
    </div>
  )
}
