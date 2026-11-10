/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Opt-in flag for the OpenYurt status card: set to the string "true" to
   * fetch live data via the gateway instead of the initialData/demo stub.
   * See web/src/components/cards/openyurt_status/useOpenYurtStatus.ts.
   */
  readonly VITE_OPENYURT_LIVE_FETCH?: string
}
