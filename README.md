# KubeStellar Console Marketplace

Community-contributed dashboards, card presets, and themes for [KubeStellar Console](https://github.com/kubestellar/console).

## How It Works

The KubeStellar Console Marketplace lets you browse and install community-created content directly from the Console UI. All content is **config-only** — dashboards are JSON files that define card layouts and configurations. No custom code is executed.

### For Users

1. Open KubeStellar Console
2. Click **Marketplace** in the left sidebar
3. Browse or search for dashboards
4. Click **Install** to add a dashboard to your console

### For Contributors

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to submit your own dashboards.

## Repository Structure

```
console-marketplace/
├── registry.json              # Main registry (auto-generated from dashboards/)
├── dashboards/
│   ├── sre-overview/
│   │   └── dashboard.json     # Exported dashboard JSON
│   ├── security-audit/
│   │   └── dashboard.json
│   └── ...
├── CONTRIBUTING.md
└── .github/
    └── ISSUE_TEMPLATE/
        └── new-dashboard.md
```

## Registry Format

The `registry.json` file is the source of truth for the marketplace UI. Each entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (kebab-case) |
| `name` | string | Display name |
| `description` | string | Short description (1-2 sentences) |
| `author` | string | GitHub username or org |
| `version` | string | Semver version |
| `screenshot` | string? | URL to a screenshot image |
| `downloadUrl` | string | URL to the dashboard JSON file |
| `tags` | string[] | Searchable tags |
| `cardCount` | number | Number of cards in the dashboard |
| `type` | string | One of: `dashboard`, `card-preset`, `theme` |

## Dashboard JSON Format

Dashboards use the `kc-dashboard-v1` export format:

```json
{
  "format": "kc-dashboard-v1",
  "name": "My Dashboard",
  "description": "What this dashboard shows",
  "exported_at": "2026-02-10T00:00:00Z",
  "layout": { "columns": 12 },
  "cards": [
    {
      "card_type": "pods-card",
      "config": {},
      "position": { "x": 0, "y": 0, "w": 6, "h": 4 }
    }
  ]
}
```

## Available Card Types

These card types are available in KubeStellar Console:

| Card Type | Description |
|-----------|-------------|
| `clusters-card` | Cluster overview with health status |
| `pods-card` | Pod listing with status indicators |
| `deployments-card` | Deployment status and replicas |
| `services-card` | Service listing with endpoints |
| `events-card` | Kubernetes event stream |
| `nodes-card` | Node health and resource usage |
| `security-issues-card` | Security findings and violations |
| `network-policies-card` | Network policy overview |
| `helm-releases-card` | Helm release status |
| `gitops-drift-card` | Configuration drift detection |
| `resource-quotas-card` | Resource quota usage |
| `pvcs-card` | Persistent volume claims |
| `operators-card` | Operator status |
| `rbac-card` | RBAC roles and bindings |
| `config-maps-card` | ConfigMap listing |
| `secrets-card` | Secret listing (names only) |
| `warning-events-card` | Warning-level events |
| `pod-issues-card` | Pods with problems |
| `deployment-issues-card` | Deployments with issues |

## License

Apache-2.0 — see [LICENSE](LICENSE).
