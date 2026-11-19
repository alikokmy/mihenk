import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ortalama, ortanca } from './istatistik.js';

test('ortalama: dolu liste', () => assert.equal(ortalama([2, 4, 6]), 4));
test('ortalama: bos liste 0 doner', () => assert.equal(ortalama([]), 0));
test('ortanca: sirasiz liste', () => assert.equal(ortanca([9, 1, 5]), 5));
test('ortanca: cift uzunluk', () => assert.equal(ortanca([4, 1, 3, 2]), 2.5));
