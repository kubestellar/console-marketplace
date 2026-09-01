import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OPENYURT_DEMO_DATA } from './demoData'
import { useOpenYurtStatus, type OpenYurtStatus as OpenYurtStatusData, type UseOpenYurtStatusResult } from './useOpenYurtStatus'

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

describe('useOpenYurtStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('returns the cache result and configures useCache defaults', () => {
    const { result } = renderHook(() => useOpenYurtStatus())

    expect(result.current).toEqual(defaultCacheResult)
    expect(lastCacheOptions()).toMatchObject({
      key: 'openyurt-status',
      demoData: OPENYURT_DEMO_DATA,
      category: 'default',
      persist: true,
      demoWhenEmpty: true,
    })
  })

  it('uses a cluster-scoped cache key and appends the cluster to API requests', async () => {
    renderHook(() => useOpenYurtStatus('edge-shenzhen'))

    mockFetch.mockResolvedValueOnce(jsonResponse({
      pods: [
        {
          name: 'yurt-manager-0',
          status: 'Running',
          ready: '1/1',
          labels: { app: 'yurt-manager' },
        },
      ],
    }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'edge-pool',
            cluster: 'edge-shenzhen',
            spec: { type: 'edge', autonomy: true },
            status: { readyNodeNum: 2, unreadyNodeNum: 0 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'edge-gateway',
            cluster: 'edge-shenzhen',
            spec: {
              nodePool: 'edge-pool',
              endpoints: [{ publicIP: '10.0.0.10' }],
            },
            status: { activeEndpoints: ['10.0.0.10'] },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(lastCacheOptions().key).toBe('openyurt-status:edge-shenzhen')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/mcp/pods?labelSelector=app.kubernetes.io%2Fname%3Dyurt-manager&cluster=edge-shenzhen',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(mockAuthFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('resource=nodepools'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(mockAuthFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('resource=gateways'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(mockAuthFetch.mock.calls[0]?.[0]).toContain('cluster=edge-shenzhen')
    expect(mockAuthFetch.mock.calls[1]?.[0]).toContain('cluster=edge-shenzhen')
    expect(data).toMatchObject({
      health: 'healthy',
      controllerPods: { ready: 1, total: 1 },
      totalNodes: 2,
      autonomousNodes: 2,
      fetchError: null,
    })
    expect(data.nodePools[0]).toMatchObject({
      name: 'edge-pool',
      status: 'ready',
      type: 'edge',
      autonomyEnabled: true,
    })
    expect(data.gateways[0]).toMatchObject({
      name: 'edge-gateway',
      nodePool: 'edge-pool',
      status: 'connected',
      endpoint: '10.0.0.10',
    })
  })

  it('falls back to unlabeled pod discovery and derives degraded controller health', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ pods: [] }))
      .mockResolvedValueOnce(jsonResponse({
        pods: [
          {
            name: 'yurt-hub-0',
            status: 'Running',
            ready: '0/1',
          },
          {
            name: 'yurt-tunnel-0',
            status: 'Running',
            ready: '1/1',
          },
        ],
      }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'edge-unknown',
            cluster: 'cluster-a',
            spec: { type: 'mystery' },
            annotations: { 'node.beta.openyurt.io/autonomy': 'true' },
            status: { nodes: 3 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-disconnected',
            cluster: 'cluster-a',
            spec: {
              proxyNodePool: 'edge-unknown',
              endpoint: 'gw.internal',
            },
            status: { phase: 'Disconnected' },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/mcp/pods',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(data).toMatchObject({
      health: 'degraded',
      controllerPods: { ready: 1, total: 2 },
      totalNodes: 3,
      autonomousNodes: 3,
      fetchError: null,
    })
    expect(data.nodePools[0]).toMatchObject({
      name: 'edge-unknown',
      type: 'edge',
      status: 'ready',
      nodeCount: 3,
      readyNodes: 3,
      autonomyEnabled: true,
    })
    expect(data.gateways[0]).toMatchObject({
      name: 'gw-disconnected',
      nodePool: 'edge-unknown',
      status: 'disconnected',
      endpoint: 'gw.internal',
    })
  })

  it('returns not-installed when no controller pods are discovered', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ pods: [] }))
      .mockResolvedValueOnce(jsonResponse({ pods: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.health).toBe('not-installed')
    expect(data.controllerPods).toEqual({ ready: 0, total: 0 })
    expect(data.fetchError).toBeNull()
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns a scoped pods fetch error when pod discovery fails', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockRejectedValueOnce(new Error('pods unavailable'))

    const data = await lastCacheOptions().fetcher()

    expect(data.health).toBe('not-installed')
    expect(data.fetchError).toMatchObject({
      resource: 'pods',
      message: 'pods unavailable',
    })
    expect(data.nodePools).toEqual([])
    expect(data.gateways).toEqual([])
  })

  it('surfaces nodepool RBAC failures without hiding gateway data', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch.mockResolvedValueOnce(jsonResponse({
      pods: [
        {
          name: 'yurt-controller-manager-0',
          status: 'Running',
          ready: '1/1',
          labels: { 'app.kubernetes.io/name': 'yurt-manager' },
        },
      ],
    }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}, {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-1',
            cluster: 'cluster-a',
            spec: {
              nodePool: 'edge-a',
              endpoints: [{ publicIP: '192.168.1.10' }],
            },
            status: { activeEndpoints: ['192.168.1.10'] },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.fetchError).toMatchObject({
      resource: 'nodepools',
      message: 'HTTP 403 Forbidden',
    })
    expect(data.gateways).toHaveLength(1)
    expect(data.controllerPods).toEqual({ ready: 1, total: 1 })
  })

  it('surfaces gateway failures while keeping nodepool summaries', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch.mockResolvedValueOnce(jsonResponse({
      pods: [
        {
          name: 'yurt-manager-0',
          status: 'Running',
          ready: '1/1',
          labels: { app: 'yurt-manager' },
        },
      ],
    }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'edge-a',
            cluster: 'cluster-a',
            spec: { type: 'cloud' },
            status: { readyNodeNum: 1, unreadyNodeNum: 1 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({}, {
        ok: false,
        status: 500,
        statusText: 'Server Error',
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.fetchError).toMatchObject({
      resource: 'gateways',
      message: 'HTTP 500 Server Error',
    })
    expect(data.health).toBe('degraded')
    expect(data.nodePools[0]).toMatchObject({
      name: 'edge-a',
      type: 'cloud',
      status: 'degraded',
      nodeCount: 2,
      readyNodes: 1,
      autonomyEnabled: false,
    })
    expect(data.gateways).toEqual([])
  })

  // ── Branch-coverage additions ──

  it('parseNodePool marks a pool with zero nodes as not-ready and derives autonomy from annotations on cloud pools', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch.mockResolvedValueOnce(jsonResponse({
      pods: [
        {
          name: 'yurt-manager-0',
          status: 'Running',
          ready: '1/1',
          labels: { app: 'yurt-manager' },
        },
      ],
    }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({
        items: [
          // Zero-node cloud pool → poolStatus 'not-ready'; autonomy comes
          // from the annotation, not the type.
          {
            name: 'cloud-empty',
            cluster: 'c',
            spec: { type: 'cloud' },
            annotations: { 'node.beta.openyurt.io/autonomy': 'true' },
            status: { readyNodeNum: 0, unreadyNodeNum: 0 },
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.nodePools[0]).toMatchObject({
      name: 'cloud-empty',
      type: 'cloud',
      status: 'not-ready',
      nodeCount: 0,
      readyNodes: 0,
      autonomyEnabled: true,
    })
    // A pool with 0/0 nodes is not-ready → overall health is degraded even
    // though the controller is healthy.
    expect(data.health).toBe('degraded')
  })

  it('parseGateway resolves nodePool from the raven label, uses spec.endpoint when endpoints[] is missing, and reports pending when there are no active endpoints or nodes', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch.mockResolvedValueOnce(jsonResponse({
      pods: [
        {
          name: 'yurt-manager-0',
          status: 'Running',
          ready: '1/1',
          labels: { app: 'yurt-manager' },
        },
      ],
    }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-pending',
            cluster: 'c',
            // Neither spec.nodePool nor spec.proxyNodePool — must fall
            // through to the raven label.
            spec: { endpoint: 'gw.internal' },
            labels: { 'raven.openyurt.io/gateway-node-pool': 'edge-labelled' },
            status: {}, // no activeEndpoints, no nodes, no phase → 'pending'
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.gateways).toHaveLength(1)
    expect(data.gateways[0]).toMatchObject({
      name: 'gw-pending',
      nodePool: 'edge-labelled',
      status: 'pending',
      endpoint: 'gw.internal',
    })
  })

  it('parseGateway defaults endpoint to "" when endpoints[0].publicIP is missing and treats status.nodes[] as connected', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch.mockResolvedValueOnce(jsonResponse({
      pods: [
        {
          name: 'yurt-manager-0',
          status: 'Running',
          ready: '1/1',
          labels: { app: 'yurt-manager' },
        },
      ],
    }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-nodes',
            cluster: 'c',
            spec: {
              nodePool: 'edge-a',
              // endpoints[0] has no publicIP → publicIP is undefined →
              // falls through the `?? ''` nullish coalescing.
              endpoints: [{}],
            },
            // No activeEndpoints, but status.nodes is a non-empty array →
            // gateway is 'connected'.
            status: { nodes: ['node-a'] },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.gateways[0]).toMatchObject({
      name: 'gw-nodes',
      nodePool: 'edge-a',
      status: 'connected',
      endpoint: '',
    })
  })

  it('treats a non-array pods payload and a missing CR items array as empty collections', async () => {
    renderHook(() => useOpenYurtStatus())

    // First labeled-pods call returns an object where `pods` is NOT an
    // array — code path: `Array.isArray(body?.pods) ? body.pods : []`.
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ pods: 'not-an-array' }))
      .mockResolvedValueOnce(jsonResponse({
        pods: [
          {
            name: 'yurt-manager-0',
            status: 'Running',
            ready: '1/1',
            labels: { app: 'yurt-manager' },
          },
        ],
      }))
    // CR responses omit the `items` key entirely — code path:
    // `body.items ?? []`.
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}))

    const data = await lastCacheOptions().fetcher()

    expect(data.controllerPods).toEqual({ ready: 1, total: 1 })
    expect(data.nodePools).toEqual([])
    expect(data.gateways).toEqual([])
    // No pools & all controller pods ready → overall healthy.
    expect(data.health).toBe('healthy')
  })

  it('isPodReady rejects Running pods with malformed ready strings', async () => {
    renderHook(() => useOpenYurtStatus())

    mockFetch.mockResolvedValueOnce(jsonResponse({
      pods: [
        // Non-"X/Y" ready string exercises the `parts.length !== 2`
        // branch of isPodReady.
        {
          name: 'yurt-manager-a',
          status: 'Running',
          ready: 'malformed',
          labels: { app: 'yurt-manager' },
        },
        // Zero-of-zero ready string exercises the
        // `parseInt(parts[0], 10) > 0` guard (both sides zero).
        {
          name: 'yurt-manager-b',
          status: 'Running',
          ready: '0/0',
          labels: { app: 'yurt-manager' },
        },
      ],
    }))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.controllerPods).toEqual({ ready: 0, total: 2 })
    // 0 of 2 pods ready → not allPodsReady → health degraded (with zero
    // pools, allPoolsReady is true).
    expect(data.health).toBe('degraded')
  })
})
