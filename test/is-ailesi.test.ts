// Asama 33 kabul olcutu (metamorfik karari 2, 2026-11-21): bagli isler tek aile; aile kaydi bolme plani ister [K10]. Eski defter (aile
// sutunlari yok) acilmaya ve okunmaya devam eder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Defter } from '../src/defter.js';

const GIRDI = { tur: 'hata_duzeltme', soru: 'Kok nedeni ayni iki hatayi duzelt', beklenti: 'iki test gecer', yanlissa: 'biri kalir', dogrulama_komutu: 'node -v', ajan: 'claude', model: 'm' };

test('KABUL aile kaydi bolme plani olmadan acilmaz; plani olan aile kaydi acilir', () => {
  const d = new Defter(mkdtempSync(join(tmpdir(), 'mihenk-aile-')));
  try {
    assert.throws(() => d.isAc({ ...GIRDI, aile: 'tarih-ayristirma' }), /aile kaydi bolme plani ister/);
    assert.throws(() => d.isAc({ ...GIRDI, aile: 'tarih-ayristirma', bolme_plani: '   ' }), /bolme plani ister/);
    const is = d.isAc({ ...GIRDI, aile: 'tarih-ayristirma', bolme_plani: 'once ayristirici, sonra bicimlendirici' });
    assert.deepEqual([is.aile, is.bolme_plani], ['tarih-ayristirma', 'once ayristirici, sonra bicimlendirici']);
    // Ailesiz is eskisi gibi.
    const tek = d.isAc(GIRDI);
    assert.deepEqual([tek.aile, tek.bolme_plani], [null, null]);
  } finally {
    d.kapat();
  }
});

test('eski defter (aile sutunlari yok) acilir, eski isler okunur, yeni aile isi yazilir', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-aile-eski-'));
  const d1 = new Defter(kok);
  const eski = d1.isAc(GIRDI).id;
  d1.kapat();
  // Surum 0.6 defterini taklit et: yeni sutunlari kaldir.
  const db = new DatabaseSync(join(kok, '.mihenk', 'defter.db'));
  db.exec('ALTER TABLE isler DROP COLUMN aile; ALTER TABLE isler DROP COLUMN bolme_plani;');
  db.close();
  const d2 = new Defter(kok);
  try {
    assert.equal(d2.rapor({ is_id: eski }).is!.soru, GIRDI.soru);
    assert.equal(d2.isAc({ ...GIRDI, aile: 'a', bolme_plani: 'b' }).aile, 'a');
  } finally {
    d2.kapat();
  }
});

test('MCP is_ac aile ve bolme planini kabul eder; ajan yonergesi aileyi anlatir', () => {
  const sunucu = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'sunucu.ts'), 'utf8');
  assert.match(sunucu, /aile: z\.string\(\)\.optional\(\)/);
  assert.match(sunucu, /bolme_plani: z\.string\(\)\.optional\(\)/);
  const skill = readFileSync(join(import.meta.dirname, '..', '..', 'paket', 'skills', 'mihenk-is-ailesi', 'SKILL.md'), 'utf8');
  assert.match(skill, /\[K10\]/);
  assert.match(skill, /\[K11\]/);
});
