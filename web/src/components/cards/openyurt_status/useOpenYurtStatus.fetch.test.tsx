// Fetch/error paths for useOpenYurtStatus: unlabeled pod-discovery
// fallback, the not-installed state, and scoped RBAC/HTTP failures for
// pods, nodepools, and gateways. Split out of the former
// useOpenYurtStatus.test.tsx (549 lines) alongside
// useOpenYurtStatus.cache.test.tsx and
// useOpenYurtStatus.parse-branches.test.tsx (see issue #571).

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

describe('useOpenYurtStatus fetch/error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
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
})
