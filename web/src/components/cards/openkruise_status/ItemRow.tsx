import {
  Server,
  Clock,
  Layers,
  Database,
  HardDrive,
  Boxes,
  Radio,
  CalendarClock,
  PauseCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemRow as SharedItemRow } from '../shared/ItemRow'
import { type OpenKruiseDisplayItem } from './types'

const OPENKRUISE_STATUS_ICON = {
  updating: Clock,
  suspended: PauseCircle,
  paused: PauseCircle,
}
const OPENKRUISE_STATUS_COLOR = {
  updating: 'yellow',
  suspended: 'gray',
  paused: 'gray',
}

function getCategoryIcon(category: OpenKruiseDisplayItem['category']) {
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

/** A single OpenKruise resource row within the resource list. */
export function ItemRow({ item }: { item: OpenKruiseDisplayItem }) {
  const { t } = useTranslation(['cards', 'common'])

  const getCategoryLabel = (category: OpenKruiseDisplayItem['category']) => {
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

  return (
    <SharedItemRow
      item={item}
      getCategoryIcon={getCategoryIcon}
      getCategoryLabel={getCategoryLabel}
      statusIconOverrides={OPENKRUISE_STATUS_ICON}
      statusColorOverrides={OPENKRUISE_STATUS_COLOR}
      agoLabel={t('openkruiseStatus.ago')}
      issueBuilder={(row, categoryLabel) => [
        {
          name: t('openkruiseStatus.issueName', {
            category: categoryLabel,
            status: row.status,
          }),
          message: t('openkruiseStatus.issueMessage', {
            category: categoryLabel.toLowerCase(),
            name: row.name,
            status: row.status,
          }),
        },
      ]}
    />
  )
}
