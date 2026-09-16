import { CheckCircle, AlertTriangle, RefreshCw, Radio, XCircle, Cloud, Wifi, WifiOff } from 'lucide-react'
import type { NodePoolStatus, NodePoolType, GatewayStatus } from './demoData'

export const POOL_STATUS_CONFIG: Record<
  NodePoolStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  ready: {
    label: 'Ready',
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  },
  degraded: {
    label: 'Degraded',
    color: 'text-yellow-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  },
  'not-ready': {
    label: 'Not Ready',
    color: 'text-red-400',
    icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  },
}

export const POOL_TYPE_CONFIG: Record<
  NodePoolType,
  { label: string; icon: React.ReactNode }
> = {
  edge: {
    label: 'Edge',
    icon: <Radio className="w-3 h-3 text-purple-400" />,
  },
  cloud: {
    label: 'Cloud',
    icon: <Cloud className="w-3 h-3 text-blue-400" />,
  },
}

export const GATEWAY_STATUS_CONFIG: Record<
  GatewayStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  connected: {
    label: 'Connected',
    color: 'text-green-400',
    icon: <Wifi className="w-3 h-3 text-green-400" />,
  },
  disconnected: {
    label: 'Disconnected',
    color: 'text-red-400',
    icon: <WifiOff className="w-3 h-3 text-red-400" />,
  },
  pending: {
    label: 'Pending',
    color: 'text-yellow-400',
    icon: <RefreshCw className="w-3 h-3 text-yellow-400" />,
  },
}
