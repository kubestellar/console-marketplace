import { useCallback, useEffect, useState } from 'react'

const DEMO_MODE_STORAGE_KEY = 'marketplace-demo-mode'

function readDemoMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true'
}

function persistDemoMode(value: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(value))
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
