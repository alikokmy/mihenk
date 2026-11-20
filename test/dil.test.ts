// Asama 15 kabul olcutu: her ileti iki dilde var (eksik ceviriyi bulan test); dil degisince ayni komutun ciktisi o dilde;
// kod tanimlayicilari ASCII kaliyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYARLAR, ayarYaz } from '../src/ayar.js';
import { Defter } from '../src/defter.js';
import { dilAyarla, METINLER } from '../src/dil.js';
import { kur } from '../src/kur.js';
import { raporHtml } from '../src/rapor.js';

const BURASI = dirname(fileURLToPath(import.meta.url));
const CLI = join(BURASI, '..', 'src', 'cli.js');
const KAYNAK = join(BURASI, '..', '..', 'src');
const TURKCE_HARF = /[ğüşıöçĞÜŞİÖÇ]/;

test('KABUL: katalogdaki her ileti iki dilde dolu ve yer tutuculari ayni', () => {
  const yer = (s: string): string[] => [...s.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!).sort();
  for (const [anahtar, m] of Object.entries(METINLER)) {
    assert.ok(m.tr.trim() !== '' && m.en.trim() !== '', `${anahtar}: bos ceviri`);
    assert.deepEqual(yer(m.en), yer(m.tr), `${anahtar}: yer tutucular farkli`);
    if (!anahtar.startsWith('r_')) assert.ok(!TURKCE_HARF.test(m.en), `${anahtar}: Ingilizce metinde Turkce harf`);
  }
  for (const a of AYARLAR) {
    for (const alan of ['aciklama', 'amac', 'sonuc', 'varsayilan_aciklama'] as const) {
      assert.ok(a[alan].tr && a[alan].en && !TURKCE_HARF.test(a[alan].en), `${a.ad}.${alan}`);
    }
  }
});

test('KABUL: kullaniciya ileti basan dosyalarda katalog disi duz metin yok', () => {
  // Bu dosyalarda console.log / console.error / yaz / throw new Error dogrudan metin almaz; t(...) ile katalogdan alir.
  const dosyalar = ['cli.ts', 'ayar-cli.ts', 'surucu.ts', 'oneri.ts', 'rapor.ts', 'kaldir.ts', 'ayar.ts', 'geri.ts', 'uyanik.ts'];
  const duz = /(console\.(log|error)|\byaz|process\.stdout\.write)\(\s*[`'"][^`'"]*[A-Za-z]{3}|throw new Error\(\s*[`'"]/;
  const ihlaller: string[] = [];
  for (const d of dosyalar) {
    readFileSync(join(KAYNAK, d), 'utf8').split('\n').forEach((satir, i) => {
      if (duz.test(satir) && !satir.includes('// dil-disi')) ihlaller.push(`${d}:${i + 1}: ${satir.trim()}`);
    });
  }
  assert.deepEqual(ihlaller, []);
});

test('kod tanimlayicilari ASCII: kaynak dosyalarda Turkce harf yalniz dizge ve yorumlarda', () => {
  for (const d of readdirSync(KAYNAK).filter((x) => x.endsWith('.ts'))) {
    const govde = readFileSync(join(KAYNAK, d), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '');
    assert.ok(!TURKCE_HARF.test(govde) && !/[^\x00-\x7F]/.test(govde), `${d}: ASCII disi tanimlayici`);
  }
});

test('KABUL: dil "en" secilince ayni komutlarin ciktisi Ingilizce; "tr"de Turkce', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-dil-'));
  kur(kok, { esitle: true });
  const kos = (...a: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...a, '--hedef', kok], { encoding: 'utf8' });
  const trListe = kos('ayar').stdout;
  assert.match(trListe, /Amac: /);
  ayarYaz(kok, { dil: 'en' });
  const enListe = kos('ayar').stdout;
  assert.match(enListe, /Purpose: /);
  assert.match(enListe, /\[ON    \] kapi/);
  assert.doesNotMatch(enListe, /Amac:|Varsayilan|Sonuc:/);
  assert.match(kos('geri-al', '99').stderr, /mihenk geri-al: job 99 has no snapshot/);
  const kaldir = kos('kaldir').stdout;
  assert.match(kaldir, /Removing mihenk from this project/);
  assert.match(kaldir, /Done\. To install again: mihenk kur/);
});

test('"sistem": isletim sisteminin dili Ingilizceyse Ingilizce', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-dil-sistem-'));
  ayarYaz(kok, { dil: 'sistem' });
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'rapor', '--hedef', kok], { encoding: 'utf8', env: { ...process.env, LANG: 'en_US.UTF-8' } });
  assert.match(r.stdout, /No ledger in this folder/);
  const r2 = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'rapor', '--hedef', kok], { encoding: 'utf8', env: { ...process.env, LANG: 'tr_TR.UTF-8' } });
  assert.match(r2.stdout, /Bu klasorde defter yok/);
});

test('rapor Ingilizce: sayfa dili en, metin Ingilizce ve Turkce harf yok', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-dil-rapor-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  const d = new Defter(kok);
  const is = d.isAc({ tur: 't', soru: 'Fix the sum function', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'kilo', model: 'm' });
  await d.hukumVer({ is_id: is.id });
  d.kapat();
  dilAyarla('en');
  try {
    const { html } = raporHtml(kok);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /1 of 1 jobs succeeded/);
    assert.match(html, /Succeeded<\/span> Job 1/);
    const gorunen = html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
    assert.ok(!TURKCE_HARF.test(gorunen), gorunen.match(TURKCE_HARF)?.[0]);
  } finally {
    dilAyarla('tr');
  }
});
