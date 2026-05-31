import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useGlobalFilters } from '../useGlobalFilters'

describe('useGlobalFilters', () => {
  it('starts empty and supports direct plus functional updates', () => {
    const { result } = renderHook(() => useGlobalFilters())

    expect(result.current.selectedClusters).toEqual([])

    act(() => {
      result.current.setSelectedClusters(['cluster-a'])
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a'])

    act(() => {
      result.current.setSelectedClusters((current) => [...current, 'cluster-b'])
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-b'])
  })

  it('toggles clusters in insertion order and removes existing selections without duplicates', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('cluster-a')
      result.current.toggleCluster('cluster-b')
      result.current.toggleCluster('cluster-a')
      result.current.toggleCluster('cluster-c')
      result.current.toggleCluster('cluster-c')
    })

    expect(result.current.selectedClusters).toEqual(['cluster-b'])
  })

  it('clears all selected clusters after mixed updates', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.setSelectedClusters(['cluster-a', 'cluster-b'])
      result.current.toggleCluster('cluster-c')
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-b', 'cluster-c'])

    act(() => {
      result.current.clearSelectedClusters()
    })

    expect(result.current.selectedClusters).toEqual([])
  })
})
