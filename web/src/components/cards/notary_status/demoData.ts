/**
 * Demo data for the Notary container image signing status card.
 *
 * Representative of a multi-cluster environment using Notary (notation) to
 * sign and verify container images. Includes trust policy configurations and
 * per-cluster signature counts. Used when the dashboard is in demo mode or
 * when no Kubernetes clusters are connected.
 */

export interface NotaryDemoTrustPolicy {
  name: string
  registryScopes: string[]
  signatureVerification: 'strict' | 'permissive' | 'audit'
}

export interface NotaryDemoClusterStatus {
  cluster: string
  installed: boolean
  signedImages: number
  unsignedImages: number
  trustPolicies: NotaryDemoTrustPolicy[]
}

export interface NotaryDemoData {
  clusters: NotaryDemoClusterStatus[]
  lastCheckTime: string
}

export const NOTARY_DEMO_DATA: NotaryDemoData = {
  clusters: [
    {
      cluster: 'eks-prod-us-east-1',
      installed: true,
      signedImages: 42,
      unsignedImages: 3,
      trustPolicies: [
        {
          name: 'prod-policy',
          registryScopes: ['registry.io/prod/*'],
          signatureVerification: 'strict',
        },
        {
          name: 'base-images',
          registryScopes: ['registry.io/base/*'],
          signatureVerification: 'permissive',
        },
      ],
    },
    {
      cluster: 'gke-staging',
      installed: true,
      signedImages: 18,
      unsignedImages: 7,
      trustPolicies: [
        {
          name: 'staging-policy',
          registryScopes: ['registry.io/staging/*'],
          signatureVerification: 'audit',
        },
      ],
    },
    {
      cluster: 'aks-dev-eu',
      installed: false,
      signedImages: 0,
      unsignedImages: 0,
      trustPolicies: [],
    },
  ],
  lastCheckTime: new Date(Date.now() - 4 * 60 * 1000).toISOString(), // 4 minutes ago
}
