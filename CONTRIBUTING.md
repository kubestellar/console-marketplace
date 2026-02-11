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
