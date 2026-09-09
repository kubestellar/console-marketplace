// Guards the remaining branch arms in `parseNodePool` and `parseGateway`
// in `useOpenYurtStatus.ts` that were previously exercised only from one
// side (or not at all).
//
// The sibling gateway-parse-branches.test.tsx already covers the `Failed`
// phase, the endpoints-not-array fallback, and the fetchPods non-array
// pods payload. The main useOpenYurtStatus.test.tsx covers the
// happy-path parseNodePool with readyNodeNum/unreadyNodeNum both set to
// numbers, but leaves the following arms unexercised:
//
//   parseNodePool
//   ------------
//   1. status.nodes numeric fallback: when readyNodeNum/unreadyNodeNum
//      are absent (or non-numeric) but status.nodes is a number, the
//      pool's nodeCount must equal status.nodes.
//   2. All numeric fallbacks missing → nodeCount = 0 AND readyNodes = 0
//      → status = 'not-ready'.
//   3. rawType derived from the `apps.openyurt.io/pool-type` annotation
//      when spec.type is unset (cloud annotation).
//   4. Unknown rawType (e.g. 'hybrid') → falls back to 'edge' via the
//      KNOWN_POOL_TYPES guard; autonomyEnabled becomes true because the
//      fallback type is 'edge'.
//   5. Degraded status: 0 < readyNodes < nodeCount, propagated into
//      overall health = 'degraded'.
//
//   parseGateway
//   ------------
//   6. spec.proxyNodePool fallback — the middle arm of the three-way
//      node-pool chain (spec.nodePool ?? spec.proxyNodePool ?? label).
//   7. status.phase === 'Disconnected' with no endpoint → still
//      'disconnected' AND endpoint falls through to '' when neither
//      spec.endpoints[] nor spec.endpoint is set.
//
// Test-only additions; no production code changes.

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OPENYURT_DEMO_DATA } from './demoData'
import {
  useOpenYurtStatus,
  type OpenYurtStatus as OpenYurtStatusData,
  type UseOpenYurtStatusResult,
} from './useOpenYurtStatus'

interface CacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  demoData: T
  initialData: T
  category: string
  persist: boolean
  demoWhenEmpty: boolean
}

interface JsonResponse<T> {
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<T>
}

const mockUseCache = vi.fn()
const mockAuthFetch = vi.fn()
const mockFetch = vi.fn()

vi.mock('../../../lib/cache', () => ({
  useCache: (options: unknown) => mockUseCache(options),
}))

vi.mock('../../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

const defaultCacheResult: UseOpenYurtStatusResult = {
  data: OPENYURT_DEMO_DATA,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  isDemoFallback: true,
  consecutiveFailures: 0,
  lastRefresh: 1_725_000_000_000,
  refetch: vi.fn(),
}

function jsonResponse<T>(body: T, init: Partial<Omit<JsonResponse<T>, 'json'>> = {}): JsonResponse<T> {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  }
}

function lastCacheOptions(): CacheOptions<OpenYurtStatusData> {
  return mockUseCache.mock.calls.at(-1)?.[0] as CacheOptions<OpenYurtStatusData>
}

// A single healthy yurt-manager pod so the fetcher proceeds past its
// early-return "not-installed" arm and actually invokes the CRD calls.
const yurtManagerPodsPayload = {
  pods: [
    {
      name: 'yurt-manager-0',
      status: 'Running',
      ready: '1/1',
      labels: { 'app.kubernetes.io/name': 'yurt-manager' },
    },
  ],
}

describe('useOpenYurtStatus — parseNodePool branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('derives nodeCount from status.nodes when readyNodeNum/unreadyNodeNum are missing', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'edge-legacy',
            cluster: 'cluster-a',
            spec: { type: 'edge' },
            // No readyNodeNum / unreadyNodeNum -> falls through to
            // `typeof status.nodes === 'number' ? status.nodes : 0`.
            status: { nodes: 5 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.nodePools).toHaveLength(1)
    expect(data.nodePools[0]).toMatchObject({
      name: 'edge-legacy',
      type: 'edge',
      // readyNodes falls back to nodeCount when readyNodeNum is absent.
      nodeCount: 5,
      readyNodes: 5,
      status: 'ready',
      autonomyEnabled: true,
    })
    expect(data.totalNodes).toBe(5)
  })

  it('reports nodeCount=0 and status=not-ready when every numeric fallback is absent', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'edge-empty',
            cluster: 'cluster-a',
            spec: { type: 'edge' },
            // Neither readyNodeNum/unreadyNodeNum nor status.nodes are
            // numbers → nodeCount = 0, readyNodes = 0 → 'not-ready'.
            status: {},
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.nodePools[0]).toMatchObject({
      name: 'edge-empty',
      nodeCount: 0,
      readyNodes: 0,
      status: 'not-ready',
    })
  })

  it('derives type from the apps.openyurt.io/pool-type annotation when spec.type is unset', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'cloud-annotated',
            cluster: 'cluster-a',
            // spec.type absent; rawType must come from the annotation
            // and land on the 'cloud' arm.
            spec: {},
            annotations: {
              'apps.openyurt.io/pool-type': 'cloud',
            },
            status: { readyNodeNum: 3, unreadyNodeNum: 0 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.nodePools[0]).toMatchObject({
      name: 'cloud-annotated',
      type: 'cloud',
      nodeCount: 3,
      readyNodes: 3,
      // A pure cloud pool with no autonomy annotation and no spec.autonomy
      // must NOT be counted as autonomous.
      autonomyEnabled: false,
    })
    expect(data.autonomousNodes).toBe(0)
  })

  it('falls back to type=edge when rawType is not a known pool type (KNOWN_POOL_TYPES guard)', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'weird-pool',
            cluster: 'cluster-a',
            // rawType = 'hybrid' — not in KNOWN_POOL_TYPES —
            // so parseNodePool must clamp to 'edge'.
            spec: { type: 'hybrid' },
            status: { readyNodeNum: 2, unreadyNodeNum: 0 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.nodePools[0]).toMatchObject({
      name: 'weird-pool',
      type: 'edge',
      // Fallback to type='edge' also flips autonomyEnabled=true via the
      // `poolType === 'edge'` arm of the autonomy chain.
      autonomyEnabled: true,
    })
    expect(data.autonomousNodes).toBe(2)
  })

  it('marks a partially-ready pool as degraded and propagates health', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'edge-degraded',
            cluster: 'cluster-a',
            spec: { type: 'edge' },
            status: { readyNodeNum: 2, unreadyNodeNum: 3 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.nodePools[0]).toMatchObject({
      name: 'edge-degraded',
      nodeCount: 5,
      readyNodes: 2,
      status: 'degraded',
    })
    // At least one non-ready pool must flip overall health below healthy.
    expect(data.health).toBe('degraded')
  })
})

describe('useOpenYurtStatus — parseGateway node-pool fallback chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('uses spec.proxyNodePool as the middle arm when spec.nodePool is unset', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-proxy',
            cluster: 'cluster-a',
            spec: {
              // spec.nodePool absent → falls to spec.proxyNodePool.
              proxyNodePool: 'edge-central',
              endpoints: [{ publicIP: '10.0.0.9' }],
            },
            labels: { 'raven.openyurt.io/gateway-node-pool': 'ignored-because-proxy-wins' },
            status: { activeEndpoints: ['10.0.0.9'] },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.gateways[0]).toMatchObject({
      name: 'gw-proxy',
      nodePool: 'edge-central',
      status: 'connected',
      endpoint: '10.0.0.9',
    })
  })

  it('maps status.phase === "Disconnected" with no endpoint to disconnected + empty endpoint', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-lost',
            cluster: 'cluster-a',
            // No endpoints, no endpoint, no active endpoints, no nodes,
            // status.phase = 'Disconnected' → 'disconnected' + endpoint=''.
            spec: { nodePool: 'edge-north' },
            status: { phase: 'Disconnected' },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.gateways[0]).toEqual({
      name: 'gw-lost',
      nodePool: 'edge-north',
      status: 'disconnected',
      endpoint: '',
    })
  })
})
