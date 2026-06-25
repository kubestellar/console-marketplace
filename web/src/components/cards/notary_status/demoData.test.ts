import { describe, expect, it } from 'vitest'
import { NOTARY_DEMO_DATA } from './demoData'

describe('NOTARY_DEMO_DATA', () => {
  it('contains clusters with required fields', () => {
    expect(NOTARY_DEMO_DATA.clusters.length).toBeGreaterThan(0)

    for (const cluster of NOTARY_DEMO_DATA.clusters) {
      expect(cluster.cluster).toBeTruthy()
      expect(typeof cluster.installed).toBe('boolean')
      expect(typeof cluster.signedImages).toBe('number')
      expect(typeof cluster.unsignedImages).toBe('number')
      expect(Array.isArray(cluster.trustPolicies)).toBe(true)
    }
  })

  it('trust policies have valid signature verification levels', () => {
    const validLevels = ['strict', 'permissive', 'audit']
    for (const cluster of NOTARY_DEMO_DATA.clusters) {
      for (const policy of cluster.trustPolicies) {
        expect(policy.name).toBeTruthy()
        expect(Array.isArray(policy.registryScopes)).toBe(true)
        expect(policy.registryScopes.length).toBeGreaterThan(0)
        expect(validLevels).toContain(policy.signatureVerification)
      }
    }
  })

  it('includes at least one installed and one not-installed cluster', () => {
    const installed = NOTARY_DEMO_DATA.clusters.filter(c => c.installed)
    const notInstalled = NOTARY_DEMO_DATA.clusters.filter(c => !c.installed)
    expect(installed.length).toBeGreaterThan(0)
    expect(notInstalled.length).toBeGreaterThan(0)
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(NOTARY_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
