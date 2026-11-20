// Asama 22 kabul olcutu: taklit kanca girdisiyle esikte uyari, sonra ret; farkli cagri sayaci sifirliyor; anahtar kapaliyken etkisiz;
// bekci kendisi bozulursa gecit veriyor ve bunu kaydediyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ayarYaz } from '../src/ayar.js';
import { cagriImzasi, DONGU_DUR, DONGU_UYARI } from '../src/kapi.js';

const KAPI_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'kapi-bin.js');
const cagri = (kok: string, oturum: string, arac: string, girdi: object): string =>
  spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', KAPI_BIN, 'claude', 'arac', '--kok', kok],
    { input: JSON.stringify({ session_id: oturum, tool_name: arac, tool_input: girdi }), encoding: 'utf8' }).stdout;
const reddedildi = (cikti: string): boolean => cikti.includes('"deny"');

test('cagri imzasi anahtar sirasindan bagimsiz', () => {
  assert.equal(cagriImzasi('Read', { a: 1, b: { c: 2, d: 3 } }), cagriImzasi('Read', { b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(cagriImzasi('Read', { a: 1 }), cagriImzasi('Read', { a: 2 }));
});

test('KABUL: ayni cagri 4. kerede bir kez uyarilir, 8. kereden itibaren durdurulur; farkli cagri sayaci sifirlar', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-oturum-dongu-'));
  const ayni = { command: 'npm test' };
  const sonuclar: boolean[] = [];
  for (let n = 1; n <= DONGU_DUR + 1; n++) sonuclar.push(reddedildi(cagri(kok, 's1', 'Bash', ayni)));
  const beklenen = Array.from({ length: DONGU_DUR + 1 }, (_, i) => i + 1 === DONGU_UYARI || i + 1 >= DONGU_DUR);
  assert.deepEqual(sonuclar, beklenen);
  assert.match(cagri(kok, 's1', 'Bash', ayni), /dongu durduruldu/);
  // Farkli bir cagri (or. dosya duzenleme) sayaci sifirlar; ayni komut yeniden serbest.
  assert.equal(reddedildi(cagri(kok, 's1', 'Edit', { file_path: 'a.js', old_string: 'x', new_string: 'y' })), false);
  assert.equal(reddedildi(cagri(kok, 's1', 'Bash', ayni)), false);
  // Oturumlar birbirini etkilemez.
  assert.equal(reddedildi(cagri(kok, 's2', 'Bash', ayni)), false);
  const olaylar = readFileSync(join(kok, '.mihenk', 'kapi.jsonl'), 'utf8');
  assert.match(olaylar, /dongu_uyari/);
  assert.match(olaylar, /dongu_ret/);
});

test('anahtar kapaliyken etkisiz; uyari iletisi ajana ne yapacagini soyler; Ingilizce secilince Ingilizce', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-oturum-dongu-kapali-'));
  ayarYaz(kok, { bekci_oturum_dongu: false });
  for (let n = 0; n < DONGU_DUR + 2; n++) assert.equal(reddedildi(cagri(kok, 's', 'Read', { file_path: 'a' })), false);
  const kok2 = mkdtempSync(join(tmpdir(), 'mihenk-oturum-dongu-en-'));
  let son = '';
  for (let n = 0; n < DONGU_UYARI; n++) son = cagri(kok2, 's', 'Read', { file_path: 'a' });
  assert.match(son, /farkli bir yol deneyin/);
  const kok3 = mkdtempSync(join(tmpdir(), 'mihenk-oturum-dongu-en2-'));
  ayarYaz(kok3, { dil: 'en' });
  for (let n = 0; n < DONGU_UYARI; n++) son = cagri(kok3, 's', 'Read', { file_path: 'a' });
  assert.match(son, /try a different approach/);
});

test('bekci kendisi bozulursa gecit verir ve kaydeder', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-oturum-dongu-bozuk-'));
  mkdirSync(join(kok, '.mihenk'), { recursive: true });
  writeFileSync(join(kok, '.mihenk', 'kapi'), 'dizin degil dosya'); // durum dizini yazilamaz
  assert.equal(cagri(kok, 's', 'Bash', { command: 'npm test' }), '');
  assert.match(readFileSync(join(kok, '.mihenk', 'kapi.jsonl'), 'utf8'), /kapi_hatasi/);
});
