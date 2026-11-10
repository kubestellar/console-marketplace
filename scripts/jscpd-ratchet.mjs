#!/usr/bin/env node
// Duplication ratchet: runs jscpd with .jscpd.json and fails only when the
// clone count grows past the committed baseline (jscpd-baseline.json).
// Existing debt never fails the gate; a PR that lowers duplication should
// lower the baseline in the same PR.
//
// This repo has no package.json (CI borrows console's node_modules via a
// sparse checkout — see .github/workflows/ts-unit-tests.yml), so jscpd is
// fetched on demand via `npx --yes` instead of a package.json devDependency.
// Run directly: node scripts/jscpd-ratchet.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baselinePath = 'jscpd-baseline.json';

// Pure ratchet decision, split out from main() so it can be unit-tested
// without shelling out to npx/jscpd. Mirrors the three outcomes the CLI
// below prints/exits on: increase (fail), decrease (notice), unchanged (ok).
export function evaluateRatchet(clones, baselineClones) {
  const lines = [`\njscpd ratchet: ${clones} clone(s) found, baseline ${baselineClones}`];
  if (clones > baselineClones) {
    lines.push(`::error::Duplication increased: ${clones} clones > baseline ${baselineClones}. Remove the new duplication (see clones above).`);
    return { exitCode: 1, lines };
  }
  if (clones < baselineClones) {
    lines.push(`::notice::Duplication decreased; lower "clones" in ${baselinePath} to ${clones} in this PR to ratchet.`);
  }
  return { exitCode: 0, lines };
}

// Runs jscpd and returns the same {exitCode, lines} shape as evaluateRatchet,
// with fs/child_process calls injectable so the file I/O, subprocess, and
// temp-dir cleanup glue (previously untested anywhere - see #1044) can be
// unit-tested without shelling out to npx/jscpd.
export function runRatchet({
  spawnSync: spawnSyncFn = spawnSync,
  readFileSync: readFileSyncFn = readFileSync,
  mkdtempSync: mkdtempSyncFn = mkdtempSync,
  rmSync: rmSyncFn = rmSync,
} = {}) {
  const baseline = JSON.parse(readFileSyncFn(baselinePath, 'utf8'));
  const outDir = mkdtempSyncFn(join(tmpdir(), 'jscpd-'));

  try {
    const run = spawnSyncFn(
      'npx',
      ['--yes', 'jscpd', '--config', '.jscpd.json', '--reporters', 'console,json', '--output', outDir],
      { stdio: 'inherit' },
    );
    if (run.error) throw run.error;

    const report = JSON.parse(readFileSyncFn(join(outDir, 'jscpd-report.json'), 'utf8'));
    const clones = report.statistics.total.clones;

    return evaluateRatchet(clones, baseline.clones);
  } finally {
    rmSyncFn(outDir, { recursive: true, force: true });
  }
}

function main() {
  const { exitCode, lines } = runRatchet();
  for (const line of lines) {
    if (exitCode !== 0 && line.startsWith('::error::')) {
      console.error(line);
    } else {
      console.log(line);
    }
  }
  if (exitCode !== 0) process.exit(exitCode);
}

// Only run the CLI when executed directly (`node scripts/jscpd-ratchet.mjs`),
// not when imported by tests for evaluateRatchet().
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
