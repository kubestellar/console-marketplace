import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'
import type { OpenYurtDemoData } from './demoData'
import {
  appendClusterParam,
  isOpenYurtControllerPod,
  isPodReady,
  parseGateway,
  parseNodePool,
  type BackendPodInfo,
  type CRItem,
  type CRResponse,
} from './parse'

export type OpenYurtStatus = OpenYurtDemoData

export const INITIAL_DATA: OpenYurtStatus = {
  health: 'not-installed',
  controllerPods: { ready: 0, total: 0 },
  nodePools: [],
  gateways: [],
  totalNodes: 0,
  autonomousNodes: 0,
  lastCheckTime: new Date().toISOString(),
  fetchError: null,
}

// Error surfacing: track which resource failed so the UI can tell the user
// specifically whether nodepools or gateways is the problem (e.g. missing
// RBAC on nodepools.apps.openyurt.io vs. gateways.raven.openyurt.io).
export interface OpenYurtFetchError {
  resource: 'pods' | 'nodepools' | 'gateways'
  message: string
}

// Bounded, fixed-shape structured record. Never includes the raw response
// body — only the resource scope and a short failure reason — so a failure
// here is at least visible in browser/CI console logs, matching the
// convention already used by useVersionCheck's VERSION_CHECK_SUMMARY record.
// No exporter, metrics backend, or external data flow: console-only, since
// this repo has no confirmed observability backend (see runbooks/SLO.md).
function logFetchError(error: OpenYurtFetchError): void {
  console.error('OPENYURT_STATUS_FETCH_SUMMARY:', {
    resource: error.resource,
    status: 'failed',
    reason: error.message,
  })
}

class CRFetchError extends Error {
  constructor(public resource: 'nodepools' | 'gateways', message: string) {
    super(message)
  }
}

async function fetchCR(
  group: string,
  version: string,
  resource: 'nodepools' | 'gateways',
  cluster?: string,
): Promise<CRItem[]> {
  const params = new URLSearchParams({ group, version, resource })
  const path = appendClusterParam(`/api/mcp/custom-resources?${params}`, cluster)
  const resp = await authFetch(path, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) {
    throw new CRFetchError(resource, `HTTP ${resp.status} ${resp.statusText}`)
  }
  const body: CRResponse = await resp.json()
  return body.items ?? []
}

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  const body: { pods?: BackendPodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

export async function fetchOpenYurtStatus(cluster?: string): Promise<OpenYurtStatus> {
  // Step 1: Detect OpenYurt controller pods.
  let yurtPods: BackendPodInfo[]
  try {
    const labeledPath = appendClusterParam(
      '/api/mcp/pods?labelSelector=app.kubernetes.io%2Fname%3Dyurt-manager',
      cluster,
    )
    const labeledPods = await fetchPods(labeledPath)
    yurtPods = labeledPods.length > 0
      ? labeledPods.filter(isOpenYurtControllerPod)
      : (await fetchPods(appendClusterParam('/api/mcp/pods', cluster))).filter(isOpenYurtControllerPod)
  } catch (e) {
    const fetchError: OpenYurtFetchError = {
      resource: 'pods',
      message: e instanceof Error ? e.message : String(e),
    }
    logFetchError(fetchError)
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
      fetchError,
    }
  }

  if (yurtPods.length === 0) {
    return {
      ...INITIAL_DATA,
      health: 'not-installed',
      lastCheckTime: new Date().toISOString(),
    }
  }

  const readyPods = yurtPods.filter(isPodReady).length
  const allPodsReady = readyPods === yurtPods.length

  // Step 2: Fetch NodePool and Gateway CRDs independently so a single RBAC
  // gap (e.g. user lacks list on nodepools.apps.openyurt.io) surfaces a
  // specific error rather than hiding both sides behind a generic failure.
  const [nodePoolResult, gatewayResult] = await Promise.allSettled([
    fetchCR('apps.openyurt.io', 'v1beta1', 'nodepools', cluster),
    fetchCR('raven.openyurt.io', 'v1beta1', 'gateways', cluster),
  ])

  let fetchError: OpenYurtFetchError | null = null
  const nodePoolItems = nodePoolResult.status === 'fulfilled' ? nodePoolResult.value : []
  const gatewayItems = gatewayResult.status === 'fulfilled' ? gatewayResult.value : []

  if (nodePoolResult.status === 'rejected') {
    const err = nodePoolResult.reason
    fetchError = {
      resource: 'nodepools',
      message: err instanceof Error ? err.message : String(err),
    }
    logFetchError(fetchError)
  } else if (gatewayResult.status === 'rejected') {
    const err = gatewayResult.reason
    fetchError = {
      resource: 'gateways',
      message: err instanceof Error ? err.message : String(err),
    }
    logFetchError(fetchError)
  }

  const nodePools = nodePoolItems.map(parseNodePool)
  const gateways = gatewayItems.map(parseGateway)

  const totalNodes = nodePools.reduce((sum, np) => sum + np.nodeCount, 0)
  const autonomousNodes = nodePools
    .filter(np => np.autonomyEnabled)
    .reduce((sum, np) => sum + np.nodeCount, 0)

  const allPoolsReady = nodePools.length === 0 || nodePools.every(np => np.status === 'ready')
  const health = allPodsReady && allPoolsReady ? 'healthy' : 'degraded'

  return {
    health,
    controllerPods: { ready: readyPods, total: yurtPods.length },
    nodePools,
    gateways,
    totalNodes,
    autonomousNodes,
    lastCheckTime: new Date().toISOString(),
    fetchError,
  }
}
