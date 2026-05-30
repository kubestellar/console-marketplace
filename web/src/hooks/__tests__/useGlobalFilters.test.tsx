import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useGlobalFilters } from '../useGlobalFilters'

describe('useGlobalFilters', () => {
  it('starts with no selected clusters and supports direct updates', () => {
    const { result } = renderHook(() => useGlobalFilters())

    expect(result.current.selectedClusters).toEqual([])

    act(() => {
      result.current.setSelectedClusters(['cluster-a', 'cluster-b'])
    })

    expect(result.current.selectedClusters).toEqual(['cluster-a', 'cluster-b'])
  })

  it('toggles individual clusters and can clear the selection', () => {
    const { result } = renderHook(() => useGlobalFilters())

    act(() => {
      result.current.toggleCluster('cluster-a')
      result.current.toggleCluster('cluster-b')
      result.current.toggleCluster('cluster-a')
    })

    expect(result.current.selectedClusters).toEqual(['cluster-b'])

    act(() => {
      result.current.clearSelectedClusters()
    })

    expect(result.current.selectedClusters).toEqual([])
  })
})
