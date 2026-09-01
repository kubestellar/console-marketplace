// Guards the `String(e)` / `String(err)` fallback arms in
// `useOpenYurtStatus.ts` at lines 234, 266, 272. These branches fire when the
// underlying rejection is not an `Error` instance (e.g. a bare string thrown
// from a mocked fetch, or a fetch aborted by `AbortSignal.timeout` in some
// runtimes where the DOMException does not appear as an Error subclass).
//
// The existing suite in `useOpenYurtStatus.test.tsx` only rejects with
// `new Error(...)`, so the falsy arm of `e instanceof Error ? e.message : String(e)`
// was previously unreachable in coverage. A regression that dropped the
// `String(e)` fallback and used `e.message` unconditionally would produce
// `undefined` messages for these three fetchError scopes.

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

describe('useOpenYurtStatus — non-Error rejection fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
  })

  it('stringifies a non-Error pods-fetch rejection via String(e) (line 234 fallback)', async () => {
    renderHook(() => useOpenYurtStatus())
    // Throw a bare string, NOT an Error instance, so `e instanceof Error` is false.
    mockFetch.mockRejectedValueOnce('boom-string')

    const data = await lastCacheOptions().fetcher()

    expect(data.health).toBe('not-installed')
    expect(data.fetchError).toEqual({
      resource: 'pods',
      message: 'boom-string',
    })
  })

  it('stringifies a non-Error object rejection from pods fetch', async () => {
    renderHook(() => useOpenYurtStatus())
    // Object literal without an Error prototype hits String(e) → "[object Object]".
    mockFetch.mockRejectedValueOnce({ code: 42 })

    const data = await lastCacheOptions().fetcher()

    expect(data.fetchError).toEqual({
      resource: 'pods',
      message: '[object Object]',
    })
  })

  it('stringifies a non-Error nodepool rejection via String(err) (line 266 fallback)', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    // nodepool authFetch rejects with a plain string (non-Error). Gateway
    // resolves successfully so we exercise the nodepool branch specifically.
    mockAuthFetch
      .mockRejectedValueOnce('rbac-denied-string')
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const data = await lastCacheOptions().fetcher()

    expect(data.fetchError).toEqual({
      resource: 'nodepools',
      message: 'rbac-denied-string',
    })
    // Gateway data still flows through (empty items → empty gateways array).
    expect(data.gateways).toEqual([])
    expect(data.nodePools).toEqual([])
  })

  it('stringifies a non-Error gateway rejection via String(err) (line 272 fallback)', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    // Nodepool succeeds, gateway rejects with a numeric literal — String(err) → "503".
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockRejectedValueOnce(503)

    const data = await lastCacheOptions().fetcher()

    expect(data.fetchError).toEqual({
      resource: 'gateways',
      message: '503',
    })
    expect(data.nodePools).toEqual([])
  })
})
