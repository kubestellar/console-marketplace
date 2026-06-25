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
      expect(cluster.signedImages).toBeGreaterThanOrEqual(0)
      expect(cluster.unsignedImages).toBeGreaterThanOrEqual(0)
    }
  })

  it('contains trust policies with required fields and valid verification mode', () => {
    const allPolicies = NOTARY_DEMO_DATA.clusters.flatMap((c) => c.trustPolicies)
    expect(allPolicies.length).toBeGreaterThan(0)

    for (const policy of allPolicies) {
      expect(policy.name).toBeTruthy()
      expect(Array.isArray(policy.registryScopes)).toBe(true)
      expect(policy.registryScopes.length).toBeGreaterThan(0)
      expect(['strict', 'permissive', 'audit']).toContain(policy.signatureVerification)

      for (const scope of policy.registryScopes) {
        expect(scope).toBeTruthy()
      }
    }
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(NOTARY_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
