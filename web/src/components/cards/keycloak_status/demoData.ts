/**
 * Demo data for the Keycloak identity and access management status card.
 *
 * Matches the shape expected by the console's useKeycloakStatus hook.
 * Used when the dashboard is in demo mode or no clusters are connected.
 */

export type KeycloakRealmStatus = 'ready' | 'provisioning' | 'degraded' | 'error'

export interface KeycloakRealm {
  name: string
  namespace: string
  status: KeycloakRealmStatus
  enabled: boolean
  clients: number
  users: number
  activeSessions: number
}

export interface KeycloakDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  operatorPods: { ready: number; total: number }
  realms: KeycloakRealm[]
  totalClients: number
  totalUsers: number
  totalActiveSessions: number
  lastCheckTime: string
}

export const KEYCLOAK_DEMO_DATA: KeycloakDemoData = {
  health: 'degraded', // 1/2 operator pods ready
  operatorPods: { ready: 1, total: 2 },
  realms: [
    {
      name: 'master',
      namespace: 'keycloak',
      status: 'ready',
      enabled: true,
      clients: 12,
      users: 48,
      activeSessions: 21,
    },
    {
      name: 'platform',
      namespace: 'keycloak',
      status: 'ready',
      enabled: true,
      clients: 24,
      users: 2840,
      activeSessions: 312,
    },
    {
      name: 'staging',
      namespace: 'keycloak-staging',
      status: 'degraded',
      enabled: true,
      clients: 8,
      users: 142,
      activeSessions: 0,
    },
    {
      name: 'dev-sandbox',
      namespace: 'keycloak-dev',
      status: 'provisioning',
      enabled: false,
      clients: 3,
      users: 12,
      activeSessions: 0,
    },
    {
      name: 'legacy-sso',
      namespace: 'keycloak',
      status: 'error',
      enabled: true,
      clients: 5,
      users: 203,
      activeSessions: 0,
    },
  ],
  totalClients: 52,
  totalUsers: 3245,
  totalActiveSessions: 333,
  lastCheckTime: new Date(Date.now() - 30_000).toISOString(),
}
