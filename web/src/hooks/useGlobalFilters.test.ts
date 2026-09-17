import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useGlobalFilters } from './useGlobalFilters'

describe('useGlobalFilters', () => {
  it('starts with no selected clusters', () => {
    const { result } = renderHook(() => useGlobalFilters())
    expect(result.current.selectedClusters).toEqual([])
  })

  it('toggleCluster adds a cluster that is not currently selected', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('cluster-a')
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a'])
  })

  it('toggleCluster removes a cluster that is currently selected', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('cluster-a')
    })
    act(() => {
      result.current.toggleCluster('cluster-a')
    })

    expect(result.current.selectedClusters).toEqual([])
  })

  it('toggleCluster appends new clusters while preserving prior selections', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('a')
    })
    act(() => {
      result.current.toggleCluster('b')
    })
    act(() => {
      result.current.toggleCluster('c')
    })

    expect(result.current.selectedClusters).toEqual(['a', 'b', 'c'])
  })

  it('toggleCluster removes only the matching entry when several are selected', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.setSelectedClusters(['a', 'b', 'c'])
    })
    act(() => {
      result.current.toggleCluster('b')
    })

    expect(result.current.selectedClusters).toEqual(['a', 'c'])
  })

  it('setSelectedClusters replaces the entire selection', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.setSelectedClusters(['x', 'y'])
    })

    expect(result.current.selectedClusters).toEqual(['x', 'y'])

    act(() => {
      result.current.setSelectedClusters([])
    })

    expect(result.current.selectedClusters).toEqual([])
  })

  it('clearSelectedClusters empties a populated selection', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.setSelectedClusters(['a', 'b'])
    })
    act(() => {
      result.current.clearSelectedClusters()
    })

    expect(result.current.selectedClusters).toEqual([])
  })

  it('clearSelectedClusters is a no-op when nothing is selected', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.clearSelectedClusters()
    })

    expect(result.current.selectedClusters).toEqual([])
  })
})
