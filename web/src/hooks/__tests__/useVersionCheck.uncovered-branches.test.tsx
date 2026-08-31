import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useVersionCheck } from '../useVersionCheck'

// Targeted regression guards for the last three uncovered lines of
// useVersionCheck.tsx: the major-version arm of isNewerVersion, the
// null-tag_name response arm, and the AbortError swallow in the catch block.

describe('useVersionCheck — uncovered branch arms', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  it('flags an upgrade when only the major version differs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      statusText: 'OK',
      json: async () => ({ tag_name: 'v2.0.0' }),
    })

    const { result } = renderHook(() => useVersionCheck('v1.9.9'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.updateAvailable).toBe(true)
    expect(result.current.latestVersion).toBe('v2.0.0')
  })

  it('coerces a missing tag_name field to a null latestVersion', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      statusText: 'OK',
      json: async () => ({}),
    })

    const { result } = renderHook(() => useVersionCheck('v1.4.0'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.latestVersion).toBeNull()
    expect(result.current.updateAvailable).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('silently swallows AbortError from unmount without surfacing an error', async () => {
    // Pending fetch that rejects with an AbortError once the caller aborts.
    mockFetch.mockImplementationOnce(
      (_input: RequestInfo, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )

    const { result, unmount } = renderHook(() => useVersionCheck('v1.4.0'))
    // Unmount before the fetch resolves — this aborts the controller and
    // triggers the AbortError early-return in the catch block.
    unmount()
    // Allow the rejection microtask to flush.
    await new Promise((r) => setTimeout(r, 0))
    // State was never updated after unmount, so loading stays true and error
    // stays null (proving the AbortError arm did not call setState).
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
