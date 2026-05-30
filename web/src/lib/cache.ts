export interface UseCacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  demoData: T
  initialData: T
  category: string
  persist: boolean
  demoWhenEmpty?: boolean
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

export function useCache<T>(options: UseCacheOptions<T>) {
  return {
    data: getCacheValue<T>(options.key) ?? options.initialData,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    isDemoFallback: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: async () => {},
  }
}
