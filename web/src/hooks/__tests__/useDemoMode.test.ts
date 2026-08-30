import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDemoMode } from '../useDemoMode'

const STORAGE_KEY = 'marketplace-demo-mode'

describe('useDemoMode', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to false when localStorage is empty', () => {
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(false)
  })

  it('reads an existing "true" value from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(true)
  })

  it('treats any non-"true" stored value as false', () => {
    window.localStorage.setItem(STORAGE_KEY, 'yes')
    const { result } = renderHook(() => useDemoMode())
    expect(result.current.isDemoMode).toBe(false)
  })

  it('toggleDemoMode flips the current value and persists it', () => {
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

  it('setDemoMode(value) assigns exactly and persists', () => {
    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.setDemoMode(true)
    })
    expect(result.current.isDemoMode).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

    act(() => {
      result.current.setDemoMode(false)
    })
    expect(result.current.isDemoMode).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('persists on mount even when nothing has changed (initial effect)', () => {
    renderHook(() => useDemoMode())
    // The mount-time useEffect writes the initial value through, so the key
    // exists even when the caller never toggled anything.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('exposes stable callback references across renders', () => {
    const { result, rerender } = renderHook(() => useDemoMode())
    const firstToggle = result.current.toggleDemoMode
    const firstSet = result.current.setDemoMode
    rerender()
    expect(result.current.toggleDemoMode).toBe(firstToggle)
    expect(result.current.setDemoMode).toBe(firstSet)
  })
})
