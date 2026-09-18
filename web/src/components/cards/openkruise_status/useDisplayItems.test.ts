import { describe, expect, it } from 'vitest'

import type { OpenKruiseStatus } from './useOpenKruiseStatus'
import { mapToDisplayItems } from './useDisplayItems'

/**
 * Tests for the pure `mapToDisplayItems` helper in openkruise_status/useDisplayItems.
 *
 * The source file explicitly documents this function as "kept as a standalone
 * function ... so it can be unit tested without mounting the component", but
 * had no direct tests before this file was added. Each of the six resource
 * arms (cloneSets, advancedStatefulSets, advancedDaemonSets, sidecarSets,
 * broadcastJobs, advancedCronJobs) has independent branching that is exercised
 * here — including the partition, image-fallback, sidecarContainers, and
 * timestamp-fallback branches.
 */

const t = ((key: string) => key) as unknown as Parameters<typeof mapToDisplayItems>[1]

function makeData(overrides: Partial<OpenKruiseStatus> = {}): OpenKruiseStatus {
  return {
    cloneSets: [],
    advancedStatefulSets: [],
    advancedDaemonSets: [],
    sidecarSets: [],
    broadcastJobs: [],
    advancedCronJobs: [],
    controllerVersion: '',
    totalInjectedPods: 0,
    lastCheckTime: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('openkruise_status/mapToDisplayItems', () => {
  it('returns an empty list when every input array is empty', () => {
    expect(mapToDisplayItems(makeData(), t)).toEqual([])
  })

  describe('cloneSets arm', () => {
    function cs(overrides: Partial<OpenKruiseStatus['cloneSets'][number]> = {}) {
      return {
        name: 'cs-a',
        namespace: 'default',
        cluster: 'east',
        replicas: 5,
        readyReplicas: 5,
        updatedReplicas: 5,
        updatedReadyReplicas: 5,
        updateStrategy: 'InPlaceIfPossible' as const,
        partition: 0,
        status: 'healthy' as const,
        image: 'gcr.io/example/app:v1',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
      }
    }

    it('composes the id as cs-<cluster>-<namespace>-<name>', () => {
      const [item] = mapToDisplayItems(makeData({ cloneSets: [cs()] }), t)
      expect(item.id).toBe('cs-east-default-cs-a')
      expect(item.category).toBe('cloneset')
    })

    it('omits the partition suffix when partition === 0', () => {
      const [item] = mapToDisplayItems(makeData({ cloneSets: [cs()] }), t)
      expect(item.primaryDetail).toBe(
        '5/5 openkruiseStatus.ready \u2022 InPlaceIfPossible',
      )
    })

    it('appends the localised partition suffix when partition > 0', () => {
      const [item] = mapToDisplayItems(
        makeData({ cloneSets: [cs({ partition: 2 })] }),
        t,
      )
      expect(item.primaryDetail).toBe(
        '5/5 openkruiseStatus.ready \u2022 InPlaceIfPossible, openkruiseStatus.partition 2',
      )
    })

    it('renders the trailing image path segment in secondaryDetail', () => {
      const [item] = mapToDisplayItems(
        makeData({ cloneSets: [cs({ image: 'registry.io/team/app:v9' })] }),
        t,
      )
      expect(item.secondaryDetail).toBe('app:v9')
    })

    it('falls back to the raw image when it contains no slashes', () => {
      const [item] = mapToDisplayItems(
        makeData({ cloneSets: [cs({ image: 'bareimg' })] }),
        t,
      )
      expect(item.secondaryDetail).toBe('bareimg')
    })
  })

  describe('advancedStatefulSets arm', () => {
    it('renders "N/M ready • <podManagementPolicy> • <updateStrategy>" and prefixes id with ss-', () => {
      const [item] = mapToDisplayItems(
        makeData({
          advancedStatefulSets: [
            {
              name: 'ss-a',
              namespace: 'db',
              cluster: 'east',
              replicas: 3,
              readyReplicas: 2,
              updatedReplicas: 2,
              podManagementPolicy: 'Parallel',
              updateStrategy: 'RollingUpdate',
              status: 'updating',
              image: 'gcr.io/example/db:v3',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        }),
        t,
      )
      expect(item.id).toBe('ss-east-db-ss-a')
      expect(item.category).toBe('statefulset')
      expect(item.primaryDetail).toBe(
        '2/3 openkruiseStatus.ready \u2022 Parallel \u2022 RollingUpdate',
      )
      expect(item.secondaryDetail).toBe('db:v3')
    })
  })

  describe('advancedDaemonSets arm', () => {
    it('renders "<numberReady>/<desiredScheduled> nodes • <rollingUpdateType>" and prefixes id with ds-', () => {
      const [item] = mapToDisplayItems(
        makeData({
          advancedDaemonSets: [
            {
              name: 'ds-a',
              namespace: 'system',
              cluster: 'west',
              desiredScheduled: 4,
              currentScheduled: 4,
              numberReady: 3,
              updatedScheduled: 4,
              rollingUpdateType: 'Surging',
              status: 'updating',
              image: 'gcr.io/example/agent:v2',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        }),
        t,
      )
      expect(item.id).toBe('ds-west-system-ds-a')
      expect(item.category).toBe('daemonset')
      expect(item.primaryDetail).toBe(
        '3/4 openkruiseStatus.nodes \u2022 Surging',
      )
      expect(item.secondaryDetail).toBe('agent:v2')
    })
  })

  describe('sidecarSets arm', () => {
    function sc(overrides: Partial<OpenKruiseStatus['sidecarSets'][number]> = {}) {
      return {
        name: 'sc-a',
        cluster: 'east',
        selectorLabels: {},
        namespaceSelector: null,
        sidecarContainers: ['sidecar-a', 'sidecar-b'],
        matchedPods: 10,
        injectedPods: 8,
        updatedPods: 8,
        readyPods: 7,
        updateStrategy: 'RollingUpdate' as const,
        status: 'healthy' as const,
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
      }
    }

    it('uses "-" as the namespace (sidecarSets are cluster-scoped)', () => {
      const [item] = mapToDisplayItems(makeData({ sidecarSets: [sc()] }), t)
      expect(item.namespace).toBe('-')
      expect(item.id).toBe('sc-east-sc-a')
      expect(item.category).toBe('sidecarset')
    })

    it('joins sidecarContainers with ", " in secondaryDetail', () => {
      const [item] = mapToDisplayItems(makeData({ sidecarSets: [sc()] }), t)
      expect(item.secondaryDetail).toBe(
        'openkruiseStatus.containers: sidecar-a, sidecar-b',
      )
    })

    it('renders an empty container list when sidecarContainers is missing (null-safe fallback)', () => {
      const [item] = mapToDisplayItems(
        makeData({
          sidecarSets: [
            sc({ sidecarContainers: undefined as unknown as string[] }),
          ],
        }),
        t,
      )
      expect(item.secondaryDetail).toBe('openkruiseStatus.containers: ')
    })

    it('renders injected/matched and ready counts with localised labels in primaryDetail', () => {
      const [item] = mapToDisplayItems(makeData({ sidecarSets: [sc()] }), t)
      expect(item.primaryDetail).toBe(
        '8/10 openkruiseStatus.injected \u2022 7 openkruiseStatus.ready',
      )
    })
  })

  describe('broadcastJobs arm', () => {
    function bj(overrides: Partial<OpenKruiseStatus['broadcastJobs'][number]> = {}) {
      return {
        name: 'bj-a',
        namespace: 'jobs',
        cluster: 'east',
        desired: 5,
        active: 1,
        succeeded: 3,
        failed: 1,
        completionPolicyType: 'Always' as const,
        status: 'running' as const,
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:30:00Z',
        ...overrides,
      }
    }

    it('uses completedAt as timestamp when present, and prefixes id with bj-', () => {
      const [item] = mapToDisplayItems(makeData({ broadcastJobs: [bj()] }), t)
      expect(item.id).toBe('bj-east-jobs-bj-a')
      expect(item.category).toBe('broadcastjob')
      expect(item.timestamp).toBe('2026-01-01T00:30:00Z')
    })

    it('falls back to startedAt as timestamp when completedAt is null', () => {
      const [item] = mapToDisplayItems(
        makeData({ broadcastJobs: [bj({ completedAt: null })] }),
        t,
      )
      expect(item.timestamp).toBe('2026-01-01T00:00:00Z')
    })

    it('renders succeeded/desired, active, failed with localised labels', () => {
      const [item] = mapToDisplayItems(makeData({ broadcastJobs: [bj()] }), t)
      expect(item.primaryDetail).toBe(
        '3/5 openkruiseStatus.succeeded \u2022 1 openkruiseStatus.active \u2022 1 common:common.failed',
      )
      expect(item.secondaryDetail).toBe(
        'openkruiseStatus.completionPolicy: Always',
      )
    })
  })

  describe('advancedCronJobs arm', () => {
    function cj(overrides: Partial<OpenKruiseStatus['advancedCronJobs'][number]> = {}) {
      return {
        name: 'cj-a',
        namespace: 'ops',
        cluster: 'east',
        schedule: '*/5 * * * *',
        templateKind: 'Job' as const,
        active: 0,
        lastScheduleTime: '2026-01-01T00:10:00Z',
        status: 'active' as const,
        successfulRuns: 12,
        failedRuns: 1,
        ...overrides,
      }
    }

    it('uses lastScheduleTime as the timestamp when it is set', () => {
      const [item] = mapToDisplayItems(makeData({ advancedCronJobs: [cj()] }), t)
      expect(item.id).toBe('cj-east-ops-cj-a')
      expect(item.category).toBe('cronjob')
      expect(item.timestamp).toBe('2026-01-01T00:10:00Z')
    })

    it('falls back to rawData.lastCheckTime as timestamp when lastScheduleTime is null', () => {
      const data = makeData({
        advancedCronJobs: [cj({ lastScheduleTime: null })],
        lastCheckTime: '2026-05-01T00:00:00Z',
      })
      const [item] = mapToDisplayItems(data, t)
      expect(item.timestamp).toBe('2026-05-01T00:00:00Z')
    })

    it('renders "<schedule> • <templateKind> • <active> active" in primaryDetail', () => {
      const [item] = mapToDisplayItems(makeData({ advancedCronJobs: [cj()] }), t)
      expect(item.primaryDetail).toBe(
        '*/5 * * * * \u2022 Job \u2022 0 openkruiseStatus.active',
      )
      expect(item.secondaryDetail).toBe(
        '12 openkruiseStatus.runs, 1 common:common.failed',
      )
    })
  })

  it('emits arms in a stable order: cloneSets → statefulSets → daemonSets → sidecarSets → broadcastJobs → cronJobs', () => {
    const items = mapToDisplayItems(
      makeData({
        cloneSets: [
          {
            name: 'cs',
            namespace: 'n',
            cluster: 'c',
            replicas: 1,
            readyReplicas: 1,
            updatedReplicas: 1,
            updatedReadyReplicas: 1,
            updateStrategy: 'ReCreate',
            partition: 0,
            status: 'healthy',
            image: 'i',
            updatedAt: 't',
          },
        ],
        advancedStatefulSets: [
          {
            name: 'ss',
            namespace: 'n',
            cluster: 'c',
            replicas: 1,
            readyReplicas: 1,
            updatedReplicas: 1,
            podManagementPolicy: 'OrderedReady',
            updateStrategy: 'RollingUpdate',
            status: 'healthy',
            image: 'i',
            updatedAt: 't',
          },
        ],
        advancedDaemonSets: [
          {
            name: 'ds',
            namespace: 'n',
            cluster: 'c',
            desiredScheduled: 1,
            currentScheduled: 1,
            numberReady: 1,
            updatedScheduled: 1,
            rollingUpdateType: 'Standard',
            status: 'healthy',
            image: 'i',
            updatedAt: 't',
          },
        ],
        sidecarSets: [
          {
            name: 'sc',
            cluster: 'c',
            selectorLabels: {},
            namespaceSelector: null,
            sidecarContainers: [],
            matchedPods: 0,
            injectedPods: 0,
            updatedPods: 0,
            readyPods: 0,
            updateStrategy: 'NotUpdate',
            status: 'healthy',
            updatedAt: 't',
          },
        ],
        broadcastJobs: [
          {
            name: 'bj',
            namespace: 'n',
            cluster: 'c',
            desired: 0,
            active: 0,
            succeeded: 0,
            failed: 0,
            completionPolicyType: 'Never',
            status: 'pending',
            startedAt: 't',
            completedAt: null,
          },
        ],
        advancedCronJobs: [
          {
            name: 'cj',
            namespace: 'n',
            cluster: 'c',
            schedule: '* * * * *',
            templateKind: 'Job',
            active: 0,
            lastScheduleTime: null,
            status: 'active',
            successfulRuns: 0,
            failedRuns: 0,
          },
        ],
      }),
      t,
    )
    expect(items.map(i => i.category)).toEqual([
      'cloneset',
      'statefulset',
      'daemonset',
      'sidecarset',
      'broadcastjob',
      'cronjob',
    ])
  })
})
