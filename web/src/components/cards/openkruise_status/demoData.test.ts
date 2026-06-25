import { describe, expect, it } from 'vitest'
import { OPENKRUISE_DEMO_DATA } from './demoData'

describe('OPENKRUISE_DEMO_DATA', () => {
  it('contains CloneSets with required fields and valid status', () => {
    expect(OPENKRUISE_DEMO_DATA.cloneSets.length).toBeGreaterThan(0)

    for (const cs of OPENKRUISE_DEMO_DATA.cloneSets) {
      expect(cs.name).toBeTruthy()
      expect(cs.namespace).toBeTruthy()
      expect(cs.cluster).toBeTruthy()
      expect(typeof cs.replicas).toBe('number')
      expect(typeof cs.readyReplicas).toBe('number')
      expect(typeof cs.updatedReplicas).toBe('number')
      expect(typeof cs.updatedReadyReplicas).toBe('number')
      expect(['ReCreate', 'InPlaceIfPossible', 'InPlaceOnly']).toContain(cs.updateStrategy)
      expect(typeof cs.partition).toBe('number')
      expect(['healthy', 'updating', 'degraded', 'failed']).toContain(cs.status)
      expect(cs.image).toBeTruthy()
      expect(new Date(cs.updatedAt).toString()).not.toBe('Invalid Date')
      expect(cs.replicas).toBeGreaterThan(0)
      expect(cs.readyReplicas).toBeLessThanOrEqual(cs.replicas)
      expect(cs.partition).toBeGreaterThanOrEqual(0)
    }
  })

  it('contains Advanced StatefulSets with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.advancedStatefulSets.length).toBeGreaterThan(0)

    for (const sts of OPENKRUISE_DEMO_DATA.advancedStatefulSets) {
      expect(sts.name).toBeTruthy()
      expect(sts.namespace).toBeTruthy()
      expect(sts.cluster).toBeTruthy()
      expect(typeof sts.replicas).toBe('number')
      expect(typeof sts.readyReplicas).toBe('number')
      expect(typeof sts.updatedReplicas).toBe('number')
      expect(['OrderedReady', 'Parallel']).toContain(sts.podManagementPolicy)
      expect(['RollingUpdate', 'InPlaceIfPossible', 'InPlaceOnly']).toContain(sts.updateStrategy)
      expect(['healthy', 'updating', 'degraded', 'failed']).toContain(sts.status)
      expect(sts.image).toBeTruthy()
      expect(new Date(sts.updatedAt).toString()).not.toBe('Invalid Date')
      expect(sts.replicas).toBeGreaterThan(0)
      expect(sts.readyReplicas).toBeLessThanOrEqual(sts.replicas)
    }
  })

  it('contains Advanced DaemonSets with required numeric fields', () => {
    expect(OPENKRUISE_DEMO_DATA.advancedDaemonSets.length).toBeGreaterThan(0)

    for (const ds of OPENKRUISE_DEMO_DATA.advancedDaemonSets) {
      expect(ds.name).toBeTruthy()
      expect(ds.namespace).toBeTruthy()
      expect(ds.cluster).toBeTruthy()
      expect(typeof ds.desiredScheduled).toBe('number')
      expect(typeof ds.currentScheduled).toBe('number')
      expect(typeof ds.numberReady).toBe('number')
      expect(typeof ds.updatedScheduled).toBe('number')
      expect(['Standard', 'Surging', 'InPlaceIfPossible']).toContain(ds.rollingUpdateType)
      expect(['healthy', 'updating', 'degraded', 'failed']).toContain(ds.status)
      expect(ds.image).toBeTruthy()
      expect(new Date(ds.updatedAt).toString()).not.toBe('Invalid Date')
      expect(ds.desiredScheduled).toBeGreaterThan(0)
      expect(ds.numberReady).toBeLessThanOrEqual(ds.currentScheduled)
    }
  })

  it('contains SidecarSets with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.sidecarSets.length).toBeGreaterThan(0)

    for (const ss of OPENKRUISE_DEMO_DATA.sidecarSets) {
      expect(ss.name).toBeTruthy()
      expect(ss.cluster).toBeTruthy()
      expect(Array.isArray(ss.sidecarContainers)).toBe(true)
      expect(ss.sidecarContainers.length).toBeGreaterThan(0)
      expect(typeof ss.matchedPods).toBe('number')
      expect(typeof ss.injectedPods).toBe('number')
      expect(typeof ss.updatedPods).toBe('number')
      expect(typeof ss.readyPods).toBe('number')
      expect(['NotUpdate', 'RollingUpdate']).toContain(ss.updateStrategy)
      expect(['healthy', 'updating', 'degraded', 'failed']).toContain(ss.status)
      expect(new Date(ss.updatedAt).toString()).not.toBe('Invalid Date')
      expect(ss.matchedPods).toBeGreaterThanOrEqual(0)
      expect(ss.injectedPods).toBeLessThanOrEqual(ss.matchedPods)
    }
  })

  it('contains BroadcastJobs with required fields and valid status', () => {
    expect(OPENKRUISE_DEMO_DATA.broadcastJobs.length).toBeGreaterThan(0)

    for (const job of OPENKRUISE_DEMO_DATA.broadcastJobs) {
      expect(job.name).toBeTruthy()
      expect(job.namespace).toBeTruthy()
      expect(job.cluster).toBeTruthy()
      expect(['running', 'succeeded', 'failed', 'pending', 'paused']).toContain(job.status)
      expect(['Always', 'Never']).toContain(job.completionPolicyType)
      expect(typeof job.desired).toBe('number')
      expect(typeof job.active).toBe('number')
      expect(typeof job.succeeded).toBe('number')
      expect(typeof job.failed).toBe('number')
      expect(new Date(job.startedAt).toString()).not.toBe('Invalid Date')
      expect(job.desired).toBeGreaterThan(0)
      expect(job.active).toBeGreaterThanOrEqual(0)
      expect(job.succeeded).toBeGreaterThanOrEqual(0)
      expect(job.failed).toBeGreaterThanOrEqual(0)

      if (job.completedAt !== null) {
        expect(new Date(job.completedAt).toString()).not.toBe('Invalid Date')
      }
    }
  })

  it('contains AdvancedCronJobs with required fields', () => {
    expect(OPENKRUISE_DEMO_DATA.advancedCronJobs.length).toBeGreaterThan(0)

    for (const cj of OPENKRUISE_DEMO_DATA.advancedCronJobs) {
      expect(cj.name).toBeTruthy()
      expect(cj.namespace).toBeTruthy()
      expect(cj.cluster).toBeTruthy()
      expect(cj.schedule).toBeTruthy()
      expect(['Job', 'BroadcastJob']).toContain(cj.templateKind)
      expect(['active', 'suspended', 'failed']).toContain(cj.status)
      expect(typeof cj.active).toBe('number')
      expect(typeof cj.successfulRuns).toBe('number')
      expect(typeof cj.failedRuns).toBe('number')
      expect(cj.active).toBeGreaterThanOrEqual(0)
      expect(cj.successfulRuns).toBeGreaterThanOrEqual(0)
      expect(cj.failedRuns).toBeGreaterThanOrEqual(0)

      if (cj.lastScheduleTime !== null) {
        expect(new Date(cj.lastScheduleTime).toString()).not.toBe('Invalid Date')
      }
    }
  })

  it('has valid aggregate fields', () => {
    expect(typeof OPENKRUISE_DEMO_DATA.controllerVersion).toBe('string')
    expect(OPENKRUISE_DEMO_DATA.controllerVersion).toBeTruthy()
    expect(typeof OPENKRUISE_DEMO_DATA.totalInjectedPods).toBe('number')
    expect(OPENKRUISE_DEMO_DATA.totalInjectedPods).toBeGreaterThanOrEqual(0)
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(OPENKRUISE_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
