import { OPENKRUISE_DEMO_DATA } from './demoData'

export function useOpenKruiseStatus() {
  return {
    data: OPENKRUISE_DEMO_DATA,
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    isDemoFallback: true,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: async () => {},
  }
}
