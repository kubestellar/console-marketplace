import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useGlobalFilters } from '../useGlobalFilters'

describe('useGlobalFilters', () => {
  it('initialises selectedClusters as an empty array', () => {
    const { result } = renderHook(() => useGlobalFilters())
    expect(result.current.selectedClusters).toEqual([])
  })

  it('toggleCluster adds a cluster when absent', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('cluster-a')
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a'])
  })

  it('toggleCluster removes a cluster when already present', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('cluster-a')
      result.current.toggleCluster('cluster-b')
    })
    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-b'])

    act(() => {
      result.current.toggleCluster('cluster-a')
    })
    expect(result.current.selectedClusters).toEqual(['cluster-b'])
  })

  it('toggleCluster preserves relative order of remaining clusters on remove', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.setSelectedClusters(['a', 'b', 'c', 'd'])
    })
    act(() => {
      result.current.toggleCluster('b')
    })
    expect(result.current.selectedClusters).toEqual(['a', 'c', 'd'])
  })

  it('setSelectedClusters replaces the list wholesale', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('cluster-a')
      result.current.setSelectedClusters(['x', 'y'])
    })

    expect(result.current.selectedClusters).toEqual(['x', 'y'])
  })

  it('clearSelectedClusters empties the list', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.setSelectedClusters(['a', 'b', 'c'])
    })
    expect(result.current.selectedClusters).toEqual(['a', 'b', 'c'])

    act(() => {
      result.current.clearSelectedClusters()
    })
    expect(result.current.selectedClusters).toEqual([])
  })

  it('toggleCluster and clearSelectedClusters keep stable references across renders', () => {
    const { result, rerender } = renderHook(() => useGlobalFilters())
    const firstToggle = result.current.toggleCluster
    const firstClear = result.current.clearSelectedClusters

    rerender()

    expect(result.current.toggleCluster).toBe(firstToggle)
    expect(result.current.clearSelectedClusters).toBe(firstClear)
  })
})
