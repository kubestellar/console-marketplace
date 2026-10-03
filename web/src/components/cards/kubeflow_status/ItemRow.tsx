import { Server, Play, Clock, FlaskConical, BookOpen, Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemRow as SharedItemRow } from '../shared/ItemRow'
import type { KubeflowDisplayItem } from './types'

function getCategoryIcon(category: KubeflowDisplayItem['category']) {
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

/** The red failed-background row style is narrower than the AI-actions
 * eligibility predicate below (degraded rows get AI actions but not the
 * red background) — this mirrors the component's pre-extraction behavior. */
const isRedBackground = (status: string) =>
  status === 'failed' || status === 'error'

/** A single Kubeflow resource row within the resource list. */
export function ItemRow({ item }: { item: KubeflowDisplayItem }) {
  const { t } = useTranslation(['cards', 'common'])

  const getCategoryLabel = (category: KubeflowDisplayItem['category']) => {
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

  return (
    <SharedItemRow
      item={item}
      getCategoryIcon={getCategoryIcon}
      getCategoryLabel={getCategoryLabel}
      statusIconOverrides={KUBEFLOW_STATUS_ICON}
      statusColorOverrides={KUBEFLOW_STATUS_COLOR}
      agoLabel={t('kubeflowStatus.ago')}
      formatRelativeTimeOpts={{ subMinute: 'clampToOneMinute' }}
      isRedBackground={isRedBackground}
      issueBuilder={(row, categoryLabel) => [
        {
          name: `${categoryLabel} ${row.status}`,
          message: `Kubeflow ${categoryLabel.toLowerCase()} ${row.name} is in ${row.status} state`,
        },
      ]}
    />
  )
}
