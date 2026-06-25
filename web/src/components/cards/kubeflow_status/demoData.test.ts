import { describe, expect, it } from 'vitest'
import { KUBEFLOW_DEMO_DATA } from './demoData'

describe('KUBEFLOW_DEMO_DATA', () => {
  it('contains pipeline runs with required fields and valid status', () => {
    expect(KUBEFLOW_DEMO_DATA.pipelineRuns.length).toBeGreaterThan(0)

    for (const run of KUBEFLOW_DEMO_DATA.pipelineRuns) {
      expect(run.id).toBeTruthy()
      expect(run.name).toBeTruthy()
      expect(run.pipelineName).toBeTruthy()
      expect(run.experiment).toBeTruthy()
      expect(run.namespace).toBeTruthy()
      expect(run.cluster).toBeTruthy()
      expect(['succeeded', 'failed', 'running', 'pending', 'skipped', 'error']).toContain(run.status)
      expect(new Date(run.createdAt).toString()).not.toBe('Invalid Date')
      expect(typeof run.metrics).toBe('object')

      if (run.finishedAt !== null) {
        expect(new Date(run.finishedAt).toString()).not.toBe('Invalid Date')
      }
      if (run.durationSeconds !== null) {
        expect(typeof run.durationSeconds).toBe('number')
        expect(run.durationSeconds).toBeGreaterThan(0)
      }
    }
  })

  it('contains experiments with required fields', () => {
    expect(KUBEFLOW_DEMO_DATA.experiments.length).toBeGreaterThan(0)

    for (const exp of KUBEFLOW_DEMO_DATA.experiments) {
      expect(exp.id).toBeTruthy()
      expect(exp.name).toBeTruthy()
      expect(exp.namespace).toBeTruthy()
      expect(exp.cluster).toBeTruthy()
      expect(exp.description).toBeTruthy()
      expect(typeof exp.totalRuns).toBe('number')
      expect(typeof exp.succeededRuns).toBe('number')
      expect(typeof exp.failedRuns).toBe('number')
      expect(typeof exp.activeRuns).toBe('number')
      expect(new Date(exp.lastRunAt).toString()).not.toBe('Invalid Date')
    }
  })

  it('contains notebooks with required fields and valid status', () => {
    expect(KUBEFLOW_DEMO_DATA.notebooks.length).toBeGreaterThan(0)

    for (const notebook of KUBEFLOW_DEMO_DATA.notebooks) {
      expect(notebook.name).toBeTruthy()
      expect(notebook.namespace).toBeTruthy()
      expect(notebook.cluster).toBeTruthy()
      expect(['jupyter', 'rstudio', 'vscode']).toContain(notebook.serverType)
      expect(['running', 'stopped', 'pending', 'terminating', 'error']).toContain(notebook.status)
      expect(notebook.image).toBeTruthy()
      expect(typeof notebook.cpu).toBe('string')
      expect(typeof notebook.memory).toBe('string')
      expect(typeof notebook.gpu).toBe('number')
      expect(notebook.gpu).toBeGreaterThanOrEqual(0)
      expect(new Date(notebook.createdAt).toString()).not.toBe('Invalid Date')
      expect(new Date(notebook.lastActivity).toString()).not.toBe('Invalid Date')
    }
  })

  it('contains training jobs with required fields and valid framework', () => {
    expect(KUBEFLOW_DEMO_DATA.trainingJobs.length).toBeGreaterThan(0)

    for (const job of KUBEFLOW_DEMO_DATA.trainingJobs) {
      expect(job.name).toBeTruthy()
      expect(job.namespace).toBeTruthy()
      expect(job.cluster).toBeTruthy()
      expect(['PyTorchJob', 'TFJob', 'XGBoostJob', 'MPIJob', 'PaddleJob', 'JAXJob']).toContain(
        job.framework
      )
      expect(['created', 'running', 'succeeded', 'failed', 'restarting', 'suspended']).toContain(
        job.status
      )
      expect(typeof job.workers).toBe('number')
      expect(job.workers).toBeGreaterThan(0)
      expect(new Date(job.createdAt).toString()).not.toBe('Invalid Date')

      if (job.completedAt !== null) {
        expect(new Date(job.completedAt).toString()).not.toBe('Invalid Date')
      }
      if (job.durationSeconds !== null) {
        expect(typeof job.durationSeconds).toBe('number')
        expect(job.durationSeconds).toBeGreaterThan(0)
      }
      if (job.epoch !== null) {
        expect(typeof job.epoch).toBe('number')
        expect(job.epoch).toBeGreaterThanOrEqual(0)
      }
      if (job.totalEpochs !== null) {
        expect(typeof job.totalEpochs).toBe('number')
        expect(job.totalEpochs).toBeGreaterThan(0)
      }
    }
  })

  it('has valid aggregate fields', () => {
    expect(typeof KUBEFLOW_DEMO_DATA.totalPipelines).toBe('number')
    expect(typeof KUBEFLOW_DEMO_DATA.totalActiveRuns).toBe('number')
    expect(typeof KUBEFLOW_DEMO_DATA.totalExperiments).toBe('number')
    expect(typeof KUBEFLOW_DEMO_DATA.overallSuccessRate).toBe('number')
    expect(KUBEFLOW_DEMO_DATA.totalPipelines).toBeGreaterThan(0)
    expect(KUBEFLOW_DEMO_DATA.totalActiveRuns).toBeGreaterThanOrEqual(0)
    expect(KUBEFLOW_DEMO_DATA.totalExperiments).toBeGreaterThan(0)
    expect(KUBEFLOW_DEMO_DATA.overallSuccessRate).toBeGreaterThanOrEqual(0)
    expect(KUBEFLOW_DEMO_DATA.overallSuccessRate).toBeLessThanOrEqual(1)
  })

  it('sets a valid lastCheckTime timestamp', () => {
    expect(new Date(KUBEFLOW_DEMO_DATA.lastCheckTime).toString()).not.toBe('Invalid Date')
  })
})
