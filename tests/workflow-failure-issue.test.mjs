import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/workflow-failure-issue.yml', import.meta.url), 'utf8');

test('failure monitor does not include itself in workflow_run', () => {
  const name = workflow.match(/^name:\s*(.+)$/m)[1].replace(/^['"]|['"]$/g, '');
  const trigger = workflow.split('  workflow_run:', 2)[1].split('\npermissions:', 1)[0];
  const workflowNames = [...trigger.matchAll(/^      - ['"]?(.+?)['"]?$/gm)].map((match) => match[1]);

  assert.ok(!workflowNames.includes(name), `workflow_run must not include its own workflow name: ${name}`);
});
