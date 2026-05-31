import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCardLoadingState, useReportCardDataState } from './CardDataContext'

describe('CardDataContext hooks', () => {
  it('returns the default card loading state', () => {
    const { result } = renderHook(() => useCardLoadingState())

    expect(result.current).toEqual({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
    })
  })

  it('returns an undefined report handler by default', () => {
    const { result } = renderHook(() => useReportCardDataState())

    expect(result.current).toBeUndefined()
  })
})
