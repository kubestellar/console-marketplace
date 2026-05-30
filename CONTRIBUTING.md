# Contributing to KubeStellar Console Marketplace

Thank you for contributing! This guide explains how to submit dashboards, card presets, and themes to the community marketplace.

## Quick Start

1. Fork this repository
2. Add your content (dashboard, card preset, or theme)
3. Add an entry to `registry.json`
4. Open a pull request

## Submitting a Dashboard

### Step 1: Export Your Dashboard

1. Open KubeStellar Console
2. Navigate to the dashboard you want to share
3. Click the **floating action button** (bottom-right)
4. Click **Export** — a JSON file will download

### Step 2: Create Your Submission

1. Create a new directory under `dashboards/` with a kebab-case name:
   ```
   dashboards/my-awesome-dashboard/dashboard.json
   ```
2. (Optional) Add a screenshot as `screenshot.png` (recommended: 1200x630)

### Step 3: Add to Registry

Add an entry to `registry.json`:

```json
{
  "id": "my-awesome-dashboard",
  "name": "My Awesome Dashboard",
  "description": "A brief description of what this dashboard shows.",
  "author": "your-github-username",
  "version": "1.0.0",
  "downloadUrl": "https://raw.githubusercontent.com/kubestellar/console-marketplace/main/dashboards/my-awesome-dashboard/dashboard.json",
  "tags": ["monitoring", "production"],
  "cardCount": 6,
  "type": "dashboard"
}
```

## Submitting a Card Preset

Card presets add a single card to the user's current dashboard.

### Step 1: Create the Preset JSON

Create a file under `card-presets/`:

```json
{
  "format": "kc-card-preset-v1",
  "card_type": "pod_issues",
  "title": "Pod Health Monitor",
  "config": {}
}
```

The `card_type` must be one of the 153 available types — see [Available Card Types](README.md#available-card-types-153) in the README.

### Step 2: Add to Registry

```json
{
  "id": "pod-health-monitor",
  "name": "Pod Health Monitor",
  "description": "Card showing pods with issues like CrashLoopBackOff and OOMKilled.",
  "author": "your-github-username",
  "version": "1.0.0",
  "downloadUrl": "https://raw.githubusercontent.com/kubestellar/console-marketplace/main/card-presets/pod-health-monitor.json",
  "tags": ["monitoring", "pods"],
  "cardCount": 1,
  "type": "card-preset"
}
```

## Submitting a Theme

Themes change the entire look and feel of the console.

### Step 1: Create the Theme JSON

Create a file under `themes/`. Your theme must follow the Console `Theme` interface. See `themes/midnight-blue.json` for a complete example.

Key fields:
- `id`: Unique kebab-case identifier
- `name`: Display name
- `dark`: `true` for dark themes, `false` for light
- `colors`: All color tokens (HSL for core, hex for brand/status/chart)
- `font`: Font family and weight definitions

### Step 2: Add to Registry

Include `themeColors` for the preview dots shown in the marketplace:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "description": "A custom theme with warm tones.",
  "author": "your-github-username",
  "version": "1.0.0",
  "downloadUrl": "https://raw.githubusercontent.com/kubestellar/console-marketplace/main/themes/my-theme.json",
  "tags": ["dark", "warm"],
  "cardCount": 0,
  "type": "theme",
  "themeColors": ["#f59e0b", "#f97316", "#ef4444", "#10b981", "#06b6d4"]
}
```

## Testing Your Submission Locally

Marketplace contributions are config-only, but you should still validate them before opening a PR.

### 1. Run the repository checks locally

From the repository root:

```bash
python3 -m json.tool registry.json > /dev/null
python3 scripts/validate-marketplace.py --mode static
python3 scripts/validate-marketplace.py --mode cross-repo --console-path /path/to/console
```

What these checks catch:

- `python3 -m json.tool`: malformed JSON
- `--mode static`: registry consistency, naming, dashboard grid/shape checks, required fields
- `--mode cross-repo`: everything in `static`, plus validation that referenced `card_type` values exist in a local `kubestellar/console` checkout

If you only changed one file, you can also validate it directly:

```bash
python3 -m json.tool dashboards/<id>/dashboard.json > /dev/null
python3 -m json.tool card-presets/<id>.json > /dev/null
python3 -m json.tool themes/<id>.json > /dev/null
```

### 2. Test a submission in isolation

#### Dashboards

Validate the exported file before wiring it into `registry.json`:

```bash
python3 -m json.tool dashboards/<id>/dashboard.json > /dev/null
python3 - <<'PY'
import json
with open('dashboards/<id>/dashboard.json') as f:
    data = json.load(f)
assert data['format'] == 'kc-dashboard-v1'
assert isinstance(data.get('cards'), list) and data['cards']
for card in data['cards']:
    assert card.get('card_type')
    assert isinstance(card.get('position'), dict)
print('dashboard.json looks valid')
PY
```

#### Card presets

Make sure the preset uses `kc-card-preset-v1` and references a real Console card type:

```bash
python3 -m json.tool card-presets/<id>.json > /dev/null
python3 scripts/validate-marketplace.py --mode cross-repo --console-path /path/to/console
```

If you already have a local Console running, you can test the preset without publishing it by pasting this into the browser DevTools console on a dashboard page:

```js
window.dispatchEvent(new CustomEvent('kc-add-card-from-marketplace', {
  detail: await (await fetch('http://localhost:8000/card-presets/<id>.json')).json()
}))
```

#### Themes

Validate the JSON, then preview it in a local Console by loading it into custom theme storage:

```js
const theme = await (await fetch('http://localhost:8000/themes/<id>.json')).json()
localStorage.setItem('kc-custom-themes', JSON.stringify([theme]))
window.dispatchEvent(new Event('kc-custom-themes-changed'))
```

After that, open **Settings → Theme** and select your theme.

### 3. Test integration with a local Console

Use a local checkout of [`kubestellar/console`](https://github.com/kubestellar/console) for end-to-end verification.

1. Serve this repository locally:
   ```bash
   python3 -m http.server 8000
   ```
2. Start your local Console checkout.
3. The Console marketplace currently fetches the registry from a hard-coded URL in `web/src/hooks/useMarketplace/demoData.ts`; there is no runtime env var/dev flag for overriding it yet.
4. For local marketplace testing, temporarily point that `REGISTRY_URL` at your local server:
   ```ts
   const REGISTRY_URL = 'http://localhost:8000/registry.json'
   ```
5. Reload the Console, open **Marketplace**, and install your dashboard, card preset, or theme.

You can also test a dashboard import directly against a running local Console:

```js
await fetch('/api/dashboards/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(await (await fetch('http://localhost:8000/dashboards/<id>/dashboard.json')).json())
})
```

### 4. Manual verification checklist

Before submitting, verify the following in a running Console:

- **Dashboards**: imports successfully, card layout is preserved, cards render without errors
- **Card presets**: install into an existing dashboard, title/config are applied, card renders without errors
- **Themes**: colors are readable in the sidebar, dashboard cards, Marketplace tiles, and Settings page
- **Themes**: capture screenshots of the key surfaces you changed (at minimum: dashboard view, Marketplace, and Settings → Theme)
- **Themes**: if your theme is light, confirm text contrast on light backgrounds; if dark, confirm contrast on dark cards and panels

### 5. CI requirements for pull requests

PRs that touch `registry.json`, `dashboards/**`, `presets/**`, `card-presets/**`, `themes/**`, or `scripts/**` trigger CI validation.

Current checks include:

- **Validate JSON** (`.github/workflows/validate-json.yml`)
- **Marketplace Quality Gate** (`.github/workflows/marketplace-quality.yml`)
- **PR Verifier** (`.github/workflows/pr-verifier.yml`)

Run the local validation commands above before you open the PR so CI findings are limited to genuine review issues.

## Guidelines

### Quality

- **Descriptive name**: Choose a clear name
- **Good description**: 1-2 sentences explaining what it does and who it's for
- **Relevant tags**: Use existing tags when possible
- **Tested**: Make sure your content works when installed into a fresh console

### Tags

| Tag | Use for |
|-----|---------|
| `sre` | Site reliability / operations |
| `security` | Security monitoring and auditing |
| `compliance` | Compliance and governance |
| `monitoring` | General observability |
| `production` | Production focused |
| `development` | Dev/staging focused |
| `gitops` | GitOps and pipelines |
| `networking` | Network monitoring |
| `storage` | Storage and PV monitoring |
| `cost` | Cost management |
| `gpu` | GPU and ML workloads |
| `helm` | Helm release management |
| `rbac` | Access control |
| `dark` | Dark themes |
| `warm` | Warm color palette themes |
| `minimal` | Clean, minimal design |

### Versioning

- Start at `1.0.0`
- **Patch**: layout tweaks, typo fixes
- **Minor**: new cards, significant changes
- **Major**: complete redesigns

### Pull Request Title

Use this format:
- `Add <name> dashboard`
- `Add <name> card preset`
- `Add <name> theme`

## Code of Conduct

This project follows the [KubeStellar Code of Conduct](https://github.com/kubestellar/kubestellar/blob/main/CODE_OF_CONDUCT.md).

## Questions?

- Open an [issue](https://github.com/kubestellar/console-marketplace/issues)
- Join the [KubeStellar community](https://kubestellar.io/community)
