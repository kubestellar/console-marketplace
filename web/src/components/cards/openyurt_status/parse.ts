import type { OpenYurtNodePool, NodePoolType, NodePoolStatus, GatewayStatus } from './demoData'

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

export interface BackendPodInfo {
  name?: string
  namespace?: string
  status?: string
  ready?: string
  labels?: Record<string, string>
}

export interface CRItem {
  name: string
  namespace?: string
  cluster: string
  status?: Record<string, unknown>
  spec?: Record<string, unknown>
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface CRResponse {
  items?: CRItem[]
  isDemoData?: boolean
}

export function appendClusterParam(path: string, cluster?: string): string {
  if (!cluster) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}cluster=${encodeURIComponent(cluster)}`
}

// ---------------------------------------------------------------------------
// Pod helpers
// ---------------------------------------------------------------------------

export function isOpenYurtControllerPod(pod: BackendPodInfo): boolean {
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

export function isPodReady(pod: BackendPodInfo): boolean {
  const status = (pod.status ?? '').toLowerCase()
  const ready = pod.ready ?? ''
  if (status !== 'running') return false
  const parts = ready.split('/')
  if (parts.length !== 2) return false
  return parts[0] === parts[1] && parseInt(parts[0], 10) > 0
}

// ---------------------------------------------------------------------------
// NodePool parser
// ---------------------------------------------------------------------------

export const KNOWN_POOL_TYPES = new Set<string>(['edge', 'cloud'])

export function parseNodePool(item: CRItem): OpenYurtNodePool {
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

export function parseGateway(item: CRItem): { name: string; nodePool: string; status: GatewayStatus; endpoint: string } {
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
