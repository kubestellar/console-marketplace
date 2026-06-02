# Security Policy

The KubeStellar Console Marketplace distributes community-contributed dashboards, card presets, themes, and the registry metadata used to install them. Even though marketplace content is config-only, it is part of the Console supply chain and security reports are taken seriously.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for suspected vulnerabilities or malicious marketplace content.

Use one of these private reporting channels instead:

1. **GitHub Security Advisories / private vulnerability reporting** if it is enabled for this repository.
2. **Email:** [kubestellar-security-announce@googlegroups.com](mailto:kubestellar-security-announce@googlegroups.com)

When you report an issue, please include:

- A clear description of the problem
- Whether it affects a marketplace entry, the registry, CI/workflows, or repository infrastructure
- Steps to reproduce or validate the issue
- Any proof-of-concept, screenshots, hashes, raw URLs, or logs that help confirm impact
- Suggested mitigations, if known

### GitHub Private Reporting Status

At this time, **GitHub private vulnerability reporting is not enabled** for `kubestellar/console-marketplace`. Until that changes, email is the preferred private disclosure path for this repository.

## Supported Versions

Security fixes are provided for the actively maintained marketplace content and metadata on the default branch.

| Version | Supported |
| --- | --- |
| `main` | :white_check_mark: |
| Older commits or unmaintained forks | :x: |

If a vulnerability affects content that has already been published from `main`, maintainers may remove or replace affected entries even if no tagged release exists.

## Response Timeline

The KubeStellar maintainers aim to:

- **Acknowledge** security reports within **3 business days**
- **Triage** and assess severity as quickly as possible after acknowledgment
- Provide a **status update within 7 business days** when the investigation is ongoing
- Coordinate remediation, removal, or disclosure timing with the reporter when a report is confirmed

Actual resolution time depends on impact, reproducer quality, maintainer availability, and whether coordination with another project is required.

## Scope

This policy covers security issues in this repository, including:

- Malicious, compromised, or misleading marketplace entries
- Vulnerable or unsafe registry metadata shipped by this repository
- Supply chain risks in contribution or publishing workflows
- Repository automation, GitHub Actions workflows, and supporting scripts
- Documentation or processes that could cause unsafe installation or trust decisions

This policy does **not** cover:

- General support questions or non-security bugs
- Vulnerabilities in KubeStellar Console core that are unrelated to this repository
- Vulnerabilities in third-party projects that should be reported directly to those projects first when they have their own disclosure process

## Disclosure

Please allow maintainers time to investigate and prepare a fix, removal, or mitigation before public disclosure. Once a report is confirmed, maintainers will work with the reporter on responsible disclosure timing.