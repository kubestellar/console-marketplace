import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import cardsLocale from '../locales/en/cards.json'

/**
 * Regression test for console-marketplace's missing-translation bug class:
 * a card component can reference a `t('someNamespace.someKey')` string that
 * has no entry anywhere in `cards.json`, and nothing catches it. The Python
 * `check_i18n_keys` quality gate only verifies the registry `card_type`
 * (e.g. `coredns_status`) has *a* translation entry — it never checks the
 * actual namespace (`corednsStatus`) the component renders with. The Vitest
 * `react-i18next` mock (see `web/src/test/setup.ts`) returns the raw key for
 * any `t()` call, so component tests can't tell a real translation apart
 * from a missing one either. This walks every card component source file,
 * extracts the static `t('ns.key')` calls, and asserts each one resolves
 * against `cards.json` directly.
 */

const CARDS_DIR = join(__dirname, '../components/cards')

// Matches `t('ns.key')` / `t("ns.key")` with a plain string literal — calls
// built from template-literal interpolation (e.g. `t(\`openyurt.fetchError_${x}\`)`)
// aren't statically resolvable and are intentionally skipped.
const T_CALL_RE = /\bt\(\s*(['"])([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)\1/g

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full))
      continue
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

function extractKeys(source: string): string[] {
  const keys: string[] = []
  for (const match of source.matchAll(T_CALL_RE)) {
    const key = match[2]
    // `t('common:common.failed')`-style explicit namespace prefixes resolve
    // against console's shared `common` bundle, not this repo's cards.json.
    if (key.includes(':')) {
      continue
    }
    keys.push(key)
  }
  return keys
}

function resolvesInCardsLocale(key: string): boolean {
  const segments = key.split('.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = cardsLocale
  for (const segment of segments) {
    if (node == null || typeof node !== 'object' || !(segment in node)) {
      return false
    }
    node = node[segment]
  }
  return typeof node === 'string'
}

describe('card component i18n keys resolve in cards.json', () => {
  const sourceFiles = collectSourceFiles(CARDS_DIR)
  expect(sourceFiles.length).toBeGreaterThan(0)

  for (const file of sourceFiles) {
    const relPath = relative(CARDS_DIR, file)
    const keys = extractKeys(readFileSync(file, 'utf-8'))
    if (keys.length === 0) {
      continue
    }

    it(`${relPath} only uses translation keys present in cards.json`, () => {
      const missing = keys.filter(key => !resolvesInCardsLocale(key))
      expect(missing).toEqual([])
    })
  }
})
