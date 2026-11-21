// Asama 38 kabul olcutu (metamorfik karari 9, 2026-11-20): planin basinda en cok 15 satirlik "Simdi" blogu (bilgi takimi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLAN = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'IS_PLANI.md'), 'utf8');

test('KABUL planin basinda "Simdi" blogu var, ilk bolumdur ve 15 satiri asmiyor; siradaki isler ve bekleyen kararlar yazili', () => {
  const ilk = PLAN.indexOf('\n## ');
  assert.ok(PLAN.slice(ilk + 1).startsWith('## Şimdi'), 'ilk bolum Simdi');
  const son = PLAN.indexOf('\n## ', ilk + 1);
  const govde = PLAN.slice(ilk + 1, son === -1 ? undefined : son).split('\n').slice(1).filter((s) => s.trim() !== '');
  assert.ok(govde.length > 0 && govde.length <= 15, `satir: ${govde.length}`);
  for (const k of ['Sıradaki üç iş', 'Kullanıcıda bekleyen kararlar']) assert.ok(govde.some((s) => s.includes(k)), k);
});
