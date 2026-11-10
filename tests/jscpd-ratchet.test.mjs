// scripts/jscpd-ratchet.mjs (added by #1031, wired into the quality gate by
// #1041) had zero test coverage: the Python wrapper that invokes it
// (tests/test_validate_marketplace_duplication.py) always mocks the
// subprocess call, so the ratchet's own pass/fail/notice branches were never
// exercised anywhere. These tests cover evaluateRatchet() directly.
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRatchet, runRatchet } from '../scripts/jscpd-ratchet.mjs';

// runRatchet() is the file I/O + subprocess + temp-dir-cleanup glue around
// evaluateRatchet(). It was never exercised anywhere: the Python wrapper
// (tests/test_validate_marketplace_duplication.py) always stubs out this
// whole file's contents before invoking it as a subprocess. These tests
// inject fakes for spawnSync/readFileSync/mkdtempSync/rmSync so the glue
// itself is covered without shelling out to npx/jscpd.
test('runRatchet reads the baseline, runs jscpd, parses the report, and cleans up the temp dir', () => {
  const calls = [];
  const { exitCode, lines } = runRatchet({
    mkdtempSync: (prefix) => {
      calls.push(['mkdtempSync', prefix]);
      return '/tmp/jscpd-fake';
    },
    spawnSync: (cmd, args, opts) => {
      calls.push(['spawnSync', cmd, args, opts]);
      return { error: undefined };
    },
    readFileSync: (path) => {
      calls.push(['readFileSync', path]);
      if (path === 'jscpd-baseline.json') return JSON.stringify({ clones: 10 });
      return JSON.stringify({ statistics: { total: { clones: 12 } } });
    },
    rmSync: (path, opts) => {
      calls.push(['rmSync', path, opts]);
    },
  });

  assert.equal(exitCode, 1);
  assert.ok(lines.some((line) => line.includes('12 clone(s) found, baseline 10')));
  assert.deepEqual(calls[0], ['readFileSync', 'jscpd-baseline.json']);
  assert.equal(calls.at(-1)[0], 'rmSync');
  assert.equal(calls.at(-1)[1], '/tmp/jscpd-fake');
});

test('runRatchet re-throws the spawnSync error and still cleans up the temp dir', () => {
  const rmCalls = [];
  assert.throws(
    () =>
      runRatchet({
        mkdtempSync: () => '/tmp/jscpd-fake-2',
        spawnSync: () => ({ error: new Error('npx not found') }),
        readFileSync: () => JSON.stringify({ clones: 10 }),
        rmSync: (path) => rmCalls.push(path),
      }),
    /npx not found/,
  );
  assert.deepEqual(rmCalls, ['/tmp/jscpd-fake-2']);
});

test('evaluateRatchet fails when clones exceed the baseline', () => {
  const { exitCode, lines } = evaluateRatchet(12, 10);

  assert.equal(exitCode, 1);
  assert.ok(lines.some((line) => line.includes('12 clone(s) found, baseline 10')));
  assert.ok(lines.some((line) => line.startsWith('::error::') && line.includes('12 clones > baseline 10')));
});

test('evaluateRatchet notices (but does not fail) when clones drop below the baseline', () => {
  const { exitCode, lines } = evaluateRatchet(8, 10);

  assert.equal(exitCode, 0);
  assert.ok(lines.some((line) => line.startsWith('::notice::') && line.includes('lower "clones" in jscpd-baseline.json to 8')));
});

test('evaluateRatchet passes quietly when clones match the baseline', () => {
  const { exitCode, lines } = evaluateRatchet(10, 10);

  assert.equal(exitCode, 0);
  assert.ok(!lines.some((line) => line.startsWith('::error::') || line.startsWith('::notice::')));
});
