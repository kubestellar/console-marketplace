import { useCache } from '../../../lib/cache'
import { OPENYURT_DEMO_DATA, type OpenYurtDemoData, type OpenYurtNodePool, type NodePoolType, type NodePoolStatus, type GatewayStatus } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { authFetch } from '../../../lib/api'

export type OpenYurtStatus = OpenYurtDemoData

const INITIAL_DATA: OpenYurtStatus = {
  health: 'not-installed',
  controllerPods: { ready: 0, total: 0 },
  nodePools: [],
  gateways: [],
  totalNodes: 0,
  autonomousNodes: 0,
  lastCheckTime: new Date().toISOString(),
  fetchError: null,
}

const CACHE_KEY = 'openyurt-status'

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
}

interface CRItem {
  name: string
  namespace?: string
  cluster: string
  status?: Record<string, unknown>
  spec?: Record<string, unknown>
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

interface CRResponse {
  items?: CRItem[]
  isDemoData?: boolean
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

function appendClusterParam(path: string, cluster?: string): string {
  if (!cluster) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}cluster=${encodeURIComponent(cluster)}`
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

function isOpenYurtControllerPod(pod: BackendPodInfo): boolean {
  const labels = pod.labels ?? {}
  const name = (pod.name ?? '').toLowerCase()
  return (
    labels['app'] === 'yurt-manager' ||
    labels['app.kubernetes.io/name'] === 'openyurt' ||
    labels['app.kubernetes.io/name'] === 'yurt-manager' ||
    labels['app.kubernetes.io/part-of'] === 'openyurt' ||
    name.startsWith('yurt-manager') ||
    name.startsWith('yurt-controller-manager') ||
    name.startsWith('yurt-hub') ||
    name.startsWith('yurt-tunnel')
  )
}

function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

// ---------------------------------------------------------------------------
// CRD helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// NodePool parser
// ---------------------------------------------------------------------------

const KNOWN_POOL_TYPES = new Set<string>(['edge', 'cloud'])

function parseNodePool(item: CRItem): OpenYurtNodePool {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>
  const annotations = item.annotations ?? {}

  const rawType = (spec.type as string) ?? annotations['apps.openyurt.io/pool-type'] ?? 'edge'
  const poolType: NodePoolType = KNOWN_POOL_TYPES.has(rawType) ? (rawType as NodePoolType) : 'edge'

  const nodeCount = typeof status.readyNodeNum === 'number' && typeof status.unreadyNodeNum === 'number'
    ? status.readyNodeNum + status.unreadyNodeNum
    : typeof status.nodes === 'number'
      ? status.nodes
      : 0
  const readyNodes = typeof status.readyNodeNum === 'number'
    ? status.readyNodeNum
    : nodeCount

  let poolStatus: NodePoolStatus = 'ready'
  if (nodeCount === 0 || readyNodes === 0) {
    poolStatus = 'not-ready'
  } else if (readyNodes < nodeCount) {
    poolStatus = 'degraded'
  }

  const autonomyEnabled = poolType === 'edge' ||
    spec.autonomy === true ||
    annotations['node.beta.openyurt.io/autonomy'] === 'true'

  return {
    name: item.name,
    type: poolType,
    status: poolStatus,
    nodeCount,
    readyNodes,
    autonomyEnabled,
  }
}

// ---------------------------------------------------------------------------
// Gateway parser
// ---------------------------------------------------------------------------

function parseGateway(item: CRItem): { name: string; nodePool: string; status: GatewayStatus; endpoint: string } {
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const status = (item.status ?? {}) as Record<string, unknown>

  const nodePool = (spec.nodePool as string) ??
    (spec.proxyNodePool as string) ??
    (item.labels?.['raven.openyurt.io/gateway-node-pool'] ?? '')

  const endpoints = Array.isArray(spec.endpoints) ? spec.endpoints : []
  const endpoint = endpoints.length > 0
    ? ((endpoints[0] as Record<string, unknown>).publicIP as string) ?? ''
    : (spec.endpoint as string) ?? ''

  const activeEndpoints = Array.isArray(status.activeEndpoints) ? status.activeEndpoints : []
  const nodes = Array.isArray(status.nodes) ? status.nodes : []
  let gwStatus: GatewayStatus = 'pending'
  if (activeEndpoints.length > 0 || nodes.length > 0) {
    gwStatus = 'connected'
  } else if (status.phase === 'Disconnected' || status.phase === 'Failed') {
    gwStatus = 'disconnected'
  }

  return {
    name: item.name,
    nodePool,
    status: gwStatus,
    endpoint,
  }
}

// ---------------------------------------------------------------------------
// Pod fetcher
// ---------------------------------------------------------------------------

async function fetchPods(url: string): Promise<BackendPodInfo[]> {
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  const body: { pods?: BackendPodInfo[] } = await resp.json()
  return Array.isArray(body?.pods) ? body.pods : []
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

async function fetchOpenYurtStatus(cluster?: string): Promise<OpenYurtStatus> {
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseOpenYurtStatusResult {
  data: OpenYurtStatus
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  isDemoFallback: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useOpenYurtStatus(cluster?: string): UseOpenYurtStatusResult {
  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useCache<OpenYurtStatus>({
    key: cluster ? `${CACHE_KEY}:${cluster}` : CACHE_KEY,
    fetcher: () => fetchOpenYurtStatus(cluster),
    demoData: OPENYURT_DEMO_DATA,
    initialData: INITIAL_DATA,
    category: 'default',
    persist: true,
    demoWhenEmpty: true,
  })

  return {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
    refetch,
  }
}
