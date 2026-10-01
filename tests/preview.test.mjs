import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewWorkerName } from '../scripts/preview-name.mjs';

test('previews cannot target production and Worker names stay valid and stable', () => {
  assert.throws(() => previewWorkerName('main'));
  assert.throws(() => previewWorkerName(''));
  const name = previewWorkerName('feature/readability-ai-previews');
  assert.ok(name.length <= 54);
  assert.equal(name, previewWorkerName('feature/readability-ai-previews'));
  assert.match(name, /^wallball-preview-[a-z0-9-]+$/);
  assert.ok(previewWorkerName('feature/' + 'a'.repeat(300)).length <= 54);
});

test('different branches with the same slug get isolated preview Workers', () => {
  assert.notEqual(previewWorkerName('feature/a'), previewWorkerName('feature-a'));
  assert.notEqual(previewWorkerName('fix/one'), previewWorkerName('fix/two'));
});
