/**
 * Demo data for the Kubeflow status card.
 *
 * Representative of a multi-cluster environment running Kubeflow for ML
 * pipeline orchestration, experiment tracking, notebook serving, and
 * distributed training. Includes pipeline runs, experiments, notebooks,
 * and training jobs across clusters. Used when the dashboard is in demo
 * mode or when no Kubernetes clusters are connected.
 */

/** Time offsets (in milliseconds) used for relative timestamps. */
const ONE_MINUTE_MS = 60 * 1000
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const THREE_HOURS_MS = 3 * ONE_HOUR_MS
const SIX_HOURS_MS = 6 * ONE_HOUR_MS
const TWELVE_HOURS_MS = 12 * ONE_HOUR_MS
const ONE_DAY_MS = 24 * ONE_HOUR_MS

/* ------------------------------------------------------------------ */
/*  Pipeline Runs                                                      */
/* ------------------------------------------------------------------ */

export interface KubeflowDemoPipelineRun {
  id: string
  name: string
  pipelineName: string
  experiment: string
  namespace: string
  cluster: string
  status: 'succeeded' | 'failed' | 'running' | 'pending' | 'skipped' | 'error'
  createdAt: string
  finishedAt: string | null
  durationSeconds: number | null
  metrics: Record<string, number>
}

/* ------------------------------------------------------------------ */
/*  Experiments                                                        */
/* ------------------------------------------------------------------ */

export interface KubeflowDemoExperiment {
  id: string
  name: string
  namespace: string
  cluster: string
  description: string
  totalRuns: number
  succeededRuns: number
  failedRuns: number
  activeRuns: number
  lastRunAt: string
}

/* ------------------------------------------------------------------ */
/*  Notebooks                                                          */
/* ------------------------------------------------------------------ */

export interface KubeflowDemoNotebook {
  name: string
  namespace: string
  cluster: string
  serverType: 'jupyter' | 'rstudio' | 'vscode'
  image: string
  status: 'running' | 'stopped' | 'pending' | 'terminating' | 'error'
  cpu: string
  memory: string
  gpu: number
  createdAt: string
  lastActivity: string
}

/* ------------------------------------------------------------------ */
/*  Training Jobs                                                      */
/* ------------------------------------------------------------------ */

export interface KubeflowDemoTrainingJob {
  name: string
  namespace: string
  cluster: string
  framework: 'PyTorchJob' | 'TFJob' | 'XGBoostJob' | 'MPIJob' | 'PaddleJob' | 'JAXJob'
  status: 'created' | 'running' | 'succeeded' | 'failed' | 'restarting' | 'suspended'
  workers: number
  createdAt: string
  completedAt: string | null
  durationSeconds: number | null
  epoch: number | null
  totalEpochs: number | null
}

/* ------------------------------------------------------------------ */
/*  Top-level demo data shape                                          */
/* ------------------------------------------------------------------ */

export interface KubeflowDemoData {
  pipelineRuns: KubeflowDemoPipelineRun[]
  experiments: KubeflowDemoExperiment[]
  notebooks: KubeflowDemoNotebook[]
  trainingJobs: KubeflowDemoTrainingJob[]
  totalPipelines: number
  totalActiveRuns: number
  totalExperiments: number
  overallSuccessRate: number
  lastCheckTime: string
}

/* ================================================================== */
/*  Demo data                                                          */
/* ================================================================== */

export const KUBEFLOW_DEMO_DATA: KubeflowDemoData = {
  /* ----- Pipeline Runs ------------------------------------------- */
  pipelineRuns: [
    {
      id: 'run-a1b2c3d4',
      name: 'train-fraud-detector-v3',
      pipelineName: 'fraud-detection-pipeline',
      experiment: 'fraud-detection-prod',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      status: 'succeeded',
      createdAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
      finishedAt: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
      durationSeconds: 7200,
      metrics: { accuracy: 0.964, f1Score: 0.951, aucRoc: 0.983 },
    },
    {
      id: 'run-e5f6g7h8',
      name: 'retrain-recommender-weekly',
      pipelineName: 'recommendation-pipeline',
      experiment: 'recommender-weekly',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      status: 'running',
      createdAt: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(),
      finishedAt: null,
      durationSeconds: null,
      metrics: {},
    },
    {
      id: 'run-i9j0k1l2',
      name: 'preprocess-customer-churn',
      pipelineName: 'churn-prediction-pipeline',
      experiment: 'churn-analysis',
      namespace: 'kubeflow-staging',
      cluster: 'gke-staging',
      status: 'failed',
      createdAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
      finishedAt: new Date(Date.now() - FIVE_MINUTES_MS * 50).toISOString(),
      durationSeconds: 1843,
      metrics: {},
    },
    {
      id: 'run-m3n4o5p6',
      name: 'nlp-sentiment-batch',
      pipelineName: 'sentiment-analysis-pipeline',
      experiment: 'nlp-experiments',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      status: 'succeeded',
      createdAt: new Date(Date.now() - TWELVE_HOURS_MS).toISOString(),
      finishedAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
      durationSeconds: 21600,
      metrics: { accuracy: 0.891, f1Score: 0.874 },
    },
    {
      id: 'run-q7r8s9t0',
      name: 'image-classification-eval',
      pipelineName: 'vision-pipeline',
      experiment: 'computer-vision-dev',
      namespace: 'kubeflow-dev',
      cluster: 'aks-dev-eu',
      status: 'pending',
      createdAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
      finishedAt: null,
      durationSeconds: null,
      metrics: {},
    },
    {
      id: 'run-u1v2w3x4',
      name: 'feature-engineering-daily',
      pipelineName: 'feature-store-pipeline',
      experiment: 'feature-engineering',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      status: 'succeeded',
      createdAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
      finishedAt: new Date(Date.now() - TWELVE_HOURS_MS).toISOString(),
      durationSeconds: 43200,
      metrics: { featuresGenerated: 342, dataPointsProcessed: 2_450_000 },
    },
    {
      id: 'run-y5z6a7b8',
      name: 'anomaly-detection-retrain',
      pipelineName: 'anomaly-pipeline',
      experiment: 'anomaly-detection-prod',
      namespace: 'kubeflow-prod',
      cluster: 'gke-staging',
      status: 'error',
      createdAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
      finishedAt: new Date(Date.now() - THREE_HOURS_MS + FIVE_MINUTES_MS).toISOString(),
      durationSeconds: 300,
      metrics: {},
    },
  ],

  /* ----- Experiments --------------------------------------------- */
  experiments: [
    {
      id: 'exp-001',
      name: 'fraud-detection-prod',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      description: 'Production fraud detection model training and evaluation',
      totalRuns: 142,
      succeededRuns: 131,
      failedRuns: 8,
      activeRuns: 3,
      lastRunAt: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
    },
    {
      id: 'exp-002',
      name: 'recommender-weekly',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      description: 'Weekly recommendation model retraining pipeline',
      totalRuns: 52,
      succeededRuns: 49,
      failedRuns: 3,
      activeRuns: 1,
      lastRunAt: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(),
    },
    {
      id: 'exp-003',
      name: 'churn-analysis',
      namespace: 'kubeflow-staging',
      cluster: 'gke-staging',
      description: 'Customer churn prediction experiments',
      totalRuns: 87,
      succeededRuns: 72,
      failedRuns: 15,
      activeRuns: 0,
      lastRunAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
    },
    {
      id: 'exp-004',
      name: 'nlp-experiments',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      description: 'NLP sentiment analysis and text classification',
      totalRuns: 214,
      succeededRuns: 198,
      failedRuns: 12,
      activeRuns: 4,
      lastRunAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
    },
    {
      id: 'exp-005',
      name: 'computer-vision-dev',
      namespace: 'kubeflow-dev',
      cluster: 'aks-dev-eu',
      description: 'Image classification and object detection development',
      totalRuns: 34,
      succeededRuns: 28,
      failedRuns: 4,
      activeRuns: 2,
      lastRunAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
    },
  ],

  /* ----- Notebooks ----------------------------------------------- */
  notebooks: [
    {
      name: 'fraud-research-notebook',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      serverType: 'jupyter',
      image: 'kubeflownotebookswg/jupyter-scipy:v1.9.0',
      status: 'running',
      cpu: '4',
      memory: '16Gi',
      gpu: 1,
      createdAt: new Date(Date.now() - 7 * ONE_DAY_MS).toISOString(),
      lastActivity: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(),
    },
    {
      name: 'nlp-exploration',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      serverType: 'jupyter',
      image: 'kubeflownotebookswg/jupyter-pytorch-full:v1.9.0',
      status: 'running',
      cpu: '8',
      memory: '32Gi',
      gpu: 2,
      createdAt: new Date(Date.now() - 3 * ONE_DAY_MS).toISOString(),
      lastActivity: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
    },
    {
      name: 'data-analysis-rstudio',
      namespace: 'kubeflow-staging',
      cluster: 'gke-staging',
      serverType: 'rstudio',
      image: 'kubeflownotebookswg/rstudio-tidyverse:v1.9.0',
      status: 'stopped',
      cpu: '2',
      memory: '8Gi',
      gpu: 0,
      createdAt: new Date(Date.now() - 14 * ONE_DAY_MS).toISOString(),
      lastActivity: new Date(Date.now() - 2 * ONE_DAY_MS).toISOString(),
    },
    {
      name: 'model-debugging',
      namespace: 'kubeflow-dev',
      cluster: 'aks-dev-eu',
      serverType: 'vscode',
      image: 'kubeflownotebookswg/codeserver-python:v1.9.0',
      status: 'running',
      cpu: '4',
      memory: '16Gi',
      gpu: 1,
      createdAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
      lastActivity: new Date(Date.now() - ONE_MINUTE_MS).toISOString(),
    },
    {
      name: 'feature-prototyping',
      namespace: 'kubeflow-dev',
      cluster: 'aks-dev-eu',
      serverType: 'jupyter',
      image: 'kubeflownotebookswg/jupyter-tensorflow-full:v1.9.0',
      status: 'pending',
      cpu: '4',
      memory: '16Gi',
      gpu: 1,
      createdAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
      lastActivity: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
    },
  ],

  /* ----- Training Jobs ------------------------------------------- */
  trainingJobs: [
    {
      name: 'fraud-detector-distributed',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      framework: 'PyTorchJob',
      status: 'running',
      workers: 4,
      createdAt: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
      completedAt: null,
      durationSeconds: null,
      epoch: 18,
      totalEpochs: 50,
    },
    {
      name: 'recommender-xgb-train',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      framework: 'XGBoostJob',
      status: 'succeeded',
      workers: 2,
      createdAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
      completedAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
      durationSeconds: 10800,
      epoch: 200,
      totalEpochs: 200,
    },
    {
      name: 'image-classifier-tf',
      namespace: 'kubeflow-staging',
      cluster: 'gke-staging',
      framework: 'TFJob',
      status: 'failed',
      workers: 8,
      createdAt: new Date(Date.now() - TWELVE_HOURS_MS).toISOString(),
      completedAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
      durationSeconds: 21600,
      epoch: 34,
      totalEpochs: 100,
    },
    {
      name: 'llm-finetune-distributed',
      namespace: 'kubeflow-prod',
      cluster: 'eks-prod-us-east-1',
      framework: 'PyTorchJob',
      status: 'running',
      workers: 16,
      createdAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
      completedAt: null,
      durationSeconds: null,
      epoch: 3,
      totalEpochs: 10,
    },
    {
      name: 'tabular-paddle-train',
      namespace: 'kubeflow-dev',
      cluster: 'aks-dev-eu',
      framework: 'PaddleJob',
      status: 'created',
      workers: 2,
      createdAt: new Date(Date.now() - ONE_MINUTE_MS).toISOString(),
      completedAt: null,
      durationSeconds: null,
      epoch: null,
      totalEpochs: 75,
    },
    {
      name: 'physics-sim-mpi',
      namespace: 'kubeflow-staging',
      cluster: 'gke-staging',
      framework: 'MPIJob',
      status: 'suspended',
      workers: 32,
      createdAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
      completedAt: null,
      durationSeconds: null,
      epoch: 12,
      totalEpochs: 500,
    },
  ],

  /* ----- Aggregate metrics --------------------------------------- */
  totalPipelines: 23,
  totalActiveRuns: 5,
  totalExperiments: 12,
  overallSuccessRate: 0.907,
  lastCheckTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
}
