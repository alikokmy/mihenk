// Asama 37 kabul olcutu (metamorfik karari 5, 2026-11-20): bilgi komutu kalan is "gecti" + not; bilgi komutu gecerse not yok; iki takim
// betigi birlikte butun test dosyalarini tam bir kez kapsiyor.
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter } from '../src/defter.js';
import { raporHtml } from '../src/rapor.js';
import { takimlar, yalitikKos } from './takim.js';

const KAYNAK = join(import.meta.dirname, '..', '..', 'test');

test('KABUL bilgi denetimi kalirsa is yine gecer ve kayda not duser; gecerse not yok; komutu yoksa eskisi gibi', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-takim-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(3);');
  const d = new Defter(kok);
  const G = { tur: 'belge', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'claude', model: 'm' };
  try {
    const a = d.isAc({ ...G, bilgi_komutu: 'node kalir.js' }).id;
    const ra = await d.hukumVer({ is_id: a });
    assert.equal(ra.durum, 'gecti', 'bilgi takimi isi durdurmaz');
    const ka = d.rapor({ is_id: a }).is!;
    assert.match(ka.bilgi_notu ?? '', /bilgi denetimi kaldi \(node kalir\.js; cikis kodu 3\)/);
    const b = d.isAc({ ...G, bilgi_komutu: 'node gecer.js' }).id;
    await d.hukumVer({ is_id: b });
    assert.equal(d.rapor({ is_id: b }).is!.bilgi_notu, null);
    const c = d.isAc(G).id;
    await d.hukumVer({ is_id: c });
    assert.equal(d.rapor({ is_id: c }).is!.bilgi_notu, null);
    assert.throws(() => d.isAc({ ...G, bilgi_komutu: 'curl x' }), /izin listesinde degil/);
  } finally {
    d.kapat();
  }
  assert.match(raporHtml(kok).html, /data-bilgi-notu=/);
});

test('KABUL iki takim butun test dosyalarini tam bir kez kapsar; bilgi takimi listesindeki dosyalar var', () => {
  const hepsi = readdirSync(KAYNAK).filter((d) => d.endsWith('.test.ts')).sort();
  const { bilgi, engel } = takimlar();
  assert.deepEqual([...bilgi, ...engel].sort(), hepsi);
  assert.equal(bilgi.filter((x) => engel.includes(x)).length, 0);
  assert.ok(bilgi.length >= 2);
  for (const d of bilgi) assert.ok(existsSync(join(KAYNAK, d)), d);
});

test('KABUL artik denetimi: kosu kendi gecici klasorunde calisir ve onu siler; gercek gecici klasore sizan test kosuyu dusurur', () => {
  const gercek = mkdtempSync(join(tmpdir(), 'mihenk-sahte-temp-'));
  const yer = mkdtempSync(join(tmpdir(), 'mihenk-sahte-gecici-'));
  mkdirSync(join(yer, 'kosu-bayat'));
  utimesSync(join(yer, 'kosu-bayat'), new Date(Date.now() - 7 * 3600_000), new Date(Date.now() - 7 * 3600_000));
  mkdirSync(join(yer, 'kosu-taze'));
  const betik = mkdtempSync(join(tmpdir(), 'mihenk-artik-betik-'));
  const uslu = join(betik, 'uslu.test.mjs');
  const sizan = join(betik, 'sizan.test.mjs');
  writeFileSync(uslu, "import { test } from 'node:test'; import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';\ntest('u', () => { mkdtempSync(join(tmpdir(), 'mihenk-uslu-')); });\n");
  writeFileSync(sizan, "import { test } from 'node:test'; import { mkdirSync } from 'node:fs'; import { join } from 'node:path';\ntest('s', () => { mkdirSync(join(process.env.SIZINTI, 'mihenk-sizinti')); });\n");
  const a = yalitikKos([uslu], { gercek, yer, stdio: 'pipe' });
  assert.deepEqual(a, { kod: 0, artik: [], silinemedi: false, depo_degisti: false });
  assert.deepEqual(readdirSync(gercek), [], 'sistem gecici klasorune hic yazilmadi');
  assert.deepEqual(readdirSync(yer).sort(), ['kosu-taze', 'package.json'], 'kosunun kendi klasoru silindi (uslu testinki onunla gitti); 6 saatten eski kosu klasoru silindi, taze olana dokunulmadi');
  const b = yalitikKos([uslu, sizan], { gercek, yer, stdio: 'pipe', env: { SIZINTI: gercek } });
  assert.equal(b.kod, 0);
  assert.deepEqual(b.artik, ['mihenk-sizinti']);
  mkdirSync(join(gercek, 'mihenk-onceden'));
  assert.deepEqual(yalitikKos([uslu], { gercek, yer, stdio: 'pipe' }).artik, [], 'kosudan once var olan klasor artik sayilmaz');
});

test('KABUL depo bekcisi: kosu sirasinda ust klasordeki depoya commit atan test kosuyu dusurur; atmayan dusurmez', () => {
  const depo = mkdtempSync(join(tmpdir(), 'mihenk-sahte-depo-'));
  const git = (...a: string[]) => spawnSync('git', ['-C', depo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'ilk');
  const yer = join(depo, '.gecici');
  const betik = mkdtempSync(join(tmpdir(), 'mihenk-depo-betik-'));
  const uslu = join(betik, 'uslu.test.mjs');
  const ceken = join(betik, 'ceken.test.mjs');
  writeFileSync(uslu, "import { test } from 'node:test';\ntest('u', () => {});\n");
  writeFileSync(ceken, "import { test } from 'node:test'; import { spawnSync } from 'node:child_process';\ntest('c', () => { spawnSync('git', ['-C', process.env.DEPO, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'sizdi']); });\n");
  assert.equal(yalitikKos([uslu], { yer, stdio: 'pipe' }).depo_degisti, false);
  assert.equal(yalitikKos([ceken], { yer, stdio: 'pipe', env: { DEPO: depo } }).depo_degisti, true);
});
