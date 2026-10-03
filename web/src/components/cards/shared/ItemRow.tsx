import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import { ICON_COLOR_CLASS, BADGE_COLOR_CLASS } from './colorClasses'
import { getStatusIcon, getStatusColor } from './statusVocabulary'
import { formatRelativeTime, type FormatRelativeTimeOptions } from './timeOffsets'
import type { CardDisplayItem } from './CardDisplayItem'

/** One `CardAIActions.issues` entry built by a card's `issueBuilder`. */
export interface ItemRowIssue {
  name: string
  message: string
}

export interface ItemRowProps<Category extends string> {
  item: CardDisplayItem<Category>
  /** Category -> row icon, e.g. `pipeline` -> `Play`. */
  getCategoryIcon: (category: Category) => LucideIcon
  /** Category -> translated/display label, e.g. `pipeline` -> "Pipeline Run". */
  getCategoryLabel: (category: Category) => string
  /** Per-card overrides layered onto `../shared/statusVocabulary` defaults. */
  statusIconOverrides?: Readonly<Record<string, LucideIcon>>
  statusColorOverrides?: Readonly<Record<string, string>>
  /** Translated "ago" suffix passed through to `formatRelativeTime`. */
  agoLabel: string
  formatRelativeTimeOpts?: FormatRelativeTimeOptions
  /**
   * Whether the row renders `CardAIActions`. Defaults to the conventional
   * failed/error/degraded predicate; pass to preserve a card's own history.
   */
  isAiActionsEligible?: (status: string) => boolean
  /**
   * Whether the row uses the red "failed" background/border. Defaults to the
   * same predicate as `isAiActionsEligible`; pass separately for cards whose
   * background and AI-actions conditions have diverged.
   */
  isRedBackground?: (status: string) => boolean
  /** Builds the `CardAIActions.issues` entries for an AI-actions-eligible row. */
  issueBuilder: (
    item: CardDisplayItem<Category>,
    categoryLabel: string,
  ) => ItemRowIssue[]
}

const DEFAULT_FAILED_LIKE = (status: string) =>
  status === 'failed' || status === 'error' || status === 'degraded'

/**
 * Shared presentational primitive for status-card resource rows.
 *
 * Extracted from the ~85%-duplicated `kubeflow_status/ItemRow.tsx` and
 * `openkruise_status/ItemRow.tsx` (kubestellar/console-marketplace#842).
 * Per-card behavior that had already drifted between the two copies —
 * the red-background predicate, the `formatRelativeTime` sub-minute clamp,
 * and the `CardAIActions.issues` strings (inline vs. i18n) — is preserved
 * exactly via props rather than unified, so this extraction changes no
 * rendered output for either existing card.
 */
export function ItemRow<Category extends string>({
  item,
  getCategoryIcon,
  getCategoryLabel,
  statusIconOverrides,
  statusColorOverrides,
  agoLabel,
  formatRelativeTimeOpts,
  isAiActionsEligible = DEFAULT_FAILED_LIKE,
  isRedBackground = DEFAULT_FAILED_LIKE,
  issueBuilder,
}: ItemRowProps<Category>): ReactNode {
  const { t } = useTranslation(['cards', 'common'])

  const categoryLabel = getCategoryLabel(item.category)
  const StatusIcon = getStatusIcon(item.status, statusIconOverrides)
  const CategoryIcon = getCategoryIcon(item.category)
  const color = getStatusColor(item.status, statusColorOverrides)

  return (
    <div
      className={`p-3 rounded-lg ${
        isRedBackground(item.status)
          ? 'bg-red-500/10 border border-red-500/20'
          : 'bg-secondary/30'
      } hover:bg-secondary/50 transition-colors cursor-pointer group`}
      title={`${item.name} \u2014 ${categoryLabel}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span title={`${t('common:common.status')}: ${item.status}`}>
            <StatusIcon
              className={`w-4 h-4 ${ICON_COLOR_CLASS[color] ?? ICON_COLOR_CLASS.orange}`}
            />
          </span>
          <span
            className="text-sm text-foreground font-medium group-hover:text-purple-400"
            title={item.name}
          >
            {item.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAiActionsEligible(item.status) && (
            <CardAIActions
              resource={{
                kind: categoryLabel,
                name: item.name,
                namespace: item.namespace,
                cluster: item.cluster,
                status: item.status,
              }}
              issues={issueBuilder(item, categoryLabel)}
            />
          )}
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${BADGE_COLOR_CLASS[color] ?? BADGE_COLOR_CLASS.orange}`}
            title={`${t('common:common.status')}: ${item.status}`}
          >
            {item.status}
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground min-w-0">
        {item.cluster && (
          <div className="shrink-0">
            <ClusterBadge cluster={item.cluster} size="sm" />
          </div>
        )}
        <span className="shrink-0" title={categoryLabel}>
          <CategoryIcon className="w-3 h-3 inline mr-1" />
          {categoryLabel}
        </span>
        <span className="truncate" title={item.primaryDetail}>
          {item.primaryDetail}
        </span>
        {item.secondaryDetail && (
          <span
            className="truncate text-muted-foreground/70"
            title={item.secondaryDetail}
          >
            {item.secondaryDetail}
          </span>
        )}
        <span
          className="ml-auto shrink-0 whitespace-nowrap"
          title={new Date(item.timestamp).toLocaleString()}
        >
          {formatRelativeTime(item.timestamp, agoLabel, formatRelativeTimeOpts)}
        </span>
      </div>
    </div>
  )
}
