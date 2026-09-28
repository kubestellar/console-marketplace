import { CheckCircle, XCircle, Clock, AlertTriangle, Play } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Canonical status -> icon mapping shared by ItemRow-style cards. */
export const DEFAULT_STATUS_ICON: Readonly<Record<string, LucideIcon>> = {
  succeeded: CheckCircle,
  healthy: CheckCircle,
  failed: XCircle,
  error: XCircle,
  running: Play,
  active: Play,
  pending: Clock,
}

/** Canonical status -> color-key mapping shared by ItemRow-style cards. */
export const DEFAULT_STATUS_COLOR: Readonly<Record<string, string>> = {
  succeeded: 'green',
  healthy: 'green',
  failed: 'red',
  error: 'red',
  running: 'blue',
  active: 'blue',
  pending: 'yellow',
}

const FALLBACK_STATUS_ICON: LucideIcon = AlertTriangle
const FALLBACK_STATUS_COLOR = 'orange'

/** Resolve a status icon; `override` entries take precedence over the defaults. */
export function getStatusIcon(
  status: string,
  override?: Readonly<Record<string, LucideIcon>>,
): LucideIcon {
  return override?.[status] ?? DEFAULT_STATUS_ICON[status] ?? FALLBACK_STATUS_ICON
}

/** Resolve a status color key; `override` entries take precedence over the defaults. */
export function getStatusColor(
  status: string,
  override?: Readonly<Record<string, string>>,
): string {
  return override?.[status] ?? DEFAULT_STATUS_COLOR[status] ?? FALLBACK_STATUS_COLOR
}
