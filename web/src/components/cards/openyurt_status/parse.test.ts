// Direct unit tests for the pure helpers in ./parse.ts.
//
// The existing useOpenYurtStatus.*-parse-branches.test.tsx suites exercise
// these functions indirectly via renderHook + mocked fetch/cache, which is
// valuable for the hook's fetch orchestration but a heavy way to drive
// pure-function branches: a bug in parseGateway surfaces as a fetch
// regression rather than a parse regression, and every case pays the cost
// of stubbing useCache + authFetch + global fetch.
//
// These direct tests import parse.ts's exports without mocks, so:
//   - a failure names the pure function that broke, not the hook wrapper;
//   - branch coverage on parseNodePool / parseGateway / isPodReady /
//     isOpenYurtControllerPod / appendClusterParam is attributed to
//     parse.ts (not useOpenYurtStatus.ts), which the v8 provider reports
//     per-file so per-file regressions become visible.
//
// Cases below deliberately mirror the branches already covered by the
// hook-level tests so removing this file would not lose real coverage —
// the redundancy is intentional isolation.

import { describe, it, expect } from 'vitest'

import {
  appendClusterParam,
  isOpenYurtControllerPod,
  isPodReady,
  parseGateway,
  parseNodePool,
  KNOWN_POOL_TYPES,
  type CRItem,
} from './parse'

describe('appendClusterParam', () => {
  it('returns the path unchanged when cluster is undefined', () => {
    expect(appendClusterParam('/api/mcp/pods')).toBe('/api/mcp/pods')
  })

  it('returns the path unchanged when cluster is empty string', () => {
    expect(appendClusterParam('/api/mcp/pods', '')).toBe('/api/mcp/pods')
  })

  it('appends ?cluster=... when the path has no query string', () => {
    expect(appendClusterParam('/api/mcp/pods', 'prod')).toBe(
      '/api/mcp/pods?cluster=prod',
    )
  })

  it('appends &cluster=... when the path already has a query string', () => {
    expect(
      appendClusterParam('/api/mcp/pods?labelSelector=x%3Dy', 'prod'),
    ).toBe('/api/mcp/pods?labelSelector=x%3Dy&cluster=prod')
  })

  it('URL-encodes cluster names containing reserved characters', () => {
    expect(appendClusterParam('/api', 'a/b c')).toBe('/api?cluster=a%2Fb%20c')
  })
})

describe('isOpenYurtControllerPod', () => {
  it('matches app=yurt-manager label', () => {
    expect(isOpenYurtControllerPod({ labels: { app: 'yurt-manager' } })).toBe(true)
  })

  it('matches app.kubernetes.io/name=openyurt label', () => {
    expect(
      isOpenYurtControllerPod({ labels: { 'app.kubernetes.io/name': 'openyurt' } }),
    ).toBe(true)
  })

  it('matches app.kubernetes.io/name=yurt-manager label', () => {
    expect(
      isOpenYurtControllerPod({
        labels: { 'app.kubernetes.io/name': 'yurt-manager' },
      }),
    ).toBe(true)
  })

  it('matches app.kubernetes.io/part-of=openyurt label', () => {
    expect(
      isOpenYurtControllerPod({
        labels: { 'app.kubernetes.io/part-of': 'openyurt' },
      }),
    ).toBe(true)
  })

  it('matches yurt-manager-* pod name prefix', () => {
    expect(isOpenYurtControllerPod({ name: 'yurt-manager-abc123' })).toBe(true)
  })

  it('matches yurt-controller-manager-* pod name prefix', () => {
    expect(isOpenYurtControllerPod({ name: 'yurt-controller-manager-abc' })).toBe(
      true,
    )
  })

  it('matches yurt-hub-* pod name prefix', () => {
    expect(isOpenYurtControllerPod({ name: 'yurt-hub-node1' })).toBe(true)
  })

  it('matches yurt-tunnel-* pod name prefix', () => {
    expect(isOpenYurtControllerPod({ name: 'yurt-tunnel-server-xyz' })).toBe(true)
  })

  it('is case-insensitive on the pod name (upper-case still matches)', () => {
    expect(isOpenYurtControllerPod({ name: 'YURT-HUB-NODE1' })).toBe(true)
  })

  it('rejects an unrelated pod (kube-proxy)', () => {
    expect(isOpenYurtControllerPod({ name: 'kube-proxy-abc', labels: {} })).toBe(
      false,
    )
  })

  it('handles a pod with neither name nor labels', () => {
    expect(isOpenYurtControllerPod({})).toBe(false)
  })
})

describe('isPodReady', () => {
  it('returns true when running and ready is n/n with n > 0', () => {
    expect(isPodReady({ status: 'Running', ready: '2/2' })).toBe(true)
  })

  it('is case-insensitive on status (lowercase running still matches)', () => {
    expect(isPodReady({ status: 'running', ready: '1/1' })).toBe(true)
  })

  it('returns false when status is not Running', () => {
    expect(isPodReady({ status: 'Pending', ready: '1/1' })).toBe(false)
  })

  it('returns false when ready has fewer than 2 slash-separated parts', () => {
    expect(isPodReady({ status: 'Running', ready: '1' })).toBe(false)
  })

  it('returns false when ready has more than 2 slash-separated parts', () => {
    expect(isPodReady({ status: 'Running', ready: '1/1/1' })).toBe(false)
  })

  it('returns false when ready parts do not match (1/2)', () => {
    expect(isPodReady({ status: 'Running', ready: '1/2' })).toBe(false)
  })

  it('returns false when ready is 0/0 (parseInt("0") is not > 0)', () => {
    expect(isPodReady({ status: 'Running', ready: '0/0' })).toBe(false)
  })

  it('returns false when status and ready are both missing', () => {
    expect(isPodReady({})).toBe(false)
  })
})

describe('KNOWN_POOL_TYPES', () => {
  it('contains exactly edge and cloud', () => {
    expect(Array.from(KNOWN_POOL_TYPES).sort()).toEqual(['cloud', 'edge'])
  })
})

describe('parseNodePool', () => {
  const base = (overrides: Partial<CRItem> = {}): CRItem => ({
    name: 'pool-a',
    cluster: 'c1',
    ...overrides,
  })

  it('defaults to edge/not-ready with zero counts when spec and status are empty', () => {
    const np = parseNodePool(base())
    expect(np).toEqual({
      name: 'pool-a',
      type: 'edge',
      status: 'not-ready',
      nodeCount: 0,
      readyNodes: 0,
      autonomyEnabled: true, // edge default
    })
  })

  it('maps spec.type=cloud to type cloud and disables edge-default autonomy', () => {
    const np = parseNodePool(
      base({
        spec: { type: 'cloud' },
        status: { readyNodeNum: 2, unreadyNodeNum: 0 },
      }),
    )
    expect(np.type).toBe('cloud')
    expect(np.autonomyEnabled).toBe(false)
  })

  it('falls back to edge when spec.type is unknown (guards against enum drift)', () => {
    const np = parseNodePool(base({ spec: { type: 'weird' } }))
    expect(np.type).toBe('edge')
  })

  it('reads pool type from apps.openyurt.io/pool-type annotation when spec.type is absent', () => {
    const np = parseNodePool(
      base({ annotations: { 'apps.openyurt.io/pool-type': 'cloud' } }),
    )
    expect(np.type).toBe('cloud')
  })

  it('sums readyNodeNum + unreadyNodeNum for nodeCount when both numeric', () => {
    const np = parseNodePool(
      base({ status: { readyNodeNum: 3, unreadyNodeNum: 2 } }),
    )
    expect(np.nodeCount).toBe(5)
    expect(np.readyNodes).toBe(3)
    expect(np.status).toBe('degraded')
  })

  it('reports status=ready when every node is ready', () => {
    const np = parseNodePool(
      base({ status: { readyNodeNum: 3, unreadyNodeNum: 0 } }),
    )
    expect(np.status).toBe('ready')
  })

  it('falls back to status.nodes when readyNodeNum/unreadyNodeNum are absent', () => {
    const np = parseNodePool(base({ status: { nodes: 4 } }))
    expect(np.nodeCount).toBe(4)
    // readyNodes falls back to nodeCount when readyNodeNum is not a number
    expect(np.readyNodes).toBe(4)
    expect(np.status).toBe('ready')
  })

  it('marks pools with zero ready nodes as not-ready even when nodeCount > 0', () => {
    const np = parseNodePool(
      base({ status: { readyNodeNum: 0, unreadyNodeNum: 3 } }),
    )
    expect(np.nodeCount).toBe(3)
    expect(np.readyNodes).toBe(0)
    expect(np.status).toBe('not-ready')
  })

  it('honors explicit spec.autonomy=true on a cloud pool', () => {
    const np = parseNodePool(
      base({ spec: { type: 'cloud', autonomy: true } }),
    )
    expect(np.autonomyEnabled).toBe(true)
  })

  it('honors node.beta.openyurt.io/autonomy=true annotation on a cloud pool', () => {
    const np = parseNodePool(
      base({
        spec: { type: 'cloud' },
        annotations: { 'node.beta.openyurt.io/autonomy': 'true' },
      }),
    )
    expect(np.autonomyEnabled).toBe(true)
  })
})

describe('parseGateway', () => {
  const base = (overrides: Partial<CRItem> = {}): CRItem => ({
    name: 'gw-a',
    cluster: 'c1',
    ...overrides,
  })

  it('defaults to pending with empty nodePool/endpoint when spec and status are empty', () => {
    expect(parseGateway(base())).toEqual({
      name: 'gw-a',
      nodePool: '',
      status: 'pending',
      endpoint: '',
    })
  })

  it('reads nodePool from spec.nodePool when present', () => {
    expect(parseGateway(base({ spec: { nodePool: 'pool-edge' } })).nodePool).toBe(
      'pool-edge',
    )
  })

  it('falls back to spec.proxyNodePool when spec.nodePool is absent', () => {
    expect(
      parseGateway(base({ spec: { proxyNodePool: 'pool-proxy' } })).nodePool,
    ).toBe('pool-proxy')
  })

  it('falls back to raven.openyurt.io/gateway-node-pool label when spec is silent', () => {
    expect(
      parseGateway(
        base({
          labels: { 'raven.openyurt.io/gateway-node-pool': 'pool-label' },
        }),
      ).nodePool,
    ).toBe('pool-label')
  })

  it('reads endpoint from spec.endpoints[0].publicIP when populated', () => {
    expect(
      parseGateway(base({ spec: { endpoints: [{ publicIP: '1.2.3.4' }] } }))
        .endpoint,
    ).toBe('1.2.3.4')
  })

  it('falls back to spec.endpoint scalar when endpoints[] is empty', () => {
    expect(
      parseGateway(base({ spec: { endpoints: [], endpoint: '5.6.7.8' } }))
        .endpoint,
    ).toBe('5.6.7.8')
  })

  it('emits empty endpoint when endpoints[0].publicIP is missing (nullish coalesce arm)', () => {
    expect(
      parseGateway(base({ spec: { endpoints: [{}] } })).endpoint,
    ).toBe('')
  })

  it('reports connected when status.activeEndpoints is non-empty', () => {
    expect(
      parseGateway(base({ status: { activeEndpoints: ['1.2.3.4'] } })).status,
    ).toBe('connected')
  })

  it('reports connected when status.nodes is non-empty even without activeEndpoints', () => {
    expect(
      parseGateway(base({ status: { nodes: [{ nodeName: 'n1' }] } })).status,
    ).toBe('connected')
  })

  it('maps status.phase=Disconnected to disconnected', () => {
    expect(
      parseGateway(base({ status: { phase: 'Disconnected' } })).status,
    ).toBe('disconnected')
  })

  it('maps status.phase=Failed to disconnected', () => {
    expect(
      parseGateway(base({ status: { phase: 'Failed' } })).status,
    ).toBe('disconnected')
  })

  it('leaves status=pending for unrecognized phases with no endpoints and no nodes', () => {
    expect(
      parseGateway(base({ status: { phase: 'Provisioning' } })).status,
    ).toBe('pending')
  })
})
