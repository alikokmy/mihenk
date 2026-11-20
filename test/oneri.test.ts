// Asama 6 kabul olcutu: "sentetik defterde bilinen en iyi secenegi buluyor; az veride 'veri yetersiz' diyor".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter, type IsOlcumu } from '../src/defter.js';
import { oneriHesapla, oneriMetni, wilson } from '../src/oneri.js';

let sayac = 0;
/** n is: ilk `gecen` tanesi gecti, gerisi kaldi; her is `maliyet` USD ve `sure` sn. */
function isler(tur: string, ajan: string, model: string, n: number, gecen: number, maliyet: number | null, sure = 60): IsOlcumu[] {
  return Array.from({ length: n }, (_, i) => ({
    id: ++sayac, tur, ajan, model, durum: i < gecen ? 'gecti' : 'kaldi', sure_sn: sure, deneme_sayisi: 1, maliyet_usd: maliyet,
  }));
}

test('wilson araligi bilinen degerleri verir', () => {
  assert.deepEqual(wilson(0, 0), [0, 1]);
  const [alt, ust] = wilson(9, 10);
  assert.ok(Math.abs(alt - 0.5958) < 1e-3 && Math.abs(ust - 0.9821) < 1e-3, `${alt} ${ust}`);
  assert.ok(Math.abs(wilson(5, 5)[0] - 0.5655) < 1e-3);
});

test('sentetik defter: bilinen en iyi secenek bulunuyor; tuzak secenekler secilmiyor', () => {
  const veri = [
    ...isler('hata_duzeltme', 'ucuz', 'kotu', 10, 4, 0.01), // en ucuz ama basarisi esigin altinda
    ...isler('hata_duzeltme', 'pahali', 'iyi', 10, 10, 0.5), // hep geciyor ama basari basina 0.5 USD
    ...isler('hata_duzeltme', 'dengeli', 'iyi', 10, 9, 0.1), // BILINEN EN IYI: basari basina 1.0/9 = 0.111 USD
    ...isler('hata_duzeltme', 'yeni', 'parlak', 2, 2, 0.001), // daha ucuz ama yalniz iki is: veri yetersiz
    ...isler('hata_duzeltme', 'abonelik', 'bilinmiyor', 10, 10, null), // maliyeti bilinmiyor: karsilastirilamaz
  ];
  const [t] = oneriHesapla(veri);
  assert.equal(t!.tur, 'hata_duzeltme');
  assert.deepEqual(t!.oneri && { ajan: t!.oneri.ajan, model: t!.oneri.model }, { ajan: 'dengeli', model: 'iyi' });
  assert.match(t!.oneri!.gerekce, /9\/10 is gecti/);
  const durum = Object.fromEntries(t!.secenekler.map((s) => [s.ajan, s.durum]));
  assert.deepEqual(durum, { ucuz: 'esik_alti', pahali: 'aday', dengeli: 'aday', yeni: 'veri_yetersiz', abonelik: 'aday' });
  assert.equal(t!.secenekler.find((s) => s.ajan === 'dengeli')!.basari_basina_maliyet, 0.111111);
  assert.match(t!.not, /abonelik \/ bilinmiyor/);
});

test('az veride oneri yok: "veri yetersiz"', () => {
  const [t] = oneriHesapla([...isler('belge', 'a', 'm', 3, 3, 0.01), ...isler('belge', 'b', 'm', 4, 4, 0.02)]);
  assert.equal(t!.oneri, null);
  assert.match(t!.not, /^veri yetersiz: secenek basina en cok 4 kapanmis is var, en az 5 gerekir/);
  assert.match(oneriMetni([t!]), /ONERI YOK: veri yetersiz/);
  assert.match(oneriMetni([]), /kapanmis is yok; oneri verilemez/);
});

test('yeterli veri var ama hicbiri esigi gecmiyor: oneri yok, nedeni esik', () => {
  const [t] = oneriHesapla(isler('zor', 'a', 'm', 10, 3, 0.1));
  assert.equal(t!.oneri, null);
  assert.match(t!.not, /^esigi gecen secenek yok/);
});

test('hicbir adayin maliyeti bilinmiyorsa sure ile secilir ve bu yazilir', () => {
  const [t] = oneriHesapla([...isler('ozellik', 'yavas', 'm', 6, 6, null, 300), ...isler('ozellik', 'hizli', 'm', 6, 6, null, 30)]);
  assert.equal(t!.oneri!.ajan, 'hizli');
  assert.match(t!.oneri!.gerekce, /maliyeti bilinmiyor/);
});

test('uyum orani dusuk secenek onerilmez', () => {
  const veri = [...isler('t', 'uyumsuz', 'm', 10, 10, 0.01), ...isler('t', 'uyumlu', 'm', 10, 10, 0.05)];
  const [t] = oneriHesapla(veri, { uyum: { uyumsuz: { gecen: 10, toplam: 16 }, uyumlu: { gecen: 16, toplam: 16 } } });
  assert.equal(t!.oneri!.ajan, 'uyumlu');
  assert.equal(t!.secenekler.find((s) => s.ajan === 'uyumsuz')!.durum, 'uyum_dusuk');
});

test('rastgele sentetik defterler: bilinen en iyi secenek 50 defterin hepsinde bulunuyor', () => {
  // Gercek basari oranlari ve is basina maliyetler bilinir; en iyi = basari >= 0.85 olanlar icinde maliyet/basari en dusuk.
  // Her secenek 60 is kosar; esik 0.5. Gercek oranlar arasindaki fark ornekleme gurultusunden belirgin buyuk secildi.
  let tohum = 12345;
  const rastgele = (): number => ((tohum = (tohum * 16807) % 2147483647) / 2147483647); // Park-Miller
  const SECENEKLER = [
    { ajan: 'a', p: 0.95, maliyet: 0.3 }, // basari basina 0.316
    { ajan: 'b', p: 0.9, maliyet: 0.12 }, // basari basina 0.133: EN IYI
    { ajan: 'c', p: 0.3, maliyet: 0.01 }, // ucuz ama basarisiz
    { ajan: 'd', p: 0.85, maliyet: 0.25 }, // basari basina 0.294
  ];
  for (let d = 0; d < 50; d++) {
    const veri: IsOlcumu[] = SECENEKLER.flatMap((s) =>
      Array.from({ length: 60 }, () => ({
        id: ++sayac, tur: 'hata_duzeltme', ajan: s.ajan, model: 'm', durum: rastgele() < s.p ? 'gecti' as const : 'kaldi' as const,
        sure_sn: 60, deneme_sayisi: 1, maliyet_usd: s.maliyet * (0.8 + 0.4 * rastgele()),
      })));
    assert.equal(oneriHesapla(veri)[0]!.oneri?.ajan, 'b', `defter ${d}`);
  }
});

test('gercek defterden olcum: model aracin bildirdigi, kismi maliyet bilinmiyor sayilir, acik is girmez', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-oneri-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  const defter = new Defter(kok);
  const ac = (komut: string): number => defter.isAc({
    tur: 'hata_duzeltme', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: komut, ajan: 'claude', model: 'aracin varsayilani',
  }).id;
  const k = { ajan: 'claude', sure_ms: 1000, girdi: 1, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 1 };
  for (let i = 0; i < 5; i++) {
    const id = ac('node gecer.js');
    defter.kullanimEkle({ ...k, is_id: id, oturum: 1, model: 'claude-opus-5-5', maliyet_usd: 0.2 });
    await defter.hukumVer({ is_id: id });
  }
  const kalan = ac('node kalir.js');
  defter.kullanimEkle({ ...k, is_id: kalan, oturum: 1, model: 'claude-opus-5-5', maliyet_usd: 0.2 });
  defter.kullanimEkle({ ...k, is_id: kalan, oturum: 2, model: 'claude-opus-5-5', maliyet_usd: null });
  await defter.hukumVer({ is_id: kalan, hukum: 'kaldi', gerekce: 'cozulemedi' });
  ac('node gecer.js'); // acik kalir: olcume girmez
  const olcum = defter.olcumler();
  defter.kapat();

  assert.equal(olcum.length, 6);
  assert.ok(olcum.every((o) => o.model === 'claude-opus-5-5'));
  assert.equal(olcum.find((o) => o.id === kalan)!.maliyet_usd, null);
  const [t] = oneriHesapla(olcum);
  const s = t!.secenekler[0]!;
  assert.deepEqual([s.is_sayisi, s.gecen, s.maliyeti_bilinmeyen_is, s.basari_basina_maliyet], [6, 5, 1, null]);
  // 5/6'nin %95 alt siniri ~0.44: esigin (0.5) altinda; alti is bu kesinlik icin azdir.
  assert.equal(s.durum, 'esik_alti');
  assert.equal(t!.oneri, null);
});
