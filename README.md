# KubeStellar Console Marketplace

Community-contributed dashboards, card presets, and themes for [KubeStellar Console](https://github.com/kubestellar/console).

## How It Works

The KubeStellar Console Marketplace lets you browse and install community-created content directly from the Console UI. All content is **config-only** — dashboards are JSON files that define card layouts, card presets add individual cards, and themes change the look and feel. No custom code is executed.

### For Users

1. Open KubeStellar Console
2. Click **Marketplace** in the left sidebar
3. Browse or search for dashboards, card presets, and themes
4. Click **Install** to add content to your console

### For Contributors

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Repository Structure

```
console-marketplace/
├── registry.json              # Main registry
├── dashboards/                # Full dashboard exports
│   ├── sre-overview/
│   │   └── dashboard.json
│   └── ...
├── card-presets/              # Individual card presets
│   ├── pod-health-monitor.json
│   └── ...
├── themes/                    # Custom themes
│   ├── midnight-blue.json
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
| `downloadUrl` | string | URL to the JSON file |
| `tags` | string[] | Searchable tags |
| `cardCount` | number | Number of cards (0 for themes) |
| `type` | string | One of: `dashboard`, `card-preset`, `theme` |
| `themeColors` | string[]? | Preview hex colors for theme items |

## Content Formats

### Dashboard (`kc-dashboard-v1`)

```json
{
  "format": "kc-dashboard-v1",
  "name": "My Dashboard",
  "description": "What this dashboard shows",
  "exported_at": "2026-02-10T00:00:00Z",
  "layout": { "columns": 12 },
  "cards": [
    { "card_type": "cluster_health", "config": {}, "position": { "x": 0, "y": 0, "w": 6, "h": 4 } }
  ]
}
```

### Card Preset (`kc-card-preset-v1`)

```json
{
  "format": "kc-card-preset-v1",
  "card_type": "pod_issues",
  "title": "Pod Health Monitor",
  "config": {}
}
```

### Theme

Themes follow the Console `Theme` interface. See `themes/midnight-blue.json` for a full example.

## Available Card Types (153)

All card types use `snake_case`. Use these in the `card_type` field of dashboards and card presets.

### Core Monitoring
| Card Type | Description |
|-----------|-------------|
| `cluster_health` | Cluster overview with health status |
| `cluster_metrics` | Cluster resource metrics and charts |
| `cluster_focus` | Detailed view of a single cluster |
| `cluster_comparison` | Side-by-side cluster comparison |
| `cluster_costs` | Cluster cost breakdown |
| `cluster_network` | Cluster networking overview |
| `cluster_locations` | Geographic cluster map |
| `cluster_resource_tree` | Full resource tree for a cluster |
| `cluster_health_monitor` | Live cluster health monitoring |
| `compute_overview` | CPU/memory overview |
| `resource_usage` | Resource utilization summary |
| `resource_capacity` | Resource capacity vs usage |
| `resource_trend` | Resource usage over time |
| `upgrade_status` | Kubernetes version upgrade status |
| `provider_health` | Cloud and AI provider status |

### Pods & Workloads
| Card Type | Description |
|-----------|-------------|
| `pod_issues` | Pods with CrashLoopBackOff, OOMKilled, etc. |
| `pod_health_trend` | Pod health over time |
| `top_pods` | Top pods by resource usage |
| `app_status` | Application health overview |
| `deployment_status` | Deployment replica status |
| `deployment_progress` | Rolling update progress |
| `deployment_issues` | Deployments with problems |
| `deployment_missions` | Deploy progress tracking |
| `workload_deployment` | Workload deployment manager |
| `workload_monitor` | Live workload health monitoring |
| `cluster_groups` | Drag-and-drop deploy targets |
| `resource_marshall` | Dependency tree explorer |

### Events
| Card Type | Description |
|-----------|-------------|
| `event_stream` | Live Kubernetes event stream |
| `event_summary` | Event aggregation and counts |
| `events_timeline` | Events over time chart |
| `warning_events` | Warning-level events only |
| `recent_events` | Most recent events |

### Networking
| Card Type | Description |
|-----------|-------------|
| `network_overview` | Network policy and service summary |
| `service_status` | Service health and endpoints |
| `service_exports` | MCS service exports |
| `service_imports` | MCS service imports |
| `gateway_status` | Gateway API status |
| `service_topology` | Service dependency visualization |

### Storage
| Card Type | Description |
|-----------|-------------|
| `storage_overview` | Storage summary |
| `pvc_status` | Persistent Volume Claim status |

### GPU & Compute
| Card Type | Description |
|-----------|-------------|
| `gpu_overview` | GPU fleet summary |
| `gpu_inventory` | GPU hardware inventory |
| `gpu_status` | GPU health status |
| `gpu_workloads` | GPU workload assignments |
| `gpu_utilization` | GPU utilization charts |
| `gpu_usage_trend` | GPU usage over time |
| `hardware_health` | Hardware health indicators |

### Namespaces
| Card Type | Description |
|-----------|-------------|
| `namespace_overview` | Namespace resource summary |
| `namespace_quotas` | Resource quota usage |
| `namespace_rbac` | RBAC analysis per namespace |
| `namespace_events` | Events scoped to namespace |
| `namespace_monitor` | Live namespace monitoring |

### Operators & CRDs
| Card Type | Description |
|-----------|-------------|
| `operator_status` | Operator health |
| `operator_subscriptions` | OLM subscriptions |
| `crd_health` | CRD status |

### Helm & GitOps
| Card Type | Description |
|-----------|-------------|
| `helm_release_status` | Helm release overview |
| `helm_values_diff` | Helm values comparison |
| `helm_history` | Helm release history |
| `chart_versions` | Available chart versions |
| `gitops_drift` | Configuration drift detection |
| `kustomization_status` | Kustomization status |
| `overlay_comparison` | Kustomize overlay diff |

### ArgoCD
| Card Type | Description |
|-----------|-------------|
| `argocd_applications` | ArgoCD application list |
| `argocd_sync_status` | ArgoCD sync state |
| `argocd_health` | ArgoCD health overview |

### Security & Compliance
| Card Type | Description |
|-----------|-------------|
| `security_issues` | Security findings |
| `opa_policies` | OPA Gatekeeper policies |
| `kyverno_policies` | Kyverno policy status |
| `falco_alerts` | Falco runtime alerts |
| `trivy_scan` | Trivy vulnerability scan |
| `kubescape_scan` | Kubescape security scan |
| `policy_violations` | Policy violation summary |
| `compliance_score` | Overall compliance score |
| `vault_secrets` | HashiCorp Vault secrets |
| `external_secrets` | External Secrets Operator |
| `cert_manager` | cert-manager certificates |

### Alerting
| Card Type | Description |
|-----------|-------------|
| `active_alerts` | Active alert rules firing |
| `alert_rules` | Configured alert rules |

### Cost Management
| Card Type | Description |
|-----------|-------------|
| `opencost_overview` | OpenCost breakdown |
| `kubecost_overview` | Kubecost analysis |

### CI/CD & Prow
| Card Type | Description |
|-----------|-------------|
| `prow_jobs` | Prow job list |
| `prow_status` | Prow system status |
| `prow_history` | Prow job history |
| `prow_ci_monitor` | Prow CI monitoring |
| `github_activity` | GitHub activity feed |
| `github_ci_monitor` | GitHub Actions monitoring |

### AI & ML
| Card Type | Description |
|-----------|-------------|
| `llm_inference` | LLM inference endpoints |
| `llm_models` | Deployed LLM models |
| `ml_jobs` | ML training jobs |
| `ml_notebooks` | Jupyter notebooks |
| `llmd_flow` | LLM-d request flow visualization |
| `kvcache_monitor` | KV cache utilization |
| `epp_routing` | EPP routing diagram |
| `pd_disaggregation` | Prefill/Decode disaggregation |
| `llmd_benchmarks` | LLM-d benchmark charts |
| `llmd_ai_insights` | LLM-d AI insights |
| `llmd_configurator` | LLM-d configuration |
| `llmd_stack_monitor` | LLM-d stack monitoring |

### Kagenti AI Agent Platform
| Card Type | Description |
|-----------|-------------|
| `kagenti_status` | Kagenti platform status |
| `kagenti_agent_fleet` | Agent fleet overview |
| `kagenti_build_pipeline` | Agent build pipelines |
| `kagenti_tool_registry` | Tool registry |
| `kagenti_agent_discovery` | Agent discovery |
| `kagenti_security` | Agent security |
| `kagenti_security_posture` | Security posture |
| `kagenti_topology` | Agent topology map |

### Console AI Missions
| Card Type | Description |
|-----------|-------------|
| `console_ai_issues` | AI-powered issue detection |
| `console_ai_kubeconfig_audit` | Kubeconfig audit |
| `console_ai_health_check` | AI health check |
| `console_ai_offline_detection` | Offline cluster detection |
| `user_management` | User management |

### Utilities & Fun
| Card Type | Description |
|-----------|-------------|
| `weather` | Weather widget |
| `rss_feed` | RSS feed reader |
| `kubectl` | Interactive kubectl terminal |
| `stock_market_ticker` | Stock market ticker |
| `iframe_embed` | Embed any URL |
| `network_utils` | Network diagnostic tools |
| `mobile_browser` | Mobile browser emulator |
| `dynamic_card` | Card Factory meta-component |

### Games
| Card Type | Description |
|-----------|-------------|
| `sudoku_game` | Sudoku |
| `match_game` | Memory match |
| `solitaire` | Solitaire |
| `checkers` | Checkers |
| `game_2048` | 2048 |
| `kubedle` | Wordle for Kubernetes |
| `pod_sweeper` | Minesweeper |
| `container_tetris` | Tetris |
| `flappy_pod` | Flappy Bird |
| `kube_man` | Pac-Man |
| `kube_kong` | Donkey Kong |
| `pod_pitfall` | Pitfall |
| `node_invaders` | Space Invaders |
| `pod_crosser` | Frogger |
| `pod_brothers` | Mario Bros |
| `kube_kart` | Racing |
| `kube_pong` | Pong |
| `kube_snake` | Snake |
| `kube_galaga` | Galaga |
| `kube_doom` | Doom |
| `kube_craft` | Crafting |
| `kube_chess` | Chess |

### Aliases
These map to existing card components with similar functionality:

| Alias | Maps To |
|-------|---------|
| `gpu_list` | `gpu_inventory` |
| `gpu_issues` | `gpu_status` |
| `memory_usage` | `resource_usage` |
| `memory_trend` | `cluster_metrics` |
| `cpu_usage` | `resource_usage` |
| `cpu_trend` | `cluster_metrics` |
| `top_cpu_pods` | `top_pods` |
| `pod_status` | `app_status` |
| `pod_list` | `top_pods` |
| `error_count` | `pod_issues` |
| `security_overview` | `security_issues` |
| `rbac_summary` | `namespace_rbac` |

## License

Apache-2.0 — see [LICENSE](LICENSE).
