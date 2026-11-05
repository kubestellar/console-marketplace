// scripts/jscpd-ratchet.mjs (added by #1031, wired into the quality gate by
// #1041) had zero test coverage: the Python wrapper that invokes it
// (tests/test_validate_marketplace_duplication.py) always mocks the
// subprocess call, so the ratchet's own pass/fail/notice branches were never
// exercised anywhere. These tests cover evaluateRatchet() directly.
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRatchet } from '../scripts/jscpd-ratchet.mjs';

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
