# Contributing to KubeStellar Console Marketplace

Thank you for contributing! This guide explains how to submit dashboards, card presets, and themes to the community marketplace.

## Submitting a Dashboard

### Step 1: Export Your Dashboard

1. Open KubeStellar Console
2. Navigate to the dashboard you want to share
3. Click the **floating action button** (bottom-right)
4. Click **Export** — a JSON file will download

### Step 2: Create Your Submission

1. Fork this repository
2. Create a new directory under `dashboards/` with a kebab-case name:
   ```
   dashboards/my-awesome-dashboard/
   ```
3. Place your exported JSON file as `dashboard.json`:
   ```
   dashboards/my-awesome-dashboard/dashboard.json
   ```
4. (Optional) Add a screenshot as `screenshot.png` (recommended size: 1200x630)

### Step 3: Add to Registry

Add an entry to `registry.json` in the `items` array:

```json
{
  "id": "my-awesome-dashboard",
  "name": "My Awesome Dashboard",
  "description": "A brief description of what this dashboard shows and who it's for.",
  "author": "your-github-username",
  "version": "1.0.0",
  "screenshot": "https://raw.githubusercontent.com/kubestellar/console-marketplace/main/dashboards/my-awesome-dashboard/screenshot.png",
  "downloadUrl": "https://raw.githubusercontent.com/kubestellar/console-marketplace/main/dashboards/my-awesome-dashboard/dashboard.json",
  "tags": ["tag1", "tag2"],
  "cardCount": 6,
  "type": "dashboard"
}
```

### Step 4: Submit a Pull Request

1. Commit your changes
2. Open a pull request with:
   - Title: `Add <dashboard-name> dashboard`
   - Description: What the dashboard shows and why it's useful

## Guidelines

### Dashboard Quality

- **Descriptive name**: Choose a clear, descriptive name
- **Good description**: Explain what the dashboard monitors and who it's for
- **Relevant tags**: Use existing tags when possible; add new ones sparingly
- **Reasonable size**: 4-12 cards is ideal; very large dashboards are harder to adopt
- **Tested**: Make sure your dashboard works when imported into a fresh console

### Tags

Use these common tags when applicable:

| Tag | Use for |
|-----|---------|
| `sre` | Site reliability / operations dashboards |
| `security` | Security monitoring and auditing |
| `compliance` | Compliance and governance |
| `monitoring` | General monitoring and observability |
| `production` | Production environment focused |
| `development` | Development/staging focused |
| `gitops` | GitOps and deployment pipelines |
| `networking` | Network-focused dashboards |
| `storage` | Storage and PV monitoring |
| `cost` | Cost management and optimization |
| `gpu` | GPU and ML workload monitoring |
| `helm` | Helm release management |
| `rbac` | RBAC and access control |

### Versioning

- Start at `1.0.0`
- Bump the **patch** version for small fixes (layout tweaks)
- Bump the **minor** version for new cards or significant changes
- Bump the **major** version for complete redesigns

### Screenshots

- Recommended: 1200x630 pixels (16:9 aspect ratio)
- Show the dashboard in a realistic state with data
- Use dark theme (matches the default Console theme)
- PNG format preferred

## Code of Conduct

This project follows the [KubeStellar Code of Conduct](https://github.com/kubestellar/kubestellar/blob/main/CODE_OF_CONDUCT.md). Be respectful and constructive.

## Questions?

- Open an [issue](https://github.com/kubestellar/console-marketplace/issues)
- Join the [KubeStellar community](https://kubestellar.io/community)
