import { describe, expect, it } from 'vitest'
import { KUBEFLOW_DEMO_DATA } from './demoData'

describe('KUBEFLOW_DEMO_DATA', () => {
  it('contains pipeline runs with required fields', () => {
    expect(KUBEFLOW_DEMO_DATA.pipelineRuns.length).toBeGreaterThan(0)

    const validStatuses = ['succeeded', 'failed', 'running', 'pending', 'skipped', 'error']
    for (const run of KUBEFLOW_DEMO_DATA.pipelineRuns) {
      expect(run.id).toBeTruthy()
      expect(run.name).toBeTruthy()
      expect(run.pipelineName).toBeTruthy()
      expect(run.experiment).toBeTruthy()
      expect(run.namespace).toBeTruthy()
      expect(run.cluster).toBeTruthy()
      expect(validStatuses).toContain(run.status)
      expect(new Date(run.createdAt).toString()).not.toBe('Invalid Date')
      expect(typeof run.metrics).toBe('object')
    }
  })

  it('contains experiments with required fields', () => {
    expect(KUBEFLOW_DEMO_DATA.experiments.length).toBeGreaterThan(0)

    for (const exp of KUBEFLOW_DEMO_DATA.experiments) {
      expect(exp.id).toBeTruthy()
      expect(exp.name).toBeTruthy()
      expect(exp.namespace).toBeTruthy()
      expect(exp.cluster).toBeTruthy()
      expect(typeof exp.totalRuns).toBe('number')
      expect(typeof exp.succeededRuns).toBe('number')
      expect(typeof exp.failedRuns).toBe('number')
      expect(typeof exp.activeRuns).toBe('number')
      expect(new Date(exp.lastRunAt).toString()).not.toBe('Invalid Date')
    }
  })

  it('contains notebooks with required fields', () => {
    expect(KUBEFLOW_DEMO_DATA.notebooks.length).toBeGreaterThan(0)

    const validServerTypes = ['jupyter', 'rstudio', 'vscode']
    const validStatuses = ['running', 'stopped', 'pending', 'terminating', 'error']
    for (const nb of KUBEFLOW_DEMO_DATA.notebooks) {
      expect(nb.name).toBeTruthy()
      expect(nb.namespace).toBeTruthy()
      expect(nb.cluster).toBeTruthy()
      expect(validServerTypes).toContain(nb.serverType)
      expect(validStatuses).toContain(nb.status)
      expect(nb.image).toBeTruthy()
      expect(nb.cpu).toBeTruthy()
      expect(nb.memory).toBeTruthy()
      expect(typeof nb.gpu).toBe('number')
    }
  })

  it('contains training jobs with required fields', () => {
    expect(KUBEFLOW_DEMO_DATA.trainingJobs.length).toBeGreaterThan(0)

    for (const job of KUBEFLOW_DEMO_DATA.trainingJobs) {
      expect(job.name).toBeTruthy()
      expect(job.namespace).toBeTruthy()
      expect(job.cluster).toBeTruthy()
      expect(job.framework).toBeTruthy()
    }
  })

  it('has valid aggregate fields', () => {
    expect(typeof KUBEFLOW_DEMO_DATA.totalPipelines).toBe('number')
    expect(typeof KUBEFLOW_DEMO_DATA.totalActiveRuns).toBe('number')
    expect(typeof KUBEFLOW_DEMO_DATA.totalExperiments).toBe('number')
    expect(typeof KUBEFLOW_DEMO_DATA.overallSuccessRate).toBe('number')
    expect(KUBEFLOW_DEMO_DATA.overallSuccessRate).toBeGreaterThanOrEqual(0)
    expect(KUBEFLOW_DEMO_DATA.overallSuccessRate).toBeLessThanOrEqual(1)
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(KUBEFLOW_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
