import { describe, expect, it } from 'vitest'
import { OPENKRUISE_DEMO_DATA } from './demoData'

describe('OPENKRUISE_DEMO_DATA', () => {
  it('contains CloneSets with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.cloneSets.length).toBeGreaterThan(0)

    const validStatuses = ['healthy', 'updating', 'degraded', 'failed']
    const validStrategies = ['ReCreate', 'InPlaceIfPossible', 'InPlaceOnly']
    for (const cs of OPENKRUISE_DEMO_DATA.cloneSets) {
      expect(cs.name).toBeTruthy()
      expect(cs.namespace).toBeTruthy()
      expect(cs.cluster).toBeTruthy()
      expect(typeof cs.replicas).toBe('number')
      expect(typeof cs.readyReplicas).toBe('number')
      expect(validStatuses).toContain(cs.status)
      expect(validStrategies).toContain(cs.updateStrategy)
      expect(cs.image).toBeTruthy()
      expect(new Date(cs.updatedAt).toString()).not.toBe('Invalid Date')
    }
  })

  it('contains Advanced StatefulSets with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.advancedStatefulSets.length).toBeGreaterThan(0)

    for (const ss of OPENKRUISE_DEMO_DATA.advancedStatefulSets) {
      expect(ss.name).toBeTruthy()
      expect(ss.namespace).toBeTruthy()
      expect(ss.cluster).toBeTruthy()
      expect(typeof ss.replicas).toBe('number')
      expect(typeof ss.readyReplicas).toBe('number')
      expect(['healthy', 'updating', 'degraded', 'failed']).toContain(ss.status)
      expect(['RollingUpdate', 'InPlaceIfPossible', 'InPlaceOnly']).toContain(ss.updateStrategy)
    }
  })

  it('contains Advanced DaemonSets with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.advancedDaemonSets.length).toBeGreaterThan(0)

    for (const ds of OPENKRUISE_DEMO_DATA.advancedDaemonSets) {
      expect(ds.name).toBeTruthy()
      expect(ds.namespace).toBeTruthy()
      expect(ds.cluster).toBeTruthy()
      expect(typeof ds.desiredNumber).toBe('number')
      expect(typeof ds.readyNumber).toBe('number')
      expect(['healthy', 'updating', 'degraded', 'failed']).toContain(ds.status)
    }
  })

  it('contains SidecarSets with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.sidecarSets.length).toBeGreaterThan(0)

    for (const ss of OPENKRUISE_DEMO_DATA.sidecarSets) {
      expect(ss.name).toBeTruthy()
      expect(ss.namespace).toBeTruthy()
      expect(ss.cluster).toBeTruthy()
      expect(typeof ss.matchedPods).toBe('number')
      expect(typeof ss.injectedPods).toBe('number')
      expect(typeof ss.readyPods).toBe('number')
      expect(['healthy', 'updating', 'degraded']).toContain(ss.status)
    }
  })

  it('contains BroadcastJobs with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.broadcastJobs.length).toBeGreaterThan(0)

    for (const bj of OPENKRUISE_DEMO_DATA.broadcastJobs) {
      expect(bj.name).toBeTruthy()
      expect(bj.namespace).toBeTruthy()
      expect(bj.cluster).toBeTruthy()
      expect(typeof bj.desiredNodes).toBe('number')
      expect(typeof bj.succeededNodes).toBe('number')
      expect(typeof bj.failedNodes).toBe('number')
      expect(['completed', 'running', 'failed', 'paused']).toContain(bj.status)
    }
  })

  it('contains AdvancedCronJobs with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.advancedCronJobs.length).toBeGreaterThan(0)

    for (const cj of OPENKRUISE_DEMO_DATA.advancedCronJobs) {
      expect(cj.name).toBeTruthy()
      expect(cj.namespace).toBeTruthy()
      expect(cj.cluster).toBeTruthy()
      expect(cj.schedule).toBeTruthy()
      expect(typeof cj.activeJobs).toBe('number')
      expect(typeof cj.successfulJobs).toBe('number')
      expect(typeof cj.failedJobs).toBe('number')
      expect(['active', 'suspended', 'error']).toContain(cj.status)
    }
  })

  it('has valid aggregate fields', () => {
    expect(OPENKRUISE_DEMO_DATA.controllerVersion).toBeTruthy()
    expect(typeof OPENKRUISE_DEMO_DATA.totalInjectedPods).toBe('number')
    expect(OPENKRUISE_DEMO_DATA.totalInjectedPods).toBeGreaterThan(0)
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(OPENKRUISE_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
