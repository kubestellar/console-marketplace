import { describe, expect, it } from 'vitest'

import { COREDNS_DEMO_DATA } from './coredns_status/demoData'
import { KUBEFLOW_DEMO_DATA } from './kubeflow_status/demoData'
import { NOTARY_DEMO_DATA } from './notary_status/demoData'
import { OPENKRUISE_DEMO_DATA } from './openkruise_status/demoData'
import { OPENYURT_DEMO_DATA } from './openyurt_status/demoData'

function expectStringFields(record: Record<string, unknown>, fields: readonly string[]) {
  for (const field of fields) {
    expect(record[field]).toEqual(expect.any(String))
  }
}

describe('card demo data shapes', () => {
  it('includes the required CoreDNS server and zone fields', () => {
    expect(COREDNS_DEMO_DATA.servers.length).toBeGreaterThan(0)
    expect(COREDNS_DEMO_DATA.zones.length).toBeGreaterThan(0)
    expectStringFields(COREDNS_DEMO_DATA.servers[0] as Record<string, unknown>, [
      'name',
      'namespace',
      'cluster',
      'version',
      'status',
      'uptime',
    ])
    expect(COREDNS_DEMO_DATA.servers[0]).toMatchObject({
      queriesPerSecond: expect.any(Number),
      cacheHitRate: expect.any(Number),
      upstreamLatencyMs: expect.any(Number),
      errorRate: expect.any(Number),
    })
    expectStringFields(COREDNS_DEMO_DATA.zones[0] as Record<string, unknown>, ['zone'])
    expect(COREDNS_DEMO_DATA.zones[0]).toMatchObject({
      queryCount: expect.any(Number),
      nxdomainCount: expect.any(Number),
      servfailCount: expect.any(Number),
      avgLatencyMs: expect.any(Number),
    })
    expect(COREDNS_DEMO_DATA.totalQueries).toEqual(expect.any(Number))
    expect(COREDNS_DEMO_DATA.overallCacheHitRate).toEqual(expect.any(Number))
    expect(COREDNS_DEMO_DATA.lastCheckTime).toEqual(expect.any(String))
  })

  it('includes the required Kubeflow demo sections and field types', () => {
    expect(KUBEFLOW_DEMO_DATA.pipelineRuns.length).toBeGreaterThan(0)
    expect(KUBEFLOW_DEMO_DATA.experiments.length).toBeGreaterThan(0)
    expect(KUBEFLOW_DEMO_DATA.notebooks.length).toBeGreaterThan(0)
    expect(KUBEFLOW_DEMO_DATA.trainingJobs.length).toBeGreaterThan(0)
    expectStringFields(KUBEFLOW_DEMO_DATA.pipelineRuns[0] as Record<string, unknown>, [
      'id',
      'name',
      'pipelineName',
      'experiment',
      'namespace',
      'cluster',
      'status',
      'createdAt',
    ])
    expect(KUBEFLOW_DEMO_DATA.pipelineRuns[0]?.metrics).toEqual(expect.any(Object))
    expect(KUBEFLOW_DEMO_DATA.trainingJobs[0]).toMatchObject({
      workers: expect.any(Number),
    })
    expect(KUBEFLOW_DEMO_DATA.overallSuccessRate).toEqual(expect.any(Number))
    expect(KUBEFLOW_DEMO_DATA.lastCheckTime).toEqual(expect.any(String))
  })

  it('includes the required Notary cluster and trust policy fields', () => {
    expect(NOTARY_DEMO_DATA.clusters.length).toBeGreaterThan(0)
    expectStringFields(NOTARY_DEMO_DATA.clusters[0] as Record<string, unknown>, ['cluster'])
    expect(NOTARY_DEMO_DATA.clusters[0]).toMatchObject({
      installed: expect.any(Boolean),
      signedImages: expect.any(Number),
      unsignedImages: expect.any(Number),
    })
    expect(NOTARY_DEMO_DATA.clusters[0]?.trustPolicies).toEqual(expect.any(Array))
    expectStringFields((NOTARY_DEMO_DATA.clusters[0]?.trustPolicies[0] ?? {}) as Record<string, unknown>, [
      'name',
      'signatureVerification',
    ])
    expect(NOTARY_DEMO_DATA.lastCheckTime).toEqual(expect.any(String))
  })

  it('includes the required OpenKruise resource sections and item fields', () => {
    expect(OPENKRUISE_DEMO_DATA.cloneSets.length).toBeGreaterThan(0)
    expect(OPENKRUISE_DEMO_DATA.advancedStatefulSets.length).toBeGreaterThan(0)
    expect(OPENKRUISE_DEMO_DATA.advancedDaemonSets.length).toBeGreaterThan(0)
    expect(OPENKRUISE_DEMO_DATA.sidecarSets.length).toBeGreaterThan(0)
    expect(OPENKRUISE_DEMO_DATA.broadcastJobs.length).toBeGreaterThan(0)
    expect(OPENKRUISE_DEMO_DATA.advancedCronJobs.length).toBeGreaterThan(0)
    expectStringFields(OPENKRUISE_DEMO_DATA.cloneSets[0] as Record<string, unknown>, [
      'name',
      'namespace',
      'cluster',
      'updateStrategy',
      'status',
      'image',
      'updatedAt',
    ])
    expect(OPENKRUISE_DEMO_DATA.cloneSets[0]).toMatchObject({
      replicas: expect.any(Number),
      readyReplicas: expect.any(Number),
    })
    expectStringFields(OPENKRUISE_DEMO_DATA.sidecarSets[0] as Record<string, unknown>, [
      'name',
      'cluster',
      'updateStrategy',
      'status',
      'updatedAt',
    ])
    expect(OPENKRUISE_DEMO_DATA.totalInjectedPods).toEqual(expect.any(Number))
    expect(OPENKRUISE_DEMO_DATA.lastCheckTime).toEqual(expect.any(String))
  })

  it('includes the required OpenYurt controller, node pool, and gateway fields', () => {
    expect(OPENYURT_DEMO_DATA.health).toEqual(expect.any(String))
    expect(OPENYURT_DEMO_DATA.nodePools.length).toBeGreaterThan(0)
    expect(OPENYURT_DEMO_DATA.gateways.length).toBeGreaterThan(0)
    expect(OPENYURT_DEMO_DATA.controllerPods).toMatchObject({
      ready: expect.any(Number),
      total: expect.any(Number),
    })
    expectStringFields(OPENYURT_DEMO_DATA.nodePools[0] as Record<string, unknown>, [
      'name',
      'type',
      'status',
    ])
    expect(OPENYURT_DEMO_DATA.nodePools[0]).toMatchObject({
      nodeCount: expect.any(Number),
      readyNodes: expect.any(Number),
      autonomyEnabled: expect.any(Boolean),
    })
    expectStringFields(OPENYURT_DEMO_DATA.gateways[0] as Record<string, unknown>, [
      'name',
      'nodePool',
      'status',
      'endpoint',
    ])
    expect(OPENYURT_DEMO_DATA.lastCheckTime).toEqual(expect.any(String))
  })
})
