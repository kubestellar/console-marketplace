import { describe, expect, it } from 'vitest'

import type { KubeflowDemoData } from './demoData'
import { mapToDisplayItems } from './useDisplayItems'

/**
 * Tests for the pure `mapToDisplayItems` helper in kubeflow_status/useDisplayItems.
 *
 * The source file explicitly documents this function as "kept as a standalone
 * function ... so it can be unit tested without mounting the component", but
 * had no direct tests before this file was added. Each of the four resource
 * arms (pipelineRuns, experiments, notebooks, trainingJobs) has independent
 * branching that we exercise here.
 */

const t = ((key: string) => key) as unknown as Parameters<typeof mapToDisplayItems>[1]

function makeData(overrides: Partial<KubeflowDemoData> = {}): KubeflowDemoData {
  return {
    pipelineRuns: [],
    experiments: [],
    notebooks: [],
    trainingJobs: [],
    totalPipelines: 0,
    totalActiveRuns: 0,
    totalExperiments: 0,
    overallSuccessRate: 0,
    lastCheckTime: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('kubeflow_status/mapToDisplayItems', () => {
  it('returns an empty list when every input array is empty', () => {
    expect(mapToDisplayItems(makeData(), t)).toEqual([])
  })

  describe('pipelineRuns arm', () => {
    it('formats numeric metrics < 1 as percentages with one decimal', () => {
      const items = mapToDisplayItems(
        makeData({
          pipelineRuns: [
            {
              id: 'run-1',
              name: 'nightly-train',
              pipelineName: 'training-pipeline',
              experiment: 'exp-A',
              namespace: 'kubeflow',
              cluster: 'east',
              status: 'succeeded',
              createdAt: '2026-01-01T00:00:00Z',
              finishedAt: '2026-01-01T00:05:00Z',
              durationSeconds: 300,
              metrics: { accuracy: 0.9421, loss: 0.03 },
            },
          ],
        }),
        t,
      )

      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        id: 'run-1',
        name: 'nightly-train',
        category: 'pipeline',
        status: 'succeeded',
        primaryDetail: 'training-pipeline',
        secondaryDetail: 'accuracy: 94.2%, loss: 3.0%',
        timestamp: '2026-01-01T00:00:00Z',
      })
    })

    it('renders numeric metrics >= 1 verbatim (no percent conversion)', () => {
      const [item] = mapToDisplayItems(
        makeData({
          pipelineRuns: [
            {
              id: 'run-2',
              name: 'eval',
              pipelineName: 'eval-pipeline',
              experiment: 'exp-B',
              namespace: 'kubeflow',
              cluster: 'east',
              status: 'succeeded',
              createdAt: '2026-01-01T00:00:00Z',
              finishedAt: '2026-01-01T00:05:00Z',
              durationSeconds: 300,
              metrics: { epochs: 12, samples: 50000 },
            },
          ],
        }),
        t,
      )

      expect(item.secondaryDetail).toBe('epochs: 12, samples: 50000')
    })

    it('falls back to the experiment name when the metrics object is empty', () => {
      const [item] = mapToDisplayItems(
        makeData({
          pipelineRuns: [
            {
              id: 'run-3',
              name: 'no-metrics',
              pipelineName: 'plain-pipeline',
              experiment: 'fallback-experiment',
              namespace: 'kubeflow',
              cluster: 'west',
              status: 'pending',
              createdAt: '2026-01-02T00:00:00Z',
              finishedAt: null,
              durationSeconds: null,
              metrics: {},
            },
          ],
        }),
        t,
      )

      expect(item.secondaryDetail).toBe('fallback-experiment')
    })
  })

  describe('experiments arm', () => {
    function experiment(overrides: Partial<KubeflowDemoData['experiments'][number]> = {}) {
      return {
        id: 'exp-1',
        name: 'exp',
        namespace: 'kubeflow',
        cluster: 'east',
        description: 'demo experiment',
        totalRuns: 100,
        succeededRuns: 80,
        failedRuns: 5,
        activeRuns: 0,
        lastRunAt: '2026-01-01T00:00:00Z',
        ...overrides,
      }
    }

    it('marks experiments with active runs as "active" regardless of failures', () => {
      const [item] = mapToDisplayItems(
        makeData({ experiments: [experiment({ activeRuns: 3, failedRuns: 50 })] }),
        t,
      )
      expect(item.status).toBe('active')
    })

    it('marks experiments as "degraded" when failures exceed 10% of total runs and no active runs', () => {
      const [item] = mapToDisplayItems(
        makeData({
          experiments: [
            experiment({ totalRuns: 100, failedRuns: 11, activeRuns: 0 }),
          ],
        }),
        t,
      )
      expect(item.status).toBe('degraded')
    })

    it('marks experiments at exactly the 10% failure threshold as "healthy" (strict greater-than boundary)', () => {
      const [item] = mapToDisplayItems(
        makeData({
          experiments: [
            experiment({ totalRuns: 100, failedRuns: 10, activeRuns: 0 }),
          ],
        }),
        t,
      )
      expect(item.status).toBe('healthy')
    })

    it('renders succeededRuns/totalRuns and localised "passed" label in primaryDetail', () => {
      const [item] = mapToDisplayItems(
        makeData({
          experiments: [experiment({ succeededRuns: 42, totalRuns: 50 })],
        }),
        t,
      )
      expect(item.primaryDetail).toBe('42/50 kubeflowStatus.passed')
      expect(item.category).toBe('experiment')
    })
  })

  describe('notebooks arm', () => {
    function notebook(overrides: Partial<KubeflowDemoData['notebooks'][number]> = {}) {
      return {
        name: 'nb-1',
        namespace: 'user-a',
        cluster: 'east',
        serverType: 'jupyter' as const,
        image: 'gcr.io/kubeflow/notebook:v1.7',
        status: 'running' as const,
        cpu: '2',
        memory: '4Gi',
        gpu: 0,
        createdAt: '2026-01-01T00:00:00Z',
        lastActivity: '2026-01-01T01:00:00Z',
        ...overrides,
      }
    }

    it('omits the GPU suffix when gpu === 0', () => {
      const [item] = mapToDisplayItems(makeData({ notebooks: [notebook()] }), t)
      expect(item.primaryDetail).toBe(
        'jupyter \u2022 2 kubeflowStatus.cpu, 4Gi',
      )
    })

    it('appends ", <n> <gpu-label>" when gpu > 0', () => {
      const [item] = mapToDisplayItems(
        makeData({ notebooks: [notebook({ gpu: 2 })] }),
        t,
      )
      expect(item.primaryDetail).toBe(
        'jupyter \u2022 2 kubeflowStatus.cpu, 4Gi, 2 kubeflowStatus.gpu',
      )
    })

    it('uses the trailing path segment of the image for secondaryDetail', () => {
      const [item] = mapToDisplayItems(
        makeData({ notebooks: [notebook({ image: 'gcr.io/kf/notebook:v2' })] }),
        t,
      )
      expect(item.secondaryDetail).toBe('notebook:v2')
    })

    it('falls back to the raw image when it contains no slashes', () => {
      const [item] = mapToDisplayItems(
        makeData({ notebooks: [notebook({ image: 'localimg' })] }),
        t,
      )
      expect(item.secondaryDetail).toBe('localimg')
    })

    it('prefixes the id with "nb-"', () => {
      const [item] = mapToDisplayItems(
        makeData({ notebooks: [notebook({ name: 'analytics' })] }),
        t,
      )
      expect(item.id).toBe('nb-analytics')
    })
  })

  describe('trainingJobs arm', () => {
    function job(overrides: Partial<KubeflowDemoData['trainingJobs'][number]> = {}) {
      return {
        name: 'tj-1',
        namespace: 'ml',
        cluster: 'east',
        framework: 'PyTorchJob' as const,
        status: 'running' as const,
        workers: 4,
        createdAt: '2026-01-01T00:00:00Z',
        completedAt: null,
        durationSeconds: null,
        epoch: 3,
        totalEpochs: 10,
        ...overrides,
      }
    }

    it('renders "epoch N/M" using the localised epoch label when both are set', () => {
      const [item] = mapToDisplayItems(
        makeData({ trainingJobs: [job()] }),
        t,
      )
      expect(item.secondaryDetail).toBe('kubeflowStatus.epoch 3/10')
      expect(item.primaryDetail).toBe(
        'PyTorchJob \u2022 4 kubeflowStatus.workers',
      )
      expect(item.id).toBe('tj-tj-1')
    })

    it('leaves secondaryDetail empty when epoch is null', () => {
      const [item] = mapToDisplayItems(
        makeData({ trainingJobs: [job({ epoch: null })] }),
        t,
      )
      expect(item.secondaryDetail).toBe('')
    })

    it('leaves secondaryDetail empty when totalEpochs is null', () => {
      const [item] = mapToDisplayItems(
        makeData({ trainingJobs: [job({ totalEpochs: null })] }),
        t,
      )
      expect(item.secondaryDetail).toBe('')
    })
  })

  it('emits arms in a stable order: pipelineRuns → experiments → notebooks → trainingJobs', () => {
    const items = mapToDisplayItems(
      makeData({
        pipelineRuns: [
          {
            id: 'run-x',
            name: 'p',
            pipelineName: 'pp',
            experiment: 'e',
            namespace: 'ns',
            cluster: 'c',
            status: 'succeeded',
            createdAt: 't',
            finishedAt: null,
            durationSeconds: null,
            metrics: {},
          },
        ],
        experiments: [
          {
            id: 'exp-x',
            name: 'e',
            namespace: 'ns',
            cluster: 'c',
            description: 'd',
            totalRuns: 1,
            succeededRuns: 1,
            failedRuns: 0,
            activeRuns: 0,
            lastRunAt: 't',
          },
        ],
        notebooks: [
          {
            name: 'nb',
            namespace: 'ns',
            cluster: 'c',
            serverType: 'jupyter',
            image: 'i',
            status: 'running',
            cpu: '1',
            memory: '1Gi',
            gpu: 0,
            createdAt: 't',
            lastActivity: 't',
          },
        ],
        trainingJobs: [
          {
            name: 'tj',
            namespace: 'ns',
            cluster: 'c',
            framework: 'PyTorchJob',
            status: 'running',
            workers: 1,
            createdAt: 't',
            completedAt: null,
            durationSeconds: null,
            epoch: null,
            totalEpochs: null,
          },
        ],
      }),
      t,
    )
    expect(items.map(i => i.category)).toEqual([
      'pipeline',
      'experiment',
      'notebook',
      'training',
    ])
  })
})
