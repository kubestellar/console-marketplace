import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseCacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  demoData: T
  initialData: T
  category: string
  persist: boolean
  demoWhenEmpty?: boolean
  /** When true, invoke `fetcher` on mount and on `refetch`. Default: stub behaviour. */
  live?: boolean
}

// Return shape of useCache. Exported so per-card status hooks
// (buildpacks/coredns/notary/openyurt/…) can name their result type
// as a single alias instead of redeclaring the same eight fields.
export interface UseCacheResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isFailed: boolean
  isDemoFallback: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

interface CacheEntry<T> {
  value: T
  expiresAt: number | null
}

const cacheStore = new Map<string, CacheEntry<unknown>>()

export function setCacheValue<T>(key: string, value: T, ttlMs?: number) {
  cacheStore.set(key, {
    value,
    expiresAt: typeof ttlMs === 'number' ? Date.now() + ttlMs : null,
  })
}

export function getCacheValue<T>(key: string): T | undefined {
  const entry = cacheStore.get(key)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    cacheStore.delete(key)
    return undefined
  }

  return entry.value as T
}

export function clearCacheValue(key?: string) {
  if (key) {
    cacheStore.delete(key)
    return
  }

  cacheStore.clear()
}

export function useCache<T>(options: UseCacheOptions<T>): UseCacheResult<T> {
  const { key, live = false } = options
  const fetcherRef = useRef(options.fetcher)
  fetcherRef.current = options.fetcher

  const [fetched, setFetched] = useState<{ key: string; value: T } | null>(null)
  const [isLoading, setIsLoading] = useState(live)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refetch = useCallback(async () => {
    if (!live) {
      return
    }
    setIsRefreshing(true)
    try {
      const value = await fetcherRef.current()
      if (!mountedRef.current) {
        return
      }
      setCacheValue<T>(key, value)
      setFetched({ key, value })
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
    } catch {
      if (mountedRef.current) {
        setConsecutiveFailures(n => n + 1)
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [key, live])

  useEffect(() => {
    if (live) {
      void refetch()
    }
  }, [live, refetch])

  const liveValue = fetched && fetched.key === key ? fetched.value : undefined

  return {
    data: liveValue ?? getCacheValue<T>(key) ?? options.initialData,
    isLoading: live && isLoading && liveValue === undefined,
    isRefreshing,
    isFailed: consecutiveFailures > 0,
    isDemoFallback: false,
    consecutiveFailures,
    lastRefresh,
    refetch,
  }
}
