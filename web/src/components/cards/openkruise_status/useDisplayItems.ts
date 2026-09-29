import type { useTranslation } from 'react-i18next'
import type { OpenKruiseStatus } from './useOpenKruiseStatus'
import type { OpenKruiseDisplayItem } from './types'

type TFunction = ReturnType<typeof useTranslation>['t']

/**
 * Pure mapping of raw OpenKruise resources (CloneSets, Advanced
 * StatefulSets/DaemonSets, SidecarSets, BroadcastJobs, AdvancedCronJobs)
 * into the unified `OpenKruiseDisplayItem` shape the card renders.
 *
 * Kept as a standalone function (rather than inline in a useMemo) so it can
 * be unit tested without mounting the component. The `OpenKruiseStatus`
 * card plugs this directly into `useCardShell`'s `toRows`; the shell then
 * applies the global cluster filter, the in-card resource-type filter, and
 * pagination.
 */
export function mapToDisplayItems(
  rawData: OpenKruiseStatus,
  t: TFunction,
): OpenKruiseDisplayItem[] {
  const items: OpenKruiseDisplayItem[] = []

  for (const cs of rawData.cloneSets) {
    const partitionStr =
      cs.partition > 0
        ? `, ${t('openkruiseStatus.partition')} ${cs.partition}`
        : ''
    items.push({
      id: `cs-${cs.cluster}-${cs.namespace}-${cs.name}`,
      name: cs.name,
      namespace: cs.namespace,
      cluster: cs.cluster,
      category: 'cloneset',
      status: cs.status,
      primaryDetail: `${cs.readyReplicas}/${cs.replicas} ${t('openkruiseStatus.ready')} \u2022 ${cs.updateStrategy}${partitionStr}`,
      secondaryDetail: cs.image.split('/').pop() || cs.image,
      timestamp: cs.updatedAt,
    })
  }

  for (const ss of rawData.advancedStatefulSets) {
    items.push({
      id: `ss-${ss.cluster}-${ss.namespace}-${ss.name}`,
      name: ss.name,
      namespace: ss.namespace,
      cluster: ss.cluster,
      category: 'statefulset',
      status: ss.status,
      primaryDetail: `${ss.readyReplicas}/${ss.replicas} ${t('openkruiseStatus.ready')} \u2022 ${ss.podManagementPolicy} \u2022 ${ss.updateStrategy}`,
      secondaryDetail: ss.image.split('/').pop() || ss.image,
      timestamp: ss.updatedAt,
    })
  }

  for (const ds of rawData.advancedDaemonSets) {
    items.push({
      id: `ds-${ds.cluster}-${ds.namespace}-${ds.name}`,
      name: ds.name,
      namespace: ds.namespace,
      cluster: ds.cluster,
      category: 'daemonset',
      status: ds.status,
      primaryDetail: `${ds.numberReady}/${ds.desiredScheduled} ${t('openkruiseStatus.nodes')} \u2022 ${ds.rollingUpdateType}`,
      secondaryDetail: ds.image.split('/').pop() || ds.image,
      timestamp: ds.updatedAt,
    })
  }

  for (const sc of rawData.sidecarSets) {
    const containers = (sc.sidecarContainers || []).join(', ')
    items.push({
      id: `sc-${sc.cluster}-${sc.name}`,
      name: sc.name,
      namespace: '-',
      cluster: sc.cluster,
      category: 'sidecarset',
      status: sc.status,
      primaryDetail: `${sc.injectedPods}/${sc.matchedPods} ${t('openkruiseStatus.injected')} \u2022 ${sc.readyPods} ${t('openkruiseStatus.ready')}`,
      secondaryDetail: `${t('openkruiseStatus.containers')}: ${containers}`,
      timestamp: sc.updatedAt,
    })
  }

  for (const bj of rawData.broadcastJobs) {
    items.push({
      id: `bj-${bj.cluster}-${bj.namespace}-${bj.name}`,
      name: bj.name,
      namespace: bj.namespace,
      cluster: bj.cluster,
      category: 'broadcastjob',
      status: bj.status,
      primaryDetail: `${bj.succeeded}/${bj.desired} ${t('openkruiseStatus.succeeded')} \u2022 ${bj.active} ${t('openkruiseStatus.active')} \u2022 ${bj.failed} ${t('common:common.failed')}`,
      secondaryDetail: `${t('openkruiseStatus.completionPolicy')}: ${bj.completionPolicyType}`,
      timestamp: bj.completedAt ?? bj.startedAt,
    })
  }

  for (const cj of rawData.advancedCronJobs) {
    items.push({
      id: `cj-${cj.cluster}-${cj.namespace}-${cj.name}`,
      name: cj.name,
      namespace: cj.namespace,
      cluster: cj.cluster,
      category: 'cronjob',
      status: cj.status,
      primaryDetail: `${cj.schedule} \u2022 ${cj.templateKind} \u2022 ${cj.active} ${t('openkruiseStatus.active')}`,
      secondaryDetail: `${cj.successfulRuns} ${t('openkruiseStatus.runs')}, ${cj.failedRuns} ${t('common:common.failed')}`,
      timestamp: cj.lastScheduleTime ?? rawData.lastCheckTime,
    })
  }

  return items
}
