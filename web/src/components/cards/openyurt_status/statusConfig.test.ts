// Drift-guard tests for statusConfig.tsx.
//
// The three status-config records (POOL_STATUS_CONFIG, POOL_TYPE_CONFIG,
// GATEWAY_STATUS_CONFIG) are keyed off union types declared in
// ./demoData. If a new NodePoolStatus / NodePoolType / GatewayStatus
// value is added to demoData without a matching entry here, the card
// renders `undefined.label` / `undefined.color` / `undefined.icon` at
// runtime — silently, because TypeScript's exhaustiveness check only
// runs at compile time and the parent card's happy-path tests only
// exercise the values present in OPENYURT_DEMO_DATA.
//
// These tests iterate every union value observed in OPENYURT_DEMO_DATA
// plus every literal declared in demoData.ts and assert that the config
// covers it, matching the "allowlist" invariant convention already used
// for openkruise_status/types.ts. Filed for issue #797.

import { describe, it, expect } from 'vitest'
import {
  POOL_STATUS_CONFIG,
  POOL_TYPE_CONFIG,
  GATEWAY_STATUS_CONFIG,
} from './statusConfig'
import {
  OPENYURT_DEMO_DATA,
  type NodePoolStatus,
  type NodePoolType,
  type GatewayStatus,
} from './demoData'

// Enumerate every literal in the union types below. If a maintainer
// widens a union in demoData.ts, this list is what should be updated
// alongside the config record — the drift is then caught here rather
// than in production.
const ALL_POOL_STATUSES: readonly NodePoolStatus[] = [
  'ready',
  'degraded',
  'not-ready',
]
const ALL_POOL_TYPES: readonly NodePoolType[] = ['edge', 'cloud']
const ALL_GATEWAY_STATUSES: readonly GatewayStatus[] = [
  'connected',
  'disconnected',
  'pending',
]

describe('POOL_STATUS_CONFIG', () => {
  it.each(ALL_POOL_STATUSES)(
    'has a fully populated entry for status %s',
    (status) => {
      const entry = POOL_STATUS_CONFIG[status]
      expect(entry).toBeDefined()
      expect(entry.label).toBeTruthy()
      expect(entry.color).toMatch(/^text-/)
      expect(entry.icon).toBeTruthy()
    },
  )

  it('covers every NodePoolStatus value present in demo data', () => {
    for (const pool of OPENYURT_DEMO_DATA.nodePools) {
      expect(POOL_STATUS_CONFIG[pool.status]).toBeDefined()
    }
  })

  it('has exactly the expected key set (drift guard)', () => {
    expect(Object.keys(POOL_STATUS_CONFIG).sort()).toEqual(
      [...ALL_POOL_STATUSES].sort(),
    )
  })
})

describe('POOL_TYPE_CONFIG', () => {
  it.each(ALL_POOL_TYPES)('has a fully populated entry for type %s', (type) => {
    const entry = POOL_TYPE_CONFIG[type]
    expect(entry).toBeDefined()
    expect(entry.label).toBeTruthy()
    expect(entry.icon).toBeTruthy()
  })

  it('covers every NodePoolType value present in demo data', () => {
    for (const pool of OPENYURT_DEMO_DATA.nodePools) {
      expect(POOL_TYPE_CONFIG[pool.type]).toBeDefined()
    }
  })

  it('has exactly the expected key set (drift guard)', () => {
    expect(Object.keys(POOL_TYPE_CONFIG).sort()).toEqual(
      [...ALL_POOL_TYPES].sort(),
    )
  })
})

describe('GATEWAY_STATUS_CONFIG', () => {
  it.each(ALL_GATEWAY_STATUSES)(
    'has a fully populated entry for status %s',
    (status) => {
      const entry = GATEWAY_STATUS_CONFIG[status]
      expect(entry).toBeDefined()
      expect(entry.label).toBeTruthy()
      expect(entry.color).toMatch(/^text-/)
      expect(entry.icon).toBeTruthy()
    },
  )

  it('covers every GatewayStatus value present in demo data', () => {
    for (const gw of OPENYURT_DEMO_DATA.gateways) {
      expect(GATEWAY_STATUS_CONFIG[gw.status]).toBeDefined()
    }
  })

  it('has exactly the expected key set (drift guard)', () => {
    expect(Object.keys(GATEWAY_STATUS_CONFIG).sort()).toEqual(
      [...ALL_GATEWAY_STATUSES].sort(),
    )
  })
})
