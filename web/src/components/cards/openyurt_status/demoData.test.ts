import { describe, expect, it } from 'vitest'
import { OPENYURT_DEMO_DATA } from './demoData'

describe('OPENYURT_DEMO_DATA', () => {
  it('has valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(OPENYURT_DEMO_DATA.health)
  })

  it('has valid controllerPods fields', () => {
    expect(typeof OPENYURT_DEMO_DATA.controllerPods.ready).toBe('number')
    expect(typeof OPENYURT_DEMO_DATA.controllerPods.total).toBe('number')
    expect(OPENYURT_DEMO_DATA.controllerPods.ready).toBeGreaterThanOrEqual(0)
    expect(OPENYURT_DEMO_DATA.controllerPods.total).toBeGreaterThan(0)
    expect(OPENYURT_DEMO_DATA.controllerPods.ready).toBeLessThanOrEqual(
      OPENYURT_DEMO_DATA.controllerPods.total
    )
  })

  it('contains node pools with required fields and valid status', () => {
    expect(OPENYURT_DEMO_DATA.nodePools.length).toBeGreaterThan(0)

    for (const pool of OPENYURT_DEMO_DATA.nodePools) {
      expect(pool.name).toBeTruthy()
      expect(['edge', 'cloud']).toContain(pool.type)
      expect(['ready', 'degraded', 'not-ready']).toContain(pool.status)
      expect(typeof pool.nodeCount).toBe('number')
      expect(typeof pool.readyNodes).toBe('number')
      expect(typeof pool.autonomyEnabled).toBe('boolean')
      expect(pool.nodeCount).toBeGreaterThan(0)
      expect(pool.readyNodes).toBeGreaterThanOrEqual(0)
      expect(pool.readyNodes).toBeLessThanOrEqual(pool.nodeCount)
    }
  })

  it('contains gateways with required fields and valid status', () => {
    expect(OPENYURT_DEMO_DATA.gateways.length).toBeGreaterThan(0)

    for (const gw of OPENYURT_DEMO_DATA.gateways) {
      expect(gw.name).toBeTruthy()
      expect(gw.nodePool).toBeTruthy()
      expect(['connected', 'disconnected', 'pending']).toContain(gw.status)
      expect(gw.endpoint).toBeTruthy()
    }
  })

  it('has valid aggregate numeric fields', () => {
    expect(typeof OPENYURT_DEMO_DATA.totalNodes).toBe('number')
    expect(typeof OPENYURT_DEMO_DATA.autonomousNodes).toBe('number')
    expect(OPENYURT_DEMO_DATA.totalNodes).toBeGreaterThan(0)
    expect(OPENYURT_DEMO_DATA.autonomousNodes).toBeGreaterThanOrEqual(0)
    expect(OPENYURT_DEMO_DATA.autonomousNodes).toBeLessThanOrEqual(OPENYURT_DEMO_DATA.totalNodes)
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(OPENYURT_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })

  it('has valid fetchError field when present', () => {
    if (OPENYURT_DEMO_DATA.fetchError !== null && OPENYURT_DEMO_DATA.fetchError !== undefined) {
      expect(['pods', 'nodepools', 'gateways']).toContain(OPENYURT_DEMO_DATA.fetchError.resource)
      expect(OPENYURT_DEMO_DATA.fetchError.message).toBeTruthy()
    }
  })
})
