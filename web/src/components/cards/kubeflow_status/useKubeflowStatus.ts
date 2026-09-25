import { type UseCacheResult } from '../../../lib/cache'
import { useDemoOnlyCard } from '../../../lib/cards/useDemoOnlyCard'
import { KUBEFLOW_DEMO_DATA, type KubeflowDemoData } from './demoData'

export type KubeflowStatus = KubeflowDemoData

const CACHE_KEY = 'kubeflow-status'

export const EMPTY_KUBEFLOW_DATA: KubeflowStatus = {
  pipelineRuns: [],
  experiments: [],
  notebooks: [],
  trainingJobs: [],
  totalPipelines: 0,
  totalActiveRuns: 0,
  totalExperiments: 0,
  overallSuccessRate: 0,
  lastCheckTime: '',
}

export type UseKubeflowStatusResult = UseCacheResult<KubeflowStatus>

export function useKubeflowStatus(): UseKubeflowStatusResult {
  return useDemoOnlyCard<KubeflowStatus>({
    key: CACHE_KEY,
    demoData: KUBEFLOW_DEMO_DATA,
    emptyData: EMPTY_KUBEFLOW_DATA,
  })
}
