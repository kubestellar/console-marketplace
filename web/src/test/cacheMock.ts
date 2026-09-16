/**
 * Shared scaffolding for the `useCache` / `authFetch` mock preambles
 * duplicated across card hook `*.test.ts(x)` suites (see issue #591).
 * `vi.mock(...)` calls are hoisted by vitest, so each test file must still
 * declare its own `vi.mock('../../../lib/cache', ...)` /
 * `vi.mock('../../../lib/api', ...)` calls, but they can delegate to the
 * `mockUseCache` / `mockAuthFetch` instances created here instead of each
 * file re-declaring its own `vi.fn()`s, types, and helpers.
 *
 * Example usage in a test file:
 *
 *   import { createCacheMocks, jsonResponse } from '../../test/cacheMock'
 *
 *   const { mockUseCache, mockAuthFetch, mockFetch, lastCacheOptions } = createCacheMocks<OpenYurtStatusData>()
 *
 *   vi.mock('../../../lib/cache', () => ({
 *     useCache: (options: unknown) => mockUseCache(options),
 *   }))
 *
 *   vi.mock('../../../lib/api', () => ({
 *     authFetch: (...args: unknown[]) => mockAuthFetch(...args),
 *   }))
 */
import { vi } from 'vitest'

/** Shape of the options object a hook passes into `useCache`. */
export interface CacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  demoData: T
  initialData: T
  category: string
  persist: boolean
  demoWhenEmpty: boolean
}

/** Minimal `fetch` Response shape consumed by hook fetchers under test. */
export interface JsonResponse<T> {
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<T>
}

/** Builds a mock `fetch`-style JSON response, defaulting to a 200 OK. */
export function jsonResponse<T>(body: T, init: Partial<Omit<JsonResponse<T>, 'json'>> = {}): JsonResponse<T> {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  }
}

/**
 * Creates the `mockUseCache` / `mockAuthFetch` / `mockFetch` spies and the
 * `lastCacheOptions()` accessor shared across card hook test suites. Callers
 * still own the (hoisted) `vi.mock(...)` wiring; this only centralizes the
 * spy instances, types, and derived helpers.
 */
export function createCacheMocks<T>() {
  const mockUseCache = vi.fn()
  const mockAuthFetch = vi.fn()
  const mockFetch = vi.fn()

  function lastCacheOptions(): CacheOptions<T> {
    return mockUseCache.mock.calls.at(-1)?.[0] as CacheOptions<T>
  }

  return { mockUseCache, mockAuthFetch, mockFetch, lastCacheOptions }
}
