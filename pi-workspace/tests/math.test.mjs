import test from 'node:test';
import assert from 'node:assert/strict';
import { sum, average, clamp } from '../src/math.mjs';

test('sum calculates total', () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
});

test('average handles empty and populated arrays', () => {
  assert.equal(average([]), 0);
  assert.equal(average([10, 20]), 15);
});

test('clamp restricts bounds', () => {
  assert.equal(clamp(50, 0, 100), 50);
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(150, 0, 100), 100);
});
