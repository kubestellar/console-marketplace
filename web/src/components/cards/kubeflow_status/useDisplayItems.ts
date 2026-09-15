import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { KubeflowDemoData } from './demoData'
import type { KubeflowDisplayItem } from './types'

type TFunction = ReturnType<typeof useTranslation>['t']

/**
 * Pure mapping of raw Kubeflow resources (pipeline runs, experiments,
 * notebooks, training jobs) into the unified `KubeflowDisplayItem` shape
 * the card renders.
 *
 * Kept as a standalone function (rather than inline in a useMemo) so it can
 * be unit tested without mounting the component.
 */
export function mapToDisplayItems(
  rawData: KubeflowDemoData,
  t: TFunction,
): KubeflowDisplayItem[] {
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
    const gpuStr = nb.gpu > 0 ? `, ${nb.gpu} ${t('kubeflowStatus.gpu')}` : ''
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
}

/**
 * Transforms raw Kubeflow data into display items, then applies the global
 * cluster filter and the resource-type (category) selector. Sorting and
 * search are handled downstream by the shared `useCardData` hook.
 */
export function useDisplayItems(
  rawData: KubeflowDemoData,
  t: TFunction,
  selectedClusters: string[] | undefined,
  selectedCategory: string,
) {
  const allItems = useMemo(() => mapToDisplayItems(rawData, t), [rawData, t])

  const globalFiltered = useMemo(() => {
    if (!selectedClusters || selectedClusters.length === 0) return allItems
    return allItems.filter(item => selectedClusters.includes(item.cluster))
  }, [allItems, selectedClusters])

  const categoryFiltered = useMemo(() => {
    if (!selectedCategory) return globalFiltered
    return globalFiltered.filter(item => item.category === selectedCategory)
  }, [globalFiltered, selectedCategory])

  return { allItems, globalFiltered, categoryFiltered }
}
