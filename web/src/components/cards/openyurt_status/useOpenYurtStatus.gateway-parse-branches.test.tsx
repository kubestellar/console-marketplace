// Guards the remaining branch arms in `parseGateway` and `fetchPods` in
// `useOpenYurtStatus.ts` that were previously exercised only from one side.
//
// - parseGateway status.phase === 'Failed' arm (was only covered for
//   'Disconnected'): a `Failed` phase with no active endpoints and no nodes
//   must still map to 'disconnected'.
// - parseGateway spec.endpoints-not-array branch: when `spec.endpoints` is
//   omitted (or is not an array), `endpoint` must fall back to
//   `spec.endpoint ?? ''`, never crash on `endpoints[0]`.
// - parseGateway spec.endpoint fallback to '': same branch, no
//   `spec.endpoint` provided, endpoint must be '' rather than `undefined`.
// - fetchPods body.pods-not-array branch: a JSON payload with
//   `pods: null` (or missing) must produce `controllerPods.ready === 0`
//   from an empty pod array, not crash on `.filter` of a non-array.
//
// The existing suite in `useOpenYurtStatus.test.tsx` covers the
// 'Disconnected' phase and the endpoints[0].publicIP undefined branch, but
// leaves the 'Failed' arm, the endpoints-not-array fallback, and the
// non-array pods payload untested.

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

describe('useOpenYurtStatus — parseGateway branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('maps status.phase === "Failed" to disconnected (parseGateway Failed arm)', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-failed',
            cluster: 'cluster-a',
            spec: { endpoints: [{ publicIP: '10.0.0.5' }] },
            // No activeEndpoints, no nodes, phase = 'Failed' → 'disconnected'.
            status: { phase: 'Failed' },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.gateways).toHaveLength(1)
    expect(data.gateways[0]).toMatchObject({
      name: 'gw-failed',
      status: 'disconnected',
      endpoint: '10.0.0.5',
    })
  })

  it('falls back to spec.endpoint when spec.endpoints is not an array', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-legacy',
            cluster: 'cluster-a',
            // endpoints is a string, NOT an array → Array.isArray false → []
            // → falls through to `spec.endpoint ?? ''`.
            spec: {
              nodePool: 'edge-north',
              endpoints: 'not-an-array',
              endpoint: 'legacy.gw.internal',
            },
            status: { activeEndpoints: ['10.0.0.5'] },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.gateways[0]).toMatchObject({
      name: 'gw-legacy',
      nodePool: 'edge-north',
      status: 'connected',
      endpoint: 'legacy.gw.internal',
    })
  })

  it('defaults endpoint to empty string when neither endpoints[] nor spec.endpoint are set', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            name: 'gw-blank',
            cluster: 'cluster-a',
            spec: { nodePool: 'edge-south' },
            status: { phase: 'Failed' },
          },
        ],
      }))

    const data = await lastCacheOptions().fetcher()

    expect(data.gateways[0]).toEqual({
      name: 'gw-blank',
      nodePool: 'edge-south',
      status: 'disconnected',
      endpoint: '',
    })
  })
})

describe('useOpenYurtStatus — fetchPods branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('treats a non-array body.pods as an empty pod list (health = not-installed)', async () => {
    renderHook(() => useOpenYurtStatus())
    // The fetcher calls fetchPods twice when the labeled query returns no
    // pods (labeled selector, then unlabeled fallback). Both bodies use a
    // non-array `pods` value to hit Array.isArray-false → [] on both hops.
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ pods: null as unknown as never[] }))
      .mockResolvedValueOnce(jsonResponse({ pods: null as unknown as never[] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.health).toBe('not-installed')
    expect(data.controllerPods).toEqual({ ready: 0, total: 0 })
    expect(data.fetchError).toBeNull()
  })

  it('treats a body with no `pods` key at all as an empty pod list', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}))

    const data = await lastCacheOptions().fetcher()

    expect(data.health).toBe('not-installed')
    expect(data.controllerPods).toEqual({ ready: 0, total: 0 })
  })
})
