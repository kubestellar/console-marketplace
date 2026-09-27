// Dedicated unit tests for fetch.ts (see issue #808). Every other module in
// this directory has a `*.test.ts(x)` peer; fetch.ts was only exercised
// transitively through the useOpenYurtStatus.* hook suites. These tests lock
// the module boundary directly: the pod-discovery URLs and fallback, the
// per-resource RBAC error discrimination (`pods` / `nodepools` / `gateways`),
// the `HTTP <status> <statusText>` message format, the response-shape guards,
// the OPENYURT_STATUS_FETCH_SUMMARY console.error record shape documented in
// runbooks/SLO.md, and the health / node-count derivations.
//
// `fetchCR`, `fetchPods`, and `CRFetchError` are module-private, so they are
// asserted through `fetchOpenYurtStatus` via the `authFetch` / global `fetch`
// mock call arguments and the returned `fetchError`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { jsonResponse } from '../../../test/cacheMock'
import { INITIAL_DATA, fetchOpenYurtStatus } from './fetch'
import type { BackendPodInfo, CRItem } from './parse'

const mockAuthFetch = vi.fn()
const mockFetch = vi.fn()

vi.mock('../../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

const LABELED_PODS_PATH = '/api/mcp/pods?labelSelector=app.kubernetes.io%2Fname%3Dyurt-manager'
const UNLABELED_PODS_PATH = '/api/mcp/pods'
const NODEPOOLS_CR_PATH = '/api/mcp/custom-resources?group=apps.openyurt.io&version=v1beta1&resource=nodepools'
const GATEWAYS_CR_PATH = '/api/mcp/custom-resources?group=raven.openyurt.io&version=v1beta1&resource=gateways'
const SUMMARY_TAG = 'OPENYURT_STATUS_FETCH_SUMMARY:'

const readyYurtManagerPod: BackendPodInfo = {
  name: 'yurt-manager-0',
  status: 'Running',
  ready: '1/1',
  labels: { 'app.kubernetes.io/name': 'yurt-manager' },
}

const notReadyYurtManagerPod: BackendPodInfo = {
  name: 'yurt-manager-1',
  status: 'Running',
  ready: '0/1',
  labels: { 'app.kubernetes.io/name': 'yurt-manager' },
}

function nodePoolItem(
  name: string,
  readyNodeNum: number,
  unreadyNodeNum: number,
  spec: Record<string, unknown> = {},
): CRItem {
  return {
    name,
    cluster: 'edge-cluster',
    spec,
    status: { readyNodeNum, unreadyNodeNum },
  }
}

function gatewayItem(name: string): CRItem {
  return {
    name,
    cluster: 'edge-cluster',
    spec: { nodePool: 'pool-a', endpoints: [{ publicIP: '203.0.113.10' }] },
    status: { activeEndpoints: [{ nodeName: 'edge-1' }] },
  }
}

/** Queues a successful labeled-pod discovery response so tests can focus on the CR step. */
function stubLabeledPods(pods: BackendPodInfo[] = [readyYurtManagerPod]): void {
  mockFetch.mockResolvedValueOnce(jsonResponse({ pods }))
}

/** Queues nodepools then gateways CR responses (in the order fetchOpenYurtStatus issues them). */
function stubCRs(nodePools: CRItem[] = [], gateways: CRItem[] = []): void {
  mockAuthFetch
    .mockResolvedValueOnce(jsonResponse({ items: nodePools }))
    .mockResolvedValueOnce(jsonResponse({ items: gateways }))
}

describe('fetch.ts — INITIAL_DATA', () => {
  it('is the not-installed empty shape with a null fetchError', () => {
    expect(INITIAL_DATA).toMatchObject({
      health: 'not-installed',
      controllerPods: { ready: 0, total: 0 },
      nodePools: [],
      gateways: [],
      totalNodes: 0,
      autonomousNodes: 0,
      fetchError: null,
    })
    expect(typeof INITIAL_DATA.lastCheckTime).toBe('string')
  })
})

describe('fetchOpenYurtStatus', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  describe('pod discovery (fetchPods)', () => {
    it('requests the labeled yurt-manager pods with the JSON accept header and a bounded timeout', async () => {
      stubLabeledPods()
      stubCRs()

      await fetchOpenYurtStatus()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(LABELED_PODS_PATH)
      expect(init.headers).toEqual({ Accept: 'application/json' })
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('uses AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) for the pods request', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
      stubLabeledPods()
      stubCRs()

      await fetchOpenYurtStatus()

      expect(timeoutSpy).toHaveBeenCalledWith(FETCH_DEFAULT_TIMEOUT_MS)
      timeoutSpy.mockRestore()
    })

    it('appends the cluster param to the labeled pods path when a cluster is given', async () => {
      stubLabeledPods()
      stubCRs()

      await fetchOpenYurtStatus('edge/cluster 1')

      expect(mockFetch.mock.calls[0][0]).toBe(`${LABELED_PODS_PATH}&cluster=edge%2Fcluster%201`)
    })

    it('uses the labeled result directly (still filtered) when it is non-empty', async () => {
      const unrelatedPod: BackendPodInfo = { name: 'coredns-0', status: 'Running', ready: '1/1' }
      stubLabeledPods([readyYurtManagerPod, unrelatedPod])
      stubCRs()

      const result = await fetchOpenYurtStatus()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.controllerPods).toEqual({ ready: 1, total: 1 })
    })

    it('falls back to the unlabeled pod list filtered through isOpenYurtControllerPod', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ pods: [] }))
        .mockResolvedValueOnce(jsonResponse({
          pods: [
            { name: 'yurt-hub-0', status: 'Running', ready: '1/1' },
            { name: 'yurt-tunnel-0', status: 'Running', ready: '1/1' },
            { name: 'coredns-0', status: 'Running', ready: '1/1' },
          ],
        }))
      stubCRs()

      const result = await fetchOpenYurtStatus('c1')

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][0]).toBe(`${LABELED_PODS_PATH}&cluster=c1`)
      expect(mockFetch.mock.calls[1][0]).toBe(`${UNLABELED_PODS_PATH}?cluster=c1`)
      expect(result.controllerPods).toEqual({ ready: 2, total: 2 })
    })

    it('treats a body without a pods field as an empty list (falls back, then not-installed)', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({}))

      const result = await fetchOpenYurtStatus()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockAuthFetch).not.toHaveBeenCalled()
      expect(result.health).toBe('not-installed')
      expect(result.fetchError).toBeNull()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('treats a non-array pods field as an empty list', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ pods: 'not-an-array' }))
        .mockResolvedValueOnce(jsonResponse({ pods: { name: 'yurt-manager-0' } }))

      const result = await fetchOpenYurtStatus()

      expect(result.health).toBe('not-installed')
      expect(result.controllerPods).toEqual({ ready: 0, total: 0 })
    })

    it('returns not-installed without touching CRs when no controller pods match', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ pods: [] }))
        .mockResolvedValueOnce(jsonResponse({ pods: [{ name: 'coredns-0', status: 'Running', ready: '1/1' }] }))

      const result = await fetchOpenYurtStatus()

      expect(mockAuthFetch).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        health: 'not-installed',
        controllerPods: { ready: 0, total: 0 },
        nodePools: [],
        gateways: [],
        fetchError: null,
      })
    })

    it('maps a non-OK pods response to an HTTP <status> <statusText> pods fetchError and logs the summary record', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 403, statusText: 'Forbidden' }))

      const result = await fetchOpenYurtStatus()

      expect(mockAuthFetch).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        health: 'not-installed',
        controllerPods: INITIAL_DATA.controllerPods,
        nodePools: [],
        gateways: [],
        totalNodes: 0,
        autonomousNodes: 0,
        fetchError: { resource: 'pods', message: 'HTTP 403 Forbidden' },
      })
      expect(Date.parse(result.lastCheckTime)).not.toBeNaN()
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(SUMMARY_TAG, {
        resource: 'pods',
        status: 'failed',
        reason: 'HTTP 403 Forbidden',
      })
    })

    it('surfaces a rejected pods fetch (network/timeout) as a pods fetchError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({
        resource: 'pods',
        message: 'The operation was aborted due to timeout',
      })
      expect(consoleErrorSpy).toHaveBeenCalledWith(SUMMARY_TAG, {
        resource: 'pods',
        status: 'failed',
        reason: 'The operation was aborted due to timeout',
      })
    })

    it('stringifies a non-Error rejection reason for the pods fetchError', async () => {
      mockFetch.mockRejectedValueOnce('socket hang up')

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({ resource: 'pods', message: 'socket hang up' })
      expect(consoleErrorSpy).toHaveBeenCalledWith(SUMMARY_TAG, {
        resource: 'pods',
        status: 'failed',
        reason: 'socket hang up',
      })
    })

    it('surfaces a failure in the unlabeled fallback request as a pods fetchError', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ pods: [] }))
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500, statusText: 'Internal Server Error' }))

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({ resource: 'pods', message: 'HTTP 500 Internal Server Error' })
    })
  })

  describe('custom resource fetch (fetchCR)', () => {
    it('requests nodepools and gateways through authFetch with the expected URLs, headers, and timeout', async () => {
      stubLabeledPods()
      stubCRs()

      await fetchOpenYurtStatus()

      expect(mockAuthFetch).toHaveBeenCalledTimes(2)
      const [nodePoolUrl, nodePoolInit] = mockAuthFetch.mock.calls[0] as [string, RequestInit]
      const [gatewayUrl, gatewayInit] = mockAuthFetch.mock.calls[1] as [string, RequestInit]
      expect(nodePoolUrl).toBe(NODEPOOLS_CR_PATH)
      expect(gatewayUrl).toBe(GATEWAYS_CR_PATH)
      for (const init of [nodePoolInit, gatewayInit]) {
        expect(init.headers).toEqual({ Accept: 'application/json' })
        expect(init.signal).toBeInstanceOf(AbortSignal)
      }
    })

    it('appends the cluster param to both CR paths when a cluster is given', async () => {
      stubLabeledPods()
      stubCRs()

      await fetchOpenYurtStatus('prod-east')

      expect(mockAuthFetch.mock.calls[0][0]).toBe(`${NODEPOOLS_CR_PATH}&cluster=prod-east`)
      expect(mockAuthFetch.mock.calls[1][0]).toBe(`${GATEWAYS_CR_PATH}&cluster=prod-east`)
    })

    it('treats a CR body without items as an empty list', async () => {
      stubLabeledPods()
      mockAuthFetch
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({ isDemoData: false }))

      const result = await fetchOpenYurtStatus()

      expect(result.nodePools).toEqual([])
      expect(result.gateways).toEqual([])
      expect(result.fetchError).toBeNull()
      expect(result.health).toBe('healthy')
    })

    it('maps a non-OK nodepools response to an HTTP <status> <statusText> nodepools fetchError', async () => {
      stubLabeledPods()
      mockAuthFetch
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 403, statusText: 'Forbidden' }))
        .mockResolvedValueOnce(jsonResponse({ items: [gatewayItem('gw-a')] }))

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({ resource: 'nodepools', message: 'HTTP 403 Forbidden' })
      expect(result.nodePools).toEqual([])
      expect(result.gateways).toHaveLength(1)
      expect(result.gateways[0].name).toBe('gw-a')
    })

    it('maps a non-OK gateways response to an HTTP <status> <statusText> gateways fetchError', async () => {
      stubLabeledPods()
      mockAuthFetch
        .mockResolvedValueOnce(jsonResponse({ items: [nodePoolItem('pool-a', 3, 0)] }))
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' }))

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({ resource: 'gateways', message: 'HTTP 404 Not Found' })
      expect(result.gateways).toEqual([])
      expect(result.nodePools).toHaveLength(1)
      expect(result.nodePools[0].name).toBe('pool-a')
    })
  })

  describe('Promise.allSettled RBAC discrimination', () => {
    it('reports nodepools when only nodepools rejects and keeps gateways populated', async () => {
      stubLabeledPods()
      mockAuthFetch
        .mockRejectedValueOnce(new Error('nodepools.apps.openyurt.io is forbidden'))
        .mockResolvedValueOnce(jsonResponse({ items: [gatewayItem('gw-a')] }))

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({
        resource: 'nodepools',
        message: 'nodepools.apps.openyurt.io is forbidden',
      })
      expect(result.gateways.map(g => g.name)).toEqual(['gw-a'])
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(SUMMARY_TAG, {
        resource: 'nodepools',
        status: 'failed',
        reason: 'nodepools.apps.openyurt.io is forbidden',
      })
    })

    it('reports gateways when only gateways rejects and keeps nodePools populated', async () => {
      stubLabeledPods()
      mockAuthFetch
        .mockResolvedValueOnce(jsonResponse({ items: [nodePoolItem('pool-a', 2, 0)] }))
        .mockRejectedValueOnce(new Error('gateways.raven.openyurt.io is forbidden'))

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({
        resource: 'gateways',
        message: 'gateways.raven.openyurt.io is forbidden',
      })
      expect(result.nodePools.map(np => np.name)).toEqual(['pool-a'])
      expect(result.totalNodes).toBe(2)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(SUMMARY_TAG, {
        resource: 'gateways',
        status: 'failed',
        reason: 'gateways.raven.openyurt.io is forbidden',
      })
    })

    it('reports nodepools (precedence) and logs exactly once when both CR fetches reject', async () => {
      stubLabeledPods()
      mockAuthFetch
        .mockRejectedValueOnce(new Error('HTTP 403 Forbidden'))
        .mockRejectedValueOnce(new Error('HTTP 401 Unauthorized'))

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({ resource: 'nodepools', message: 'HTTP 403 Forbidden' })
      expect(result.nodePools).toEqual([])
      expect(result.gateways).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(SUMMARY_TAG, {
        resource: 'nodepools',
        status: 'failed',
        reason: 'HTTP 403 Forbidden',
      })
    })

    it('stringifies non-Error CR rejection reasons', async () => {
      stubLabeledPods()
      mockAuthFetch
        .mockResolvedValueOnce(jsonResponse({ items: [] }))
        .mockRejectedValueOnce({ code: 'ECONNRESET' })

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toEqual({ resource: 'gateways', message: '[object Object]' })
    })

    it('does not log or set fetchError when both CR fetches succeed', async () => {
      stubLabeledPods()
      stubCRs([nodePoolItem('pool-a', 1, 0)], [gatewayItem('gw-a')])

      const result = await fetchOpenYurtStatus()

      expect(result.fetchError).toBeNull()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('OPENYURT_STATUS_FETCH_SUMMARY record contract', () => {
    it('emits exactly the {resource, status, reason} keys and never the response body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(
        { secret: 'do-not-log' },
        { ok: false, status: 500, statusText: 'Internal Server Error' },
      ))

      await fetchOpenYurtStatus()

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const [tag, record] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>]
      expect(tag).toBe(SUMMARY_TAG)
      expect(Object.keys(record).sort()).toEqual(['reason', 'resource', 'status'])
      expect(record.status).toBe('failed')
      expect(JSON.stringify(record)).not.toContain('do-not-log')
    })
  })

  describe('health and node-count derivation', () => {
    it('is healthy when all controller pods are ready and every pool is ready', async () => {
      stubLabeledPods([readyYurtManagerPod])
      stubCRs([nodePoolItem('pool-a', 3, 0), nodePoolItem('pool-b', 2, 0)], [gatewayItem('gw-a')])

      const result = await fetchOpenYurtStatus()

      expect(result.health).toBe('healthy')
      expect(result.controllerPods).toEqual({ ready: 1, total: 1 })
      expect(result.nodePools.every(np => np.status === 'ready')).toBe(true)
      expect(result.gateways).toHaveLength(1)
    })

    it('is healthy with zero node pools when all pods are ready', async () => {
      stubLabeledPods([readyYurtManagerPod])
      stubCRs([], [])

      const result = await fetchOpenYurtStatus()

      expect(result.health).toBe('healthy')
      expect(result.totalNodes).toBe(0)
      expect(result.autonomousNodes).toBe(0)
    })

    it('is degraded when any controller pod is not ready', async () => {
      stubLabeledPods([readyYurtManagerPod, notReadyYurtManagerPod])
      stubCRs([nodePoolItem('pool-a', 3, 0)], [])

      const result = await fetchOpenYurtStatus()

      expect(result.health).toBe('degraded')
      expect(result.controllerPods).toEqual({ ready: 1, total: 2 })
    })

    it('is degraded when any pool is not ready even if all pods are ready', async () => {
      stubLabeledPods([readyYurtManagerPod])
      stubCRs([nodePoolItem('pool-a', 3, 0), nodePoolItem('pool-b', 1, 2)], [])

      const result = await fetchOpenYurtStatus()

      expect(result.health).toBe('degraded')
      expect(result.nodePools.map(np => np.status)).toEqual(['ready', 'degraded'])
    })

    it('sums totalNodes over all pools and autonomousNodes only over autonomy-enabled pools', async () => {
      stubLabeledPods([readyYurtManagerPod])
      stubCRs([
        // edge pools are autonomy-enabled by default
        nodePoolItem('edge-a', 3, 0, { type: 'edge' }),
        // cloud pool without autonomy
        nodePoolItem('cloud-a', 4, 0, { type: 'cloud' }),
        // cloud pool with explicit autonomy
        nodePoolItem('cloud-b', 2, 0, { type: 'cloud', autonomy: true }),
      ], [])

      const result = await fetchOpenYurtStatus()

      expect(result.nodePools.map(np => np.autonomyEnabled)).toEqual([true, false, true])
      expect(result.totalNodes).toBe(9)
      expect(result.autonomousNodes).toBe(5)
    })

    it('stamps a fresh ISO lastCheckTime on the returned status', async () => {
      stubLabeledPods()
      stubCRs()

      const before = Date.now()
      const result = await fetchOpenYurtStatus()

      expect(Date.parse(result.lastCheckTime)).toBeGreaterThanOrEqual(before)
    })
  })
})
