import {
  ChevronRight,
  Server,
  Play,
  Clock,
  FlaskConical,
  BookOpen,
  Cpu,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import { ICON_COLOR_CLASS, BADGE_COLOR_CLASS } from '../shared/colorClasses'
import { getStatusIcon, getStatusColor } from '../shared/statusVocabulary'
import { formatRelativeTime } from '../shared/timeOffsets'
import type { KubeflowDisplayItem } from './types'

function getCategoryIcon(category: string) {
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

const KUBEFLOW_STATUS_ICON = { building: Play, created: Clock }
const KUBEFLOW_STATUS_COLOR = { building: 'blue', created: 'yellow' }

/** A single Kubeflow resource row within the resource list. */
export function ItemRow({ item }: { item: KubeflowDisplayItem }) {
  const { t } = useTranslation(['cards', 'common'])

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

  const StatusIcon = getStatusIcon(item.status, KUBEFLOW_STATUS_ICON)
  const CategoryIcon = getCategoryIcon(item.category)
  const color = getStatusColor(item.status, KUBEFLOW_STATUS_COLOR)

  return (
    <div
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
          {formatRelativeTime(item.timestamp, t('kubeflowStatus.ago'), {
            subMinute: 'clampToOneMinute',
          })}
        </span>
      </div>
    </div>
  )
}
