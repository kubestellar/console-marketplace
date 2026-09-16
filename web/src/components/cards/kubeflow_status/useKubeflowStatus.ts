import { useCache } from '../../../lib/cache'
import { KUBEFLOW_DEMO_DATA, type KubeflowDemoData } from './demoData'

export type KubeflowStatus = KubeflowDemoData

const CACHE_KEY = 'kubeflow-status'

const INITIAL_DATA: KubeflowStatus = {
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

async function fetchKubeflowStatus(): Promise<KubeflowStatus> {
  return KUBEFLOW_DEMO_DATA
}

export function useKubeflowStatus() {
  return useCache<KubeflowStatus>({
    key: CACHE_KEY,
    fetcher: fetchKubeflowStatus,
    demoData: KUBEFLOW_DEMO_DATA,
    initialData: INITIAL_DATA,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })
}
