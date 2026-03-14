/**
 * Demo data for the CoreDNS status card.
 *
 * Representative of a multi-cluster environment running CoreDNS for DNS
 * resolution. Includes query metrics, cache performance, and upstream
 * health. Used when the dashboard is in demo mode or when no Kubernetes
 * clusters are connected.
 */

/** Time offsets (in milliseconds) used for relative timestamps. */
const ONE_MINUTE_MS = 60 * 1000
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const SIX_HOURS_MS = 6 * ONE_HOUR_MS

export interface CoreDNSDemoServer {
  name: string
  namespace: string
  cluster: string
  version: string
  status: 'running' | 'degraded' | 'down' | 'unknown'
  queriesPerSecond: number
  cacheHitRate: number
  upstreamLatencyMs: number
  errorRate: number
  uptime: string
}

export interface CoreDNSDemoZone {
  zone: string
  queryCount: number
  nxdomainCount: number
  servfailCount: number
  avgLatencyMs: number
}

export interface CoreDNSDemoData {
  servers: CoreDNSDemoServer[]
  zones: CoreDNSDemoZone[]
  totalQueries: number
  overallCacheHitRate: number
  lastCheckTime: string
}

export const COREDNS_DEMO_DATA: CoreDNSDemoData = {
  servers: [
    {
      name: 'coredns-7d8f9b6c4-xk2p9',
      namespace: 'kube-system',
      cluster: 'eks-prod-us-east-1',
      version: '1.11.3',
      status: 'running',
      queriesPerSecond: 1247,
      cacheHitRate: 0.92,
      upstreamLatencyMs: 3.2,
      errorRate: 0.001,
      uptime: '14d 6h 32m',
    },
    {
      name: 'coredns-7d8f9b6c4-mn4q7',
      namespace: 'kube-system',
      cluster: 'eks-prod-us-east-1',
      version: '1.11.3',
      status: 'running',
      queriesPerSecond: 1189,
      cacheHitRate: 0.91,
      upstreamLatencyMs: 3.5,
      errorRate: 0.002,
      uptime: '14d 6h 32m',
    },
    {
      name: 'coredns-5c9a4e7f1-hr8w3',
      namespace: 'kube-system',
      cluster: 'gke-staging',
      version: '1.11.1',
      status: 'degraded',
      queriesPerSecond: 342,
      cacheHitRate: 0.74,
      upstreamLatencyMs: 28.6,
      errorRate: 0.038,
      uptime: '2d 11h 5m',
    },
    {
      name: 'coredns-3b7e2d9a8-zt5n1',
      namespace: 'kube-system',
      cluster: 'aks-dev-eu',
      version: '1.10.1',
      status: 'running',
      queriesPerSecond: 87,
      cacheHitRate: 0.88,
      upstreamLatencyMs: 5.1,
      errorRate: 0.004,
      uptime: '31d 2h 18m',
    },
    {
      name: 'coredns-6f1c8a3d5-bv2k4',
      namespace: 'kube-system',
      cluster: 'aks-dev-eu',
      version: '1.10.1',
      status: 'unknown',
      queriesPerSecond: 0,
      cacheHitRate: 0,
      upstreamLatencyMs: 0,
      errorRate: 0,
      uptime: '0d 0h 0m',
    },
  ],
  zones: [
    {
      zone: 'cluster.local.',
      queryCount: 4_821_390,
      nxdomainCount: 12_847,
      servfailCount: 231,
      avgLatencyMs: 1.8,
    },
    {
      zone: 'svc.cluster.local.',
      queryCount: 2_107_554,
      nxdomainCount: 5_422,
      servfailCount: 89,
      avgLatencyMs: 1.2,
    },
    {
      zone: 'in-addr.arpa.',
      queryCount: 893_210,
      nxdomainCount: 41_003,
      servfailCount: 1_204,
      avgLatencyMs: 4.7,
    },
    {
      zone: '.',
      queryCount: 387_642,
      nxdomainCount: 2_109,
      servfailCount: 387,
      avgLatencyMs: 12.3,
    },
  ],
  totalQueries: 8_209_796,
  overallCacheHitRate: 0.89,
  lastCheckTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
}
