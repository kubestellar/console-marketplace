// logStorageError's `error instanceof Error ? error.message : String(error)`
// ternary (src/hooks/useDemoMode.ts) has two branches, but every existing
// throw-path test (useDemoMode.test.ts) throws a DOMException — and jsdom's
// DOMException does NOT satisfy `instanceof Error`, so those tests only ever
// exercise the `String(error)` arm. The `error.message` arm was therefore
// dead in coverage despite being reachable (any plain `Error`/TypeError
// thrown by a localStorage shim, polyfill, or future refactor would take
// it). This file throws a genuine `Error` to close that gap.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDemoMode } from '../useDemoMode'

const STORAGE_KEY = 'marketplace-demo-mode'

describe('useDemoMode — logStorageError error.message branch', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('uses error.message (not String(error)) when getItem throws a real Error', () => {
    const getItemSpy = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('boom-real-error')
      })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useDemoMode())

    expect(result.current.isDemoMode).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
      'DEMO_MODE_STORAGE_SUMMARY:',
      expect.objectContaining({ op: 'read', status: 'failed', reason: 'boom-real-error' })
    )

    getItemSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('uses error.message (not String(error)) when setItem throws a real Error', () => {
    const setItemSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new TypeError('boom-write-error')
      })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useDemoMode())

    act(() => {
      result.current.toggleDemoMode()
    })

    expect(result.current.isDemoMode).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      'DEMO_MODE_STORAGE_SUMMARY:',
      expect.objectContaining({ op: 'write', status: 'failed', reason: 'boom-write-error' })
    )

    setItemSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
