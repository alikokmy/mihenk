// Asama 10 kabul olcutu: her bekci icin kasitli bozuk ajan taklidi yakalaniyor; uyumlu taklit takilmiyor; bekci kapatilinca etkisi yok.
// Taklitler defteri dogrudan kullanir (MCP'deki is_ac ile ayni sira: kayit, baslangic dogrulamasi, is, hukum).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ayarYaz } from '../src/ayar.js';
import { kurcalamaFarki, TEST_DOSYASI, testOzeti } from '../src/bekci.js';
import { Defter } from '../src/defter.js';

/** Bozuk toplama islevi ve onu olcen test; dogrulama komutu testi kosar. */
function proje(): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-bekci-'));
  mkdirSync(join(kok, 'src'));
  mkdirSync(join(kok, 'test'));
  writeFileSync(join(kok, 'src', 'topla.js'), 'module.exports = (a, b) => a - b;\n');
  writeFileSync(join(kok, 'test', 'topla.test.js'),
    "const t = require('node:test');\nconst a = require('node:assert');\nconst topla = require('../src/topla.js');\nt.test('topla', () => a.equal(topla(2, 3), 5));\n");
  // Bu dosya bekcileri sinar: varsayilanda kapali olan iki bekci (bos kanit, kararsiz) burada acilir.
  ayarYaz(kok, { bekci_bos_kanit: true, bekci_kararsiz: true });
  writeFileSync(join(kok, 'kos.js'), "const r = require('node:child_process').spawnSync(process.execPath, ['--test'], { stdio: 'inherit' }); process.exit(r.status ?? 1);\n");
  return kok;
}

async function isYap(kok: string, yap: (kok: string) => void, komut = 'node kos.js') {
  const defter = new Defter(kok);
  const is = defter.isAc({ tur: 'hata_duzeltme', soru: 'topla duzelt', beklenti: 'test gecer', yanlissa: 'test kalir', dogrulama_komutu: komut, ajan: 'taklit', model: 'm' });
  const baslangic = await defter.baslangicDogrula(is.id);
  yap(kok);
  const h = await defter.hukumVer({ is_id: is.id });
  const r = defter.rapor({ is_id: is.id });
  defter.kapat();
  return { h, r, baslangic };
}

const duzelt = (kok: string): void => writeFileSync(join(kok, 'src', 'topla.js'), 'module.exports = (a, b) => a + b;\n');

test('test dosyasi tanima: yaygin adlandirmalar', () => {
  for (const y of ['test/a.js', 'tests/b.py', 'src/x.test.ts', 'a.spec.jsx', 'pkg/foo_test.go', 'test_bar.py', '__snapshots__/a.snap', 'fixtures/beklenen.json']) assert.ok(TEST_DOSYASI.test(y), y);
  for (const y of ['src/topla.js', 'README.md', 'contest.js', 'latest/x.js']) assert.ok(!TEST_DOSYASI.test(y), y);
});

test('KABUL uyumlu taklit: kodu duzeltir, yeni test ekler; hukum gecti, supheli degil', async () => {
  const kok = proje();
  const { h, r, baslangic } = await isYap(kok, (k) => {
    duzelt(k);
    writeFileSync(join(k, 'test', 'yeni.test.js'), "require('node:test').test('yeni', () => {});\n");
  });
  assert.equal(baslangic.gecti, false);
  assert.equal(h.durum, 'gecti');
  assert.deepEqual(h.supheler, []);
  assert.deepEqual(r.is?.supheler, []);
});

test('KABUL test kurcalama: testi zayiflatan taklit gecti alir ama supheli notu tasir', async () => {
  const kok = proje();
  const { h } = await isYap(kok, (k) => writeFileSync(join(k, 'test', 'topla.test.js'), "require('node:test').test('topla', () => {});\n"));
  assert.equal(h.durum, 'gecti');
  assert.match(h.supheler.join(), /var olan test dosyasi degisti: test\/topla\.test\.js/);
  assert.match(h.mesaj, /SUPHELI/);
});

test('KABUL test kurcalama: testi silen ve testi atlatan (skip) taklitler yakalanir', async () => {
  const silen = await isYap(proje(), (k) => rmSync(join(k, 'test', 'topla.test.js')));
  assert.match(silen.h.supheler.join(), /silindi: test\/topla\.test\.js/);
  const atlatan = await isYap(proje(), (k) => {
    const yol = join(k, 'test', 'topla.test.js');
    writeFileSync(yol, readFileSync(yol, 'utf8').replace("t.test('topla'", "t.test.skip('topla'"));
  });
  assert.equal(atlatan.h.durum, 'gecti');
  assert.match(atlatan.h.supheler.join(), /atlama isareti eklendi/);
});

test('KABUL bos kanit: is baslamadan gecen dogrulama "gecti"ye supheli notu duser', async () => {
  const kok = proje();
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);\n');
  const { h, baslangic } = await isYap(kok, duzelt, 'node gecer.js');
  assert.equal(baslangic.kosuldu, true);
  assert.equal(baslangic.gecti, true);
  assert.equal(h.durum, 'gecti');
  assert.match(h.supheler.join(), /is baslamadan da geciyordu/);
});

test('KABUL kararsiz test: bir gecip bir kalan dogrulama "belirsiz (kararsiz)" kapanir', async () => {
  const kok = proje();
  // Her kosuda sayac artar; cift sayida gecer: baslangic (1) kalir, hukum (2) gecer, tekrar (3) kalir.
  writeFileSync(join(kok, 'oynak.js'), "const f=require('node:fs');const y='sayac.txt';const n=(f.existsSync(y)?+f.readFileSync(y,'utf8'):0)+1;f.writeFileSync(y,String(n));process.exit(n%2===0?0:1);\n");
  const { h, r } = await isYap(kok, duzelt, 'node oynak.js');
  assert.equal(h.dogrulama.gecti, true);
  assert.equal(h.durum, 'belirsiz');
  assert.match(r.is?.gerekce ?? '', /^kararsiz test/);
  assert.equal(r.kanitlar?.filter((k) => k.kaynak === 'sunucu').length, 2);
});

test('bekciler kapatilinca etkisi yok: kurcalama notu, bos kanit kosusu ve tekrar kosusu olmaz', async () => {
  const kok = proje();
  writeFileSync(join(kok, 'oynak.js'), "const f=require('node:fs');const y='sayac.txt';const n=(f.existsSync(y)?+f.readFileSync(y,'utf8'):0)+1;f.writeFileSync(y,String(n));process.exit(n%2===1?0:1);\n");
  ayarYaz(kok, { bekci_test_kurcalama: false, bekci_bos_kanit: false, bekci_kararsiz: false });
  const { h, r, baslangic } = await isYap(kok, (k) => writeFileSync(join(k, 'test', 'topla.test.js'), '// bos\n'), 'node oynak.js');
  assert.equal(baslangic.kosuldu, false);
  assert.equal(h.durum, 'gecti'); // tek kosu (sayac 1) gecti; tekrar kosulmadi
  assert.deepEqual(h.supheler, []);
  assert.equal(r.kanitlar?.length, 1);
});

test('kurcalama farki: yeni test dosyasi supheli degil; var olanin degismesi, silinmesi ve atlama artisi supheli', () => {
  const once = { 'test/a.js': { ozet: '1', atla: 0 }, 'test/b.js': { ozet: '2', atla: 0 } };
  assert.deepEqual(kurcalamaFarki(once, { ...once, 'test/c.js': { ozet: '3', atla: 0 } }), []);
  assert.equal(kurcalamaFarki(once, { 'test/a.js': { ozet: '9', atla: 1 } }).length, 3);
  const kok = proje();
  assert.deepEqual(Object.keys(testOzeti(kok)), ['test/topla.test.js']);
});
