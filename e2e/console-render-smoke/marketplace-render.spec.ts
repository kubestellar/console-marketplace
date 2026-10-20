/**
 * Console render smoke-test for console-marketplace registry.json entries.
 *
 * This spec lives in kubestellar/console-marketplace but runs from inside a
 * pinned kubestellar/console checkout (copied to web/e2e/marketplace-smoke/
 * by .github/workflows/console-render-smoke.yml) so it can reuse console's
 * own Playwright config and demo-mode helpers.
 *
 * For every id listed in smoke-sample.json it loads the asset from THIS
 * checkout (so PR changes are what get rendered), installs it the same way
 * console's useMarketplace installItem() does, and asserts the console
 * renders it without page/console errors.
 *
 * Env:
 *   MARKETPLACE_ROOT  absolute path to the console-marketplace checkout
 */
import * as fs from 'fs'
import * as path from 'path'
import { test, expect, type Page } from '@playwright/test'
import {
  setupDemoMode,
  setupErrorCollector,
  waitForNetworkIdleBestEffort,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'

type EntryType = 'dashboard' | 'card-preset' | 'theme'

interface RegistryEntry {
  id: string
  name: string
  type: EntryType
  downloadUrl: string
}

interface CardSpec {
  card_type: string
  config?: Record<string, unknown>
  title?: string
  position?: { x: number; y: number; w: number; h: number }
}

interface StoredCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position: { x: number; y: number; w: number; h: number }
}

const MARKETPLACE_ROOT = process.env.MARKETPLACE_ROOT
if (!MARKETPLACE_ROOT) {
  throw new Error('MARKETPLACE_ROOT must point at the console-marketplace checkout')
}

const SAMPLE_PATH = path.join(MARKETPLACE_ROOT, 'e2e', 'console-render-smoke', 'smoke-sample.json')
const REGISTRY_PATH = path.join(MARKETPLACE_ROOT, 'registry.json')
const DOWNLOAD_URL_PREFIX = /^https:\/\/raw\.githubusercontent\.com\/kubestellar\/console-marketplace\/[^/]+\//

/** Keys console reads at startup (web/src/lib/constants/storage.ts, ThemeContext.tsx). */
const MAIN_DASHBOARD_STORAGE_KEY = 'kubestellar-main-dashboard-cards'
const DASHBOARD_STORAGE_SCHEMA_VERSION = '1'
const CUSTOM_THEMES_STORAGE_KEY = 'kc-custom-themes'
const THEME_ID_STORAGE_KEY = 'kubestellar-theme-id'
const SMOKE_DASHBOARD_ID = 'marketplace-render-smoke'

const DEFAULT_PRESET_POSITION = { x: 0, y: 0, w: 4, h: 3 }
const RENDER_TIMEOUT_MS = 30_000

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
}

const registry = readJson<{ items?: RegistryEntry[]; presets?: RegistryEntry[] }>(REGISTRY_PATH)
const allEntries: RegistryEntry[] = [...(registry.items ?? []), ...(registry.presets ?? [])]
const sample = readJson<Partial<Record<EntryType, string[]>>>(SAMPLE_PATH)

function resolveEntry(type: EntryType, id: string): { entry: RegistryEntry; asset: unknown } {
  const entry = allEntries.find(e => e.id === id && e.type === type)
  if (!entry) {
    throw new Error(`smoke-sample.json lists ${type} "${id}" but registry.json has no such entry`)
  }
  if (!DOWNLOAD_URL_PREFIX.test(entry.downloadUrl)) {
    throw new Error(`${type} "${id}" downloadUrl is not a console-marketplace raw URL: ${entry.downloadUrl}`)
  }
  const relPath = entry.downloadUrl.replace(DOWNLOAD_URL_PREFIX, '')
  return { entry, asset: readJson(path.join(MARKETPLACE_ROOT!, relPath)) }
}

/** Collects console errors (minus console's known-benign patterns) and uncaught page errors. */
function collectErrors(page: Page): string[] {
  const { errors } = setupErrorCollector(page)
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  return errors
}

/**
 * Serve `cards` as the user's default dashboard — both from the backend
 * (/api/dashboards, where installItem() persists marketplace installs) and
 * from the main-dashboard localStorage cache console restores on reload.
 */
async function seedDashboardCards(page: Page, name: string, cards: StoredCard[]) {
  const dashboard = { id: SMOKE_DASHBOARD_ID, name, is_default: true, cards }
  await page.route(
    url => url.pathname === '/api/dashboards',
    route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([dashboard]) }),
  )
  await page.route(
    url => url.pathname === `/api/dashboards/${SMOKE_DASHBOARD_ID}`,
    route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) }),
  )
  await page.addInitScript(
    ({ key, version, value }) => {
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem(key, value)
      localStorage.setItem(`${key}:schema-version`, version)
    },
    { key: MAIN_DASHBOARD_STORAGE_KEY, version: DASHBOARD_STORAGE_SCHEMA_VERSION, value: JSON.stringify(cards) },
  )
}

async function gotoConsole(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await page.locator('#root').waitFor({ state: 'visible', timeout: RENDER_TIMEOUT_MS })
  await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, `marketplace smoke ${route}`)
}

async function expectCardsRendered(page: Page, cardTypes: string[]) {
  for (const cardType of new Set(cardTypes)) {
    await expect(
      page.locator(`[data-card-type="${cardType}"]`).first(),
      `card_type "${cardType}" did not render a card in the console grid`,
    ).toBeAttached({ timeout: RENDER_TIMEOUT_MS })
  }
  await expect(page.getByText(/Unknown card type/i)).toHaveCount(0)
}

test.describe('Marketplace registry entries render in Console', () => {
  for (const id of sample.dashboard ?? []) {
    test(`dashboard "${id}" renders every card`, async ({ page }) => {
      const { entry, asset } = resolveEntry('dashboard', id)
      const dashboard = asset as { cards: CardSpec[] }
      expect(dashboard.cards.length, `dashboard "${id}" has no cards`).toBeGreaterThan(0)
      const cards: StoredCard[] = dashboard.cards.map((card, idx) => ({
        id: `smoke-${id}-${idx}`,
        card_type: card.card_type,
        config: card.config ?? {},
        ...(card.title ? { title: card.title } : {}),
        position: card.position ?? DEFAULT_PRESET_POSITION,
      }))

      await setupDemoMode(page)
      const errors = collectErrors(page)
      await seedDashboardCards(page, entry.name, cards)
      await gotoConsole(page, '/')

      await expectCardsRendered(page, cards.map(c => c.card_type))
      expect(errors, `console errors while rendering dashboard "${id}"`).toEqual([])
    })
  }

  for (const id of sample['card-preset'] ?? []) {
    test(`card-preset "${id}" renders its card`, async ({ page }) => {
      const { asset } = resolveEntry('card-preset', id)
      const preset = asset as CardSpec
      expect(preset.card_type, `card-preset "${id}" has no card_type`).toBeTruthy()
      const card: StoredCard = {
        id: `mp-smoke-${id}`,
        card_type: preset.card_type,
        config: preset.config ?? {},
        ...(preset.title ? { title: preset.title } : {}),
        position: DEFAULT_PRESET_POSITION,
      }

      await setupDemoMode(page)
      const errors = collectErrors(page)
      await seedDashboardCards(page, 'Marketplace smoke', [card])
      await gotoConsole(page, '/')

      // Same event console's installItem() fires after persisting a card-preset.
      await page.evaluate(detail => {
        window.dispatchEvent(new CustomEvent('kc-add-card-from-marketplace', { detail }))
      }, preset)

      await expectCardsRendered(page, [card.card_type])
      // Assert the seeded preset card itself rendered (by its data-card-id).
      // Do NOT assert the preset's custom `title` text: console resolves card
      // titles as `builtin card_type title || custom title || card_type`
      // (web/src/components/cards/useCardWrapperState.ts), so a preset title
      // like "Pod Health Monitor" is never displayed for a known card_type.
      const rendered = page.locator(`[data-card-id="${card.id}"]`)
      await rendered.scrollIntoViewIfNeeded()
      await expect(rendered, `card-preset "${id}" card did not render`).toBeVisible({
        timeout: RENDER_TIMEOUT_MS,
      })
      expect(errors, `console errors while rendering card-preset "${id}"`).toEqual([])
    })
  }

  // Covers the shared itemsPerPage/"unlimited" toggle (CardControlsRow) and
  // cluster-filter dropdown (CardControlsHeader) that back every status card
  // (buildpacks-status, coredns_status, kubeflow_status, notary_status,
  // openkruise_status, openyurt_status). Both controls are unit-tested at
  // 100% but, before this spec, were never exercised against a real
  // rendered card — only render-without-error was. kubeflow_status is used
  // as the representative card: its demo data spans 3 clusters and more
  // items than the default page size, so both controls have an observable
  // effect. See kubestellar/console-marketplace#1006.
  test('kubeflow_status card: itemsPerPage "unlimited" toggle and cluster filter', async ({ page }) => {
    const card: StoredCard = {
      id: 'smoke-kubeflow-status-controls',
      card_type: 'kubeflow_status',
      config: {},
      position: DEFAULT_PRESET_POSITION,
    }

    await setupDemoMode(page)
    const errors = collectErrors(page)
    await seedDashboardCards(page, 'Marketplace controls smoke', [card])
    await gotoConsole(page, '/')
    await expectCardsRendered(page, [card.card_type])

    const cardRoot = page.locator(`[data-card-id="${card.id}"]`)
    const pagination = cardRoot.getByTestId('card-pagination')
    const limitSelect = cardRoot.getByTestId('card-limit')

    // Default page size paginates the 20+ demo items: footer shows a range.
    await expect(pagination).not.toBeEmpty()

    await limitSelect.selectOption('unlimited')
    // needsPagination becomes false once every item fits on one page, so the
    // (always-rendered) footer container goes empty.
    await expect(pagination).toBeEmpty()

    const clusterFilterButton = cardRoot.getByTestId('card-cluster-filter-button')
    await clusterFilterButton.click()
    const dropdown = cardRoot.getByTestId('card-cluster-filter-dropdown')
    await expect(dropdown).toBeVisible()

    const firstClusterCheckbox = dropdown.locator('input[type="checkbox"]').first()
    await firstClusterCheckbox.check()

    // CardControlsHeader's "N/M clusters" badge reflects the local filter.
    await expect(cardRoot.getByText(/^1\/\d+$/)).toBeVisible()

    expect(errors, 'console errors while exercising kubeflow_status controls').toEqual([])
  })

  for (const id of sample.theme ?? []) {
    test(`theme "${id}" installs and applies`, async ({ page }) => {
      const { asset } = resolveEntry('theme', id)
      const theme = asset as { id: string; dark?: boolean; colors: Record<string, string> }
      expect(theme.id, `theme file id must match registry id "${id}"`).toBe(id)

      await setupDemoMode(page)
      const errors = collectErrors(page)
      // Pre-select the theme id; it only resolves once the custom theme is installed below.
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_ID_STORAGE_KEY, value: theme.id },
      )
      await gotoConsole(page, '/')

      // Same steps as CONTRIBUTING.md "Themes" and console's installItem().
      await page.evaluate(
        ({ key, value }) => {
          localStorage.setItem(key, JSON.stringify([value]))
          window.dispatchEvent(new Event('kc-custom-themes-changed'))
        },
        { key: CUSTOM_THEMES_STORAGE_KEY, value: theme },
      )

      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')), {
          message: `theme "${id}" was not applied to <html data-theme>`,
          timeout: RENDER_TIMEOUT_MS,
        })
        .toBe(theme.id)
      await expect
        .poll(() =>
          page.evaluate(() => document.documentElement.style.getPropertyValue('--primary').trim()),
        )
        .toBe(theme.colors.primary)
      if (typeof theme.dark === 'boolean') {
        await expect(page.locator('html')).toHaveClass(theme.dark ? /\bdark\b/ : /\blight\b/)
      }
      expect(errors, `console errors while applying theme "${id}"`).toEqual([])
    })
  }
})
