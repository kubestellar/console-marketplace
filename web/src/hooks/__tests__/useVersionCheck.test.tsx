import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useVersionCheck } from '../useVersionCheck'

interface JsonResponseBody {
  tag_name?: string | null
}

interface JsonResponse<T> {
  ok: boolean
  statusText: string
  json: () => Promise<T>
}

describe('useVersionCheck', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  function jsonResponse<T>(body: T, init: Partial<Omit<JsonResponse<T>, 'json'>> = {}): JsonResponse<T> {
    return {
      ok: init.ok ?? true,
      statusText: init.statusText ?? 'OK',
      json: async () => body,
    }
  }

  it('marks newer marketplace releases as upgrades', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse<JsonResponseBody>({ tag_name: 'v1.4.0' }))

    const { result } = renderHook(() => useVersionCheck('v1.3.9'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/proxy/https://api.github.com/repos/kubestellar/console-marketplace/releases/latest',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(result.current).toEqual({
      latestVersion: 'v1.4.0',
      currentVersion: 'v1.3.9',
      updateAvailable: true,
      loading: false,
      error: null,
    })
  })

  it('reports up-to-date state when the latest release does not exceed the current version', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse<JsonResponseBody>({ tag_name: 'v1.4.0' }))

    const { result } = renderHook(() => useVersionCheck('v1.4.0'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.latestVersion).toBe('v1.4.0')
    expect(result.current.currentVersion).toBe('v1.4.0')
    expect(result.current.updateAvailable).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces fetch failures as hook errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse<JsonResponseBody>({}, { ok: false, statusText: 'Forbidden' }))

    const { result } = renderHook(() => useVersionCheck('v1.4.0'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.latestVersion).toBeNull()
    expect(result.current.updateAvailable).toBe(false)
    expect(result.current.error).toBe('Version check failed: Forbidden')
  })
})
