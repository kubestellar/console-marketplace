/**
 * Demo data for the Buildpacks status card.
 *
 * Representative of a multi-cluster environment using Cloud Native Buildpacks
 * to build container images. Used when the dashboard is in demo mode or when
 * no Kubernetes clusters are connected.
 */

import { minutesAgoIso } from '../shared/timeOffsets'

export interface BuildpacksDemoImage {
  name: string
  namespace: string
  builder: string
  image: string
  status: 'succeeded' | 'failed' | 'building' | 'unknown'
  updated: string
  cluster: string
}

export interface BuildpacksDemoData {
  images: BuildpacksDemoImage[]
  lastCheckTime: string
}

export const BUILDPACKS_DEMO_DATA: BuildpacksDemoData = {
  images: [
    {
      name: 'frontend-app',
      namespace: 'apps',
      builder: 'paketobuildpacks/builder-jammy-full',
      image: 'registry.io/frontend:v2.1.0',
      status: 'succeeded',
      updated: minutesAgoIso(30),
      cluster: 'eks-prod-us-east-1',
    },
    {
      name: 'payments-api',
      namespace: 'backend',
      builder: 'paketobuildpacks/builder-jammy-full',
      image: 'registry.io/payments:v3.5.0',
      status: 'failed',
      updated: minutesAgoIso(2 * 60),
      cluster: 'gke-staging',
    },
    {
      name: 'auth-service',
      namespace: 'backend',
      builder: 'paketobuildpacks/builder-jammy-base',
      image: 'registry.io/auth:v1.8.3',
      status: 'succeeded',
      updated: minutesAgoIso(45),
      cluster: 'eks-prod-us-east-1',
    },
    {
      name: 'worker-jobs',
      namespace: 'processing',
      builder: 'paketobuildpacks/builder-jammy-full',
      image: 'registry.io/worker:v0.9.1',
      status: 'building',
      updated: minutesAgoIso(5),
      cluster: 'gke-staging',
    },
    {
      name: 'analytics-svc',
      namespace: 'data',
      builder: 'paketobuildpacks/builder-jammy-base',
      image: 'registry.io/analytics:v1.0.0',
      status: 'unknown',
      updated: minutesAgoIso(24 * 60),
      cluster: 'aks-dev-eu',
    },
  ],
  lastCheckTime: minutesAgoIso(2),
}
