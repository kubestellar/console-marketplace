import { useCallback, useState } from 'react'

export function useGlobalFilters() {
  const [selectedClusters, setSelectedClusters] = useState<string[]>([])

  const toggleCluster = useCallback((cluster: string) => {
    setSelectedClusters((current) => {
      if (current.includes(cluster)) {
        return current.filter((item) => item !== cluster)
      }

      return [...current, cluster]
    })
  }, [])

  const clearSelectedClusters = useCallback(() => {
    setSelectedClusters([])
  }, [])

  return {
    selectedClusters,
    setSelectedClusters,
    toggleCluster,
    clearSelectedClusters,
  }
}
