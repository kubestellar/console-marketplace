/**
 * Shared millisecond time-offset constants and relative-timestamp helpers
 * for demo data.
 *
 * Six cards' `demoData.ts` files had drifted into three different styles
 * for expressing "N units ago" timestamps: an identical 8-constant block
 * duplicated verbatim across three files, raw magic-number math (e.g.
 * `Date.now() - 30 * 60 * 1000`) in two others, and a one-off named
 * constant in the last. Importing from here keeps every card's demo data
 * on one definition and avoids the magic-number pattern the project
 * conventions forbid.
 */

export const ONE_SECOND_MS = 1000
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS
export const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS
export const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
export const THREE_HOURS_MS = 3 * ONE_HOUR_MS
export const SIX_HOURS_MS = 6 * ONE_HOUR_MS
export const TWELVE_HOURS_MS = 12 * ONE_HOUR_MS
export const ONE_DAY_MS = 24 * ONE_HOUR_MS

/** ISO 8601 timestamp for `n` seconds before now. */
export function secondsAgoIso(n: number): string {
  return new Date(Date.now() - n * ONE_SECOND_MS).toISOString()
}

/** ISO 8601 timestamp for `n` minutes before now. */
export function minutesAgoIso(n: number): string {
  return new Date(Date.now() - n * ONE_MINUTE_MS).toISOString()
}

/** ISO 8601 timestamp for `n` hours before now. */
export function hoursAgoIso(n: number): string {
  return new Date(Date.now() - n * ONE_HOUR_MS).toISOString()
}

/** ISO 8601 timestamp for `n` days before now. */
export function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * ONE_DAY_MS).toISOString()
}
