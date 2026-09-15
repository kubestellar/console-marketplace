import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Server,
  Play,
  Layers,
  Database,
  HardDrive,
  Boxes,
  Radio,
  CalendarClock,
  PauseCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import {
  ICON_COLOR_CLASS,
  BADGE_COLOR_CLASS,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  type OpenKruiseDisplayItem,
} from './types'

type TFunctionCards = ReturnType<typeof useTranslation>['t']

function getStatusIcon(status: string) {
  switch (status) {
    case 'succeeded':
    case 'healthy':
      return CheckCircle
    case 'failed':
    case 'error':
      return XCircle
    case 'running':
    case 'active':
      return Play
    case 'updating':
    case 'pending':
      return Clock
    case 'suspended':
    case 'paused':
      return PauseCircle
    default:
      return AlertTriangle
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'succeeded':
    case 'healthy':
      return 'green'
    case 'failed':
    case 'error':
      return 'red'
    case 'running':
    case 'active':
      return 'blue'
    case 'updating':
    case 'pending':
      return 'yellow'
    case 'suspended':
    case 'paused':
      return 'gray'
    default:
      return 'orange'
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'cloneset':
      return Layers
    case 'statefulset':
      return Database
    case 'daemonset':
      return HardDrive
    case 'sidecarset':
      return Boxes
    case 'broadcastjob':
      return Radio
    case 'cronjob':
      return CalendarClock
    default:
      return Server
  }
}

function formatTime(timestamp: string, t: TFunctionCards) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < MS_PER_MINUTE) return `<1m ${t('openkruiseStatus.ago')}`
  if (diff < MS_PER_HOUR)
    return `${Math.max(1, Math.floor(diff / MS_PER_MINUTE))}m ${t('openkruiseStatus.ago')}`
  if (diff < MS_PER_DAY)
    return `${Math.floor(diff / MS_PER_HOUR)}h ${t('openkruiseStatus.ago')}`
  return `${Math.floor(diff / MS_PER_DAY)}d ${t('openkruiseStatus.ago')}`
}

/** A single OpenKruise resource row within the resource list. */
export function ItemRow({ item }: { item: OpenKruiseDisplayItem }) {
  const { t } = useTranslation(['cards', 'common'])

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'cloneset':
        return t('openkruiseStatus.cloneSet')
      case 'statefulset':
        return t('openkruiseStatus.advancedStatefulSet')
      case 'daemonset':
        return t('openkruiseStatus.advancedDaemonSet')
      case 'sidecarset':
        return t('openkruiseStatus.sidecarSet')
      case 'broadcastjob':
        return t('openkruiseStatus.broadcastJob')
      case 'cronjob':
        return t('openkruiseStatus.advancedCronJob')
      default:
        return category
    }
  }

  const StatusIcon = getStatusIcon(item.status)
  const CategoryIcon = getCategoryIcon(item.category)
  const color = getStatusColor(item.status)
  const isFailedLike =
    item.status === 'failed' ||
    item.status === 'error' ||
    item.status === 'degraded'

  return (
    <div
      className={`p-3 rounded-lg ${
        isFailedLike
          ? 'bg-red-500/10 border border-red-500/20'
          : 'bg-secondary/30'
      } hover:bg-secondary/50 transition-colors cursor-pointer group`}
      title={`${item.name} \u2014 ${getCategoryLabel(item.category)}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span title={`${t('common:common.status')}: ${item.status}`}>
            <StatusIcon
              className={`w-4 h-4 ${ICON_COLOR_CLASS[color] ?? ICON_COLOR_CLASS.orange}`}
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
          {isFailedLike && (
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
                  name: t('openkruiseStatus.issueName', {
                    category: getCategoryLabel(item.category),
                    status: item.status,
                  }),
                  message: t('openkruiseStatus.issueMessage', {
                    category: getCategoryLabel(item.category).toLowerCase(),
                    name: item.name,
                    status: item.status,
                  }),
                },
              ]}
            />
          )}
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${BADGE_COLOR_CLASS[color] ?? BADGE_COLOR_CLASS.orange}`}
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
        <span className="shrink-0" title={getCategoryLabel(item.category)}>
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
          {formatTime(item.timestamp, t)}
        </span>
      </div>
    </div>
  )
}
