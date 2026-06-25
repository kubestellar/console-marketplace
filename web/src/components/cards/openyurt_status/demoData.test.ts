import { describe, expect, it } from 'vitest'
import { OPENYURT_DEMO_DATA } from './demoData'

describe('OPENYURT_DEMO_DATA', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(OPENYURT_DEMO_DATA.health)
  })

  it('has valid controller pod counts', () => {
    expect(typeof OPENYURT_DEMO_DATA.controllerPods.ready).toBe('number')
    expect(typeof OPENYURT_DEMO_DATA.controllerPods.total).toBe('number')
    expect(OPENYURT_DEMO_DATA.controllerPods.ready).toBeLessThanOrEqual(
      OPENYURT_DEMO_DATA.controllerPods.total
    )
  })

  it('contains node pools with required fields', () => {
    expect(OPENYURT_DEMO_DATA.nodePools.length).toBeGreaterThan(0)

    const validTypes = ['edge', 'cloud']
    const validStatuses = ['ready', 'degraded', 'not-ready']
    for (const pool of OPENYURT_DEMO_DATA.nodePools) {
      expect(pool.name).toBeTruthy()
      expect(validTypes).toContain(pool.type)
      expect(validStatuses).toContain(pool.status)
      expect(typeof pool.nodeCount).toBe('number')
      expect(typeof pool.readyNodes).toBe('number')
      expect(typeof pool.autonomyEnabled).toBe('boolean')
      expect(pool.readyNodes).toBeLessThanOrEqual(pool.nodeCount)
    }
  })

  it('contains gateways with required fields', () => {
    expect(OPENYURT_DEMO_DATA.gateways.length).toBeGreaterThan(0)

    const validStatuses = ['connected', 'disconnected', 'pending']
    for (const gw of OPENYURT_DEMO_DATA.gateways) {
      expect(gw.name).toBeTruthy()
      expect(gw.nodePool).toBeTruthy()
      expect(validStatuses).toContain(gw.status)
      expect(gw.endpoint).toBeTruthy()
    }
  })

  it('has valid aggregate node counts', () => {
    expect(typeof OPENYURT_DEMO_DATA.totalNodes).toBe('number')
    expect(typeof OPENYURT_DEMO_DATA.autonomousNodes).toBe('number')
    expect(OPENYURT_DEMO_DATA.totalNodes).toBeGreaterThan(0)
    expect(OPENYURT_DEMO_DATA.autonomousNodes).toBeLessThanOrEqual(
      OPENYURT_DEMO_DATA.totalNodes
    )
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(OPENYURT_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
