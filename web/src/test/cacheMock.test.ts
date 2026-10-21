// Direct unit tests for the shared `useCache` / `authFetch` mock scaffolding
// in cacheMock.ts. Every card hook test suite imports these helpers, but no
// suite directly exercises `rejectRawFetch()`'s returned stub itself (it is
// only ever installed via `vi.stubGlobal` and never invoked, because the
// suites that use it correctly route every request through `authFetch`).
// That left `rejectRawFetch` at 0% function coverage despite ~100% coverage
// everywhere else in the file. See kubestellar/console-marketplace coverage
// gap finding (quality agent).

import { describe, expect, it, vi } from 'vitest'

import { createCacheMocks, jsonResponse, rejectRawFetch, routeAuthFetchByPath } from './cacheMock'

describe('jsonResponse', () => {
  it('defaults to a 200 OK response that resolves the given body', async () => {
    const response = jsonResponse({ hello: 'world' })

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    await expect(response.json()).resolves.toEqual({ hello: 'world' })
  })

  it('honors overridden ok/status/statusText fields', async () => {
    const response = jsonResponse({ error: 'nope' }, { ok: false, status: 503, statusText: 'Service Unavailable' })

    expect(response.ok).toBe(false)
    expect(response.status).toBe(503)
    expect(response.statusText).toBe('Service Unavailable')
    await expect(response.json()).resolves.toEqual({ error: 'nope' })
  })
})

describe('createCacheMocks / lastCacheOptions', () => {
  it('returns independent spies and the most recent useCache call options', () => {
    const { mockUseCache, mockAuthFetch, mockFetch, lastCacheOptions } = createCacheMocks<{ value: number }>()

    expect(lastCacheOptions()).toBeUndefined()

    const firstOptions = {
      key: 'first',
      fetcher: async () => ({ value: 1 }),
      demoData: { value: 0 },
      initialData: { value: 0 },
      category: 'test',
      persist: false,
      demoWhenEmpty: false,
    }
    const secondOptions = { ...firstOptions, key: 'second' }

    mockUseCache(firstOptions)
    mockUseCache(secondOptions)

    expect(lastCacheOptions()).toEqual(secondOptions)
    expect(mockAuthFetch).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('routeAuthFetchByPath', () => {
  it('routes MCP pods-path requests to mockFetch', () => {
    const mockFetch = vi.fn()
    const mockAuthFetch = vi.fn()
    const router = routeAuthFetchByPath(mockFetch, mockAuthFetch)

    router('/api/mcp/pods?namespace=default')

    expect(mockFetch).toHaveBeenCalledWith('/api/mcp/pods?namespace=default', undefined)
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('routes everything else to mockAuthFetch', () => {
    const mockFetch = vi.fn()
    const mockAuthFetch = vi.fn()
    const router = routeAuthFetchByPath(mockFetch, mockAuthFetch)
    const init = { method: 'GET' }

    router('/api/mcp/custom-resources', init)

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/mcp/custom-resources', init)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('rejectRawFetch', () => {
  it('returns a stub whose invocation rejects, naming the offending input', async () => {
    const stub = rejectRawFetch()

    await expect(stub('/some/raw/path')).rejects.toThrow(
      'raw fetch(/some/raw/path) called; card fetchers must use authFetch',
    )
  })
})
