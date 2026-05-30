import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDemoMode } from '../useDemoMode'

describe('useDemoMode', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to disabled mode and persists toggles', () => {
    const { result } = renderHook(() => useDemoMode())

    expect(result.current.isDemoMode).toBe(false)

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(true)
    expect(window.localStorage.getItem('marketplace-demo-mode')).toBe('true')
  })

  it('hydrates from localStorage and supports explicit updates', () => {
    window.localStorage.setItem('marketplace-demo-mode', 'true')
    const { result } = renderHook(() => useDemoMode())

    expect(result.current.isDemoMode).toBe(true)

    act(() => {
      result.current.setDemoMode(false)
    })

    expect(result.current.isDemoMode).toBe(false)
    expect(window.localStorage.getItem('marketplace-demo-mode')).toBe('false')
  })
})
