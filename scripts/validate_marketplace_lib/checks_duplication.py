"""Wire the committed jscpd duplication ratchet into the quality gate.

``scripts/jscpd-ratchet.mjs`` (added by #1031) and its ``.jscpd.json`` /
``jscpd-baseline.json`` config were never invoked by anything: no workflow
under ``.github/workflows/`` references ``jscpd``, so a PR could add fresh
duplication indefinitely and the ratchet would never fire. This module runs
that existing script as a static check instead of re-implementing its logic,
so ``scripts/jscpd-ratchet.mjs`` stays the single source of truth for the
ratchet itself.
"""
import os
import subprocess

# Generous but bounded: the real run shells out to `npx jscpd`, which may
# need to fetch the package on a cold cache.
_TIMEOUT_SECONDS = 180


def check_duplication(base, results, run=subprocess.run):
    """Run ``scripts/jscpd-ratchet.mjs`` against ``base`` and record the
    outcome on ``results``.

    Synthetic/partial checkouts (as built by the test suite) that don't
    carry the ratchet script are skipped with a note rather than treated
    as a failure — only a real marketplace checkout is expected to have it.
    """
    ratchet_script = os.path.join(base, "scripts", "jscpd-ratchet.mjs")
    if not os.path.isfile(ratchet_script):
        results.note("duplication",
                     "jscpd-ratchet.mjs not found; skipping duplication ratchet")
        return

    try:
        proc = run(
            ["node", "scripts/jscpd-ratchet.mjs"],
            cwd=base,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        results.warn("duplication", "node not found; skipping duplication ratchet")
        return
    except subprocess.TimeoutExpired:
        results.warn("duplication",
                     f"jscpd-ratchet.mjs timed out after {_TIMEOUT_SECONDS}s")
        return

    tail = "\n".join((proc.stdout or "").strip().splitlines()[-5:])
    if proc.returncode == 0:
        results.ok("duplication", tail or "jscpd duplication ratchet passed")
    else:
        detail = tail or (proc.stderr or "").strip() or f"exit code {proc.returncode}"
        results.error("duplication", f"jscpd duplication ratchet failed: {detail}")
