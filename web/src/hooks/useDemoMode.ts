import { useCallback, useEffect, useState } from 'react'

const DEMO_MODE_STORAGE_KEY = 'marketplace-demo-mode'

// Bounded, fixed-shape structured record — only the operation and a short
// error name/message, never raw storage contents — matching the convention
// used by useVersionCheck's VERSION_CHECK_SUMMARY and openyurt_status's
// OPENYURT_STATUS_FETCH_SUMMARY. Console-only: no exporter, metrics backend,
// or external data flow, since this repo has no confirmed observability
// backend (see runbooks/SLO.md).
function logStorageError(op: 'read' | 'write', error: unknown): void {
  console.error('DEMO_MODE_STORAGE_SUMMARY:', {
    op,
    status: 'failed',
    reason: error instanceof Error ? error.message : String(error),
  })
}

function readDemoMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  // localStorage access can throw (SecurityError in Safari private
  // browsing, storage disabled by user/policy, etc.) — fail safe to the
  // default rather than crashing the hook's useState initializer.
  try {
    return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true'
  } catch (e) {
    logStorageError('read', e)
    return false
  }
}

// Exported only so the SSR guard is directly testable; the hook's effect
// never runs during server render.
export function persistDemoMode(value: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  // Can throw QuotaExceededError or SecurityError; swallow so an inability
  // to persist never breaks in-memory toggling, but leave a trace.
  try {
    window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(value))
  } catch (e) {
    logStorageError('write', e)
  }
}

export function useDemoMode() {
  const [isDemoMode, setIsDemoModeState] = useState(readDemoMode)

  useEffect(() => {
    persistDemoMode(isDemoMode)
  }, [isDemoMode])

  const toggleDemoMode = useCallback(() => {
    setIsDemoModeState((current) => !current)
  }, [])

  const setDemoMode = useCallback((value: boolean) => {
    setIsDemoModeState(value)
  }, [])

  return { isDemoMode, toggleDemoMode, setDemoMode }
}
