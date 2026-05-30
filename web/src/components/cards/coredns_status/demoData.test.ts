import { describe, expect, it } from 'vitest'
import { COREDNS_DEMO_DATA } from './demoData'

describe('COREDNS_DEMO_DATA', () => {
  it('contains servers with required fields and valid status', () => {
    expect(COREDNS_DEMO_DATA.servers.length).toBeGreaterThan(0)

    for (const server of COREDNS_DEMO_DATA.servers) {
      expect(server.name).toBeTruthy()
      expect(server.namespace).toBeTruthy()
      expect(server.cluster).toBeTruthy()
      expect(server.version).toBeTruthy()
      expect(server.uptime).toBeTruthy()
      expect(['running', 'degraded', 'down', 'unknown']).toContain(server.status)
      expect(typeof server.queriesPerSecond).toBe('number')
      expect(typeof server.cacheHitRate).toBe('number')
      expect(typeof server.upstreamLatencyMs).toBe('number')
      expect(typeof server.errorRate).toBe('number')
      expect(server.cacheHitRate).toBeGreaterThanOrEqual(0)
      expect(server.cacheHitRate).toBeLessThanOrEqual(1)
    }
  })

  it('contains zones with required numeric fields', () => {
    expect(COREDNS_DEMO_DATA.zones.length).toBeGreaterThan(0)

    for (const zone of COREDNS_DEMO_DATA.zones) {
      expect(zone.zone).toBeTruthy()
      expect(typeof zone.queryCount).toBe('number')
      expect(typeof zone.nxdomainCount).toBe('number')
      expect(typeof zone.servfailCount).toBe('number')
      expect(typeof zone.avgLatencyMs).toBe('number')
      expect(zone.queryCount).toBeGreaterThan(0)
      expect(zone.avgLatencyMs).toBeGreaterThan(0)
    }
  })

  it('has valid aggregate fields', () => {
    expect(typeof COREDNS_DEMO_DATA.totalQueries).toBe('number')
    expect(typeof COREDNS_DEMO_DATA.overallCacheHitRate).toBe('number')
    expect(COREDNS_DEMO_DATA.totalQueries).toBeGreaterThan(0)
    expect(COREDNS_DEMO_DATA.overallCacheHitRate).toBeGreaterThanOrEqual(0)
    expect(COREDNS_DEMO_DATA.overallCacheHitRate).toBeLessThanOrEqual(1)
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(COREDNS_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
