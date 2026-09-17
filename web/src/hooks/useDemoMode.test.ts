import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useDemoMode } from './useDemoMode'

const STORAGE_KEY = 'marketplace-demo-mode'

describe('useDemoMode', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('defaults to false when localStorage has no value for the key', () => {
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(false)
  })

  it('initialises from localStorage when the stored value is exactly the string "true"', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(true)
  })

  it('treats any non-"true" stored value as false (defensive read)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'TRUE')
    const { result: upper } = renderHook(() => useDemoMode())
    expect(upper.current.isDemoMode).toBe(false)

    window.localStorage.setItem(STORAGE_KEY, '1')
    const { result: numeric } = renderHook(() => useDemoMode())
    expect(numeric.current.isDemoMode).toBe(false)

    window.localStorage.setItem(STORAGE_KEY, '')
    const { result: empty } = renderHook(() => useDemoMode())
    expect(empty.current.isDemoMode).toBe(false)
  })

  it('persists the initial (false) state to localStorage on mount', () => {
    renderHook(() => useDemoMode())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('toggleDemoMode flips the state and persists it', () => {
    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('setDemoMode(true) enables demo mode and persists it', () => {
    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.setDemoMode(true)
    })

    expect(result.current.isDemoMode).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('setDemoMode(false) disables demo mode after it was enabled', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(true)

    act(() => {
      result.current.setDemoMode(false)
    })

    expect(result.current.isDemoMode).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('toggleDemoMode and setDemoMode identities are stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useDemoMode())
    const initialToggle = result.current.toggleDemoMode
    const initialSet = result.current.setDemoMode

    rerender()

    expect(result.current.toggleDemoMode).toBe(initialToggle)
    expect(result.current.setDemoMode).toBe(initialSet)
  })
})
