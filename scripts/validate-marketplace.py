#!/usr/bin/env python3
"""
Marketplace quality gate — validates card presets, dashboards, themes,
and registry.json against the kubestellar/console card registry.

Usage:
  python3 scripts/validate-marketplace.py --mode static
  python3 scripts/validate-marketplace.py --mode cross-repo --console-path ./console
  python3 scripts/validate-marketplace.py --mode full --console-path ./console

Modes:
  static      JSON schema, naming conventions, grid validity, registry consistency
  cross-repo  static + card_type existence, demo data, isDemoData wiring,
              consecutiveFailures, i18n keys, CORS proxy compliance
  full        cross-repo + downloadUrl reachability, drift detection,
              registry staleness, CNCF coverage, theme consistency
"""

import argparse
import json
import glob
import os
import re
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta

# ── Result tracking ──────────────────────────────────────────────────
