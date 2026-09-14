// Guards the OPENYURT_STATUS_FETCH_SUMMARY console.error record added
// alongside `fetchError` in useOpenYurtStatus.ts. Previously a pods /
// nodepools / gateways fetch failure was only ever stored in the returned
// `fetchError` field with no consuming UI element in this repo, so the
// failure left zero trace in browser/CI console logs. This mirrors the
// convention already used by useVersionCheck's VERSION_CHECK_SUMMARY record:
// a single bounded, fixed-shape console.error per failure scope, never the
// raw response body.

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('useOpenYurtStatus — OPENYURT_STATUS_FETCH_SUMMARY logging', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockUseCache.mockReturnValue(defaultCacheResult)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('logs a bounded record when the pods fetch fails', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockRejectedValueOnce(new Error('HTTP 403 Forbidden'))

    await lastCacheOptions().fetcher()

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('OPENYURT_STATUS_FETCH_SUMMARY:', {
      resource: 'pods',
      status: 'failed',
      reason: 'HTTP 403 Forbidden',
    })
  })

  it('logs a bounded record when the nodepools CR fetch fails', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockRejectedValueOnce(new Error('HTTP 403 Forbidden'))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    await lastCacheOptions().fetcher()

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('OPENYURT_STATUS_FETCH_SUMMARY:', {
      resource: 'nodepools',
      status: 'failed',
      reason: 'HTTP 403 Forbidden',
    })
  })

  it('logs a bounded record when the gateways CR fetch fails', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockRejectedValueOnce(new Error('HTTP 500 Internal Server Error'))

    await lastCacheOptions().fetcher()

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('OPENYURT_STATUS_FETCH_SUMMARY:', {
      resource: 'gateways',
      status: 'failed',
      reason: 'HTTP 500 Internal Server Error',
    })
  })

  it('does not log anything on a fully successful fetch', async () => {
    renderHook(() => useOpenYurtStatus())
    mockFetch.mockResolvedValueOnce(jsonResponse(yurtManagerPodsPayload))
    mockAuthFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    await lastCacheOptions().fetcher()

    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
