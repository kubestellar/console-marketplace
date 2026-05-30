export interface UseCacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  demoData: T
  initialData: T
  category: string
  persist: boolean
  demoWhenEmpty?: boolean
}

export function useCache<T>(options: UseCacheOptions<T>) {
  return {
    data: options.initialData,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    isDemoFallback: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: async () => {},
  }
}
