import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDemoMode } from '../useDemoMode'

describe('useDemoMode', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to disabled mode and persists the initial state', () => {
    const { result } = renderHook(() => useDemoMode())

    expect(result.current.isDemoMode).toBe(false)
    expect(window.localStorage.getItem('marketplace-demo-mode')).toBe('false')
  })

  it('hydrates from localStorage and toggles in both directions', () => {
    window.localStorage.setItem('marketplace-demo-mode', 'true')
    const { result } = renderHook(() => useDemoMode())

    expect(result.current.isDemoMode).toBe(true)

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(false)
    expect(window.localStorage.getItem('marketplace-demo-mode')).toBe('false')

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(true)
    expect(window.localStorage.getItem('marketplace-demo-mode')).toBe('true')
  })

  it('supports explicit updates without relying on prior toggles', () => {
    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.setDemoMode(true)
    })

    expect(result.current.isDemoMode).toBe(true)
    expect(window.localStorage.getItem('marketplace-demo-mode')).toBe('true')

    act(() => {
      result.current.setDemoMode(false)
    })

    expect(result.current.isDemoMode).toBe(false)
    expect(window.localStorage.getItem('marketplace-demo-mode')).toBe('false')
  })
})
