import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { OPENYURT_DEMO_DATA } from './demoData'
import type { OpenYurtStatus as OpenYurtStatusData, UseOpenYurtStatusResult } from './useOpenYurtStatus'

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

import { useOpenYurtStatus } from './useOpenYurtStatus'

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
})
