// Asama 35 kabul olcutu (metamorfik karari 3, 2026-11-21): esigi gecemeyen ajan kesifte seciliyor (tahmin esigi kalici dislamaz);
// cakisan aralikta sampiyon degismiyor, ayrisinca degisiyor ve gecmis iki satir; ciktida esiklerin kaynagi yaziyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter, type IsOlcumu } from '../src/defter.js';
import { ajanSec } from '../src/kesif.js';
import { oneriHesapla, oneriMetni } from '../src/oneri.js';
import { projeOnerisi } from '../src/proje-onerisi.js';
import { sampiyonUygula, type SampiyonKaydi } from '../src/sampiyon.js';

let sayac = 0;
function isler(ajan: string, n: number, gecen: number, maliyet: number): IsOlcumu[] {
  return Array.from({ length: n }, (_, i) => ({ id: ++sayac, tur: 'ozellik', ajan, model: 'm', durum: i < gecen ? 'gecti' as const : 'kaldi' as const, sure_sn: 60, deneme_sayisi: 1, maliyet_usd: maliyet }));
}
const sp = (ajan: string): Map<string, SampiyonKaydi> => new Map([['ozellik', { tur: 'ozellik', ajan, model: 'm', zaman: 'z', gerekce: 'g' }]]);

test('KABUL sampiyon: ilk oneri sampiyon olur; cakisan aralikta degismez; ayrisinca ya da aday olmaktan cikinca degisir', () => {
  // eski: 9/10 (alt ~%60, ust ~%98) pahali; yeni: 10/10 ucuz -> hesap yeniyi secer ama araliklar cakisiyor.
  const cakisan = oneriHesapla([...isler('eski', 10, 9, 0.5), ...isler('yeni', 10, 10, 0.1)]);
  assert.equal(cakisan[0]!.oneri!.ajan, 'yeni');
  const ilk = sampiyonUygula(cakisan, new Map());
  assert.deepEqual(ilk.degisimler.map((d) => d.ajan), ['yeni']);
  const korundu = sampiyonUygula(cakisan, sp('eski'));
  assert.equal(korundu.degisimler.length, 0);
  assert.equal(korundu.turler[0]!.oneri!.ajan, 'eski', 'oneri sampiyonda kaldi');
  assert.match(korundu.turler[0]!.oneri!.gerekce, /sampiyon korundu: hesaplanan aday yeni/);
  assert.equal(cakisan[0]!.oneri!.ajan, 'yeni', 'girdi degismedi');
  // eski: 40/60 (aday; %95 araligi ~%54-77), yeni: 60/60 (~%94-100) ve ucuz -> ikisi de aday, araliklar ayrisik.
  const ayrisan = oneriHesapla([...isler('eski', 60, 40, 0.5), ...isler('yeni', 60, 60, 0.1)]);
  const s = ayrisan[0]!.secenekler;
  assert.deepEqual(s.map((x) => x.durum), ['aday', 'aday'], 'kurgu: ikisi de aday');
  const a = sampiyonUygula(ayrisan, sp('eski'));
  assert.deepEqual(a.degisimler.map((d) => d.ajan), ['yeni']);
  assert.match(a.degisimler[0]!.gerekce, /alt siniri %94, sampiyonun \(eski \/ m\) ust sinirini \(%77\) asti/);
  // Sampiyon esigin altina dustu -> aday degil -> degisir.
  const dusen = oneriHesapla([...isler('eski', 10, 2, 0.01), ...isler('yeni', 10, 10, 0.1)]);
  assert.match(sampiyonUygula(dusen, sp('eski')).degisimler[0]!.gerekce, /artik aday degil/);
});

test('KABUL sampiyon gecmisi defterde: degisim yeni satir olur, eski satir silinmez ve degistirilemez', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-sampiyon-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  const d = new Defter(kok);
  try {
    const kapat = async (ajan: string, gecsin: boolean) => {
      const id = d.isAc({ tur: 'ozellik', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: gecsin ? 'node gecer.js' : 'node kalir.js', ajan, model: 'm' }).id;
      d.kullanimEkle({ is_id: id, ajan, oturum: 1, sure_ms: 1, girdi: 1, cikti: 1, onbellek_okuma: 0, onbellek_yazma: 0, maliyet_usd: 0.1 });
      await d.hukumVer(gecsin ? { is_id: id } : { is_id: id, hukum: 'kaldi', gerekce: 'olmadi' });
    };
    for (let i = 0; i < 6; i++) await kapat('eski', true);
    assert.equal(projeOnerisi(d, {})[0]!.sampiyon!.ajan, 'eski');
    assert.equal(projeOnerisi(d, {})[0]!.sampiyon!.ajan, 'eski', 'tekrar hesap satir eklemez');
    assert.equal(d.sampiyonGecmisi('ozellik').length, 1);
    // eski cokuyor (esigin altina): yeni ajan sampiyon olur.
    for (let i = 0; i < 30; i++) await kapat('eski', false);
    for (let i = 0; i < 8; i++) await kapat('yeni', true);
    assert.equal(projeOnerisi(d, {})[0]!.sampiyon!.ajan, 'yeni');
    const g = d.sampiyonGecmisi('ozellik');
    assert.deepEqual(g.map((x) => x.ajan), ['eski', 'yeni']);
    assert.match(g[1]!.gerekce, /artik aday degil/);
    const db = (d as unknown as { db: { exec(s: string): void } }).db;
    assert.throws(() => db.exec('DELETE FROM sampiyonlar'), /silinmez/);
    assert.throws(() => db.exec("UPDATE sampiyonlar SET ajan = 'x'"), /degismez/);
  } finally {
    d.kapat();
  }
});

test('KABUL esiklerin kaynagi ciktida; esigin altindaki ajan kesifte secilir (tahmin esigi kalici dislamaz)', () => {
  const olcum = [...isler('iyi', 10, 10, 0.1), ...isler('zayif', 10, 3, 0.01)];
  const [t] = oneriHesapla(olcum, { kurulu: ['iyi', 'zayif'] });
  assert.equal(t!.secenekler.find((s) => s.ajan === 'zayif')!.durum, 'esik_alti');
  assert.match(oneriMetni([t!]), /Kaynak: tahmin/);
  // Iki ajanin da 5'ten cok isi var; eskiden kesif adayi kalmazdi. Simdi esik alti olan kesif adimi alir.
  const s = ajanSec({ tur: 'ozellik', olcumler: olcum, kurulu: ['iyi', 'zayif'], sira: 5, kesifOrani: 20 })!;
  assert.deepEqual([s.ajan, s.kesif], ['zayif', true]);
  assert.match(s.neden, /esigin altinda; esik tahmin oldugu icin elenmez/);
  assert.equal(ajanSec({ tur: 'ozellik', olcumler: olcum, kurulu: ['iyi', 'zayif'], sira: 1, kesifOrani: 20 })!.ajan, 'iyi');
});
