const EMPTY_CLUSTERS: string[] = []

export function useClusters() {
  return {
    clusters: EMPTY_CLUSTERS,
    isLoading: false,
    error: null,
    refetch: async () => {},
  }
}
