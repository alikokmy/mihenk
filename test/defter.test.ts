// Defter durum makinesinin denetimleri. Her ret kuralinin karsisinda bir test durur (Ilke 1).
// Kabul olcutu 1: kayitsiz baslatma ve kanitsiz kapatma reddediliyor. Kabul olcutu 2: dogrulamasi kalan is kapanmiyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Defter, type IsGirdisi } from '../src/defter.js';
import { Ret } from '../src/hata.js';

function ortam(): { kok: string; defter: Defter } {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-defter-'));
  writeFileSync(join(kok, 'gecer.js'), 'console.log("3 test gecti"); process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'console.error("1 test kaldi"); process.exit(1);');
  writeFileSync(join(kok, 'yavas.js'), 'setTimeout(() => process.exit(0), 30000);');
  writeFileSync(join(kok, 'gurultu.js'), 'for (let i = 0; i < 3000; i++) console.log("satir " + i + " " + "x".repeat(80)); console.log("SON SATIR");');
  return { kok, defter: new Defter(kok) };
}

function girdi(ek: Partial<IsGirdisi> = {}): IsGirdisi {
  return {
    tur: 'hata_duzeltme',
    soru: 'Toplama islevi negatif sayida yanlis mi?',
    beklenti: 'Duzeltmeden sonra tum testler gecer.',
    yanlissa: 'Negatif girdili test kalir.',
    dogrulama_komutu: 'node gecer.js',
    ajan: 'test-ajani',
    model: 'test-modeli',
    ...ek,
  };
}

function retBekle(f: () => unknown, kod: string): void {
  assert.throws(f, (e: unknown) => e instanceof Ret && e.kod === kod, `beklenen ret: ${kod}`);
}

async function retBekleAsenk(f: () => Promise<unknown>, kod: string): Promise<void> {
  await assert.rejects(f, (e: unknown) => e instanceof Ret && e.kod === kod, `beklenen ret: ${kod}`);
}

// ---- is_ac: kayit kurallari ----

test('is_ac: tam kayit acilir, durum acik, baslangic zamani dolu', () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  assert.equal(is.durum, 'acik');
  assert.equal(is.deneme_sayisi, 0);
  assert.ok(is.baslangic);
  assert.equal(is.bitis, null);
  assert.equal(is.ajan, 'test-ajani');
  defter.kapat();
});

test('ret: is_ac zorunlu alanlardan biri bossa kayit acilmaz', () => {
  const { defter } = ortam();
  for (const alan of ['tur', 'soru', 'beklenti', 'yanlissa', 'dogrulama_komutu', 'ajan', 'model'] as const) {
    retBekle(() => defter.isAc(girdi({ [alan]: '  ' })), 'EKSIK_ALAN');
  }
  assert.equal(defter.rapor({}).ozet.toplam, 0);
  defter.kapat();
});

test('ret: is_ac uzun on kayit kabul etmez (kayit kisa tutulur)', () => {
  const { defter } = ortam();
  retBekle(() => defter.isAc(girdi({ soru: 'x'.repeat(1001) })), 'COK_UZUN');
  defter.kapat();
});

test('ret: is_ac gecersiz is turu, gecersiz zaman asimi', () => {
  const { defter } = ortam();
  retBekle(() => defter.isAc(girdi({ tur: 'Hata Duzeltme!' })), 'GECERSIZ_DEGER');
  retBekle(() => defter.isAc(girdi({ zaman_asimi_sn: 0 })), 'GECERSIZ_DEGER');
  retBekle(() => defter.isAc(girdi({ zaman_asimi_sn: 999_999 })), 'GECERSIZ_DEGER');
  defter.kapat();
});

test('ret: is_ac izinsiz ya da kabuk karakterli dogrulama komutuyla kayit acmaz', () => {
  const { defter } = ortam();
  retBekle(() => defter.isAc(girdi({ dogrulama_komutu: 'curl http://ornek.test' })), 'KOMUT_IZINSIZ');
  retBekle(() => defter.isAc(girdi({ dogrulama_komutu: 'node gecer.js && node kalir.js' })), 'KABUK_KARAKTERI');
  assert.equal(defter.rapor({}).ozet.toplam, 0);
  defter.kapat();
});

// ---- kayitsiz baslatma ----

test('ret: kaydi olmayan ise kanit eklenmez, karar yazilmaz, hukum verilmez (kayitsiz baslatma)', async () => {
  const { defter } = ortam();
  retBekle(() => defter.kanitEkle({ is_id: 999, icerik: 'isi yaptim' }), 'KAYIT_YOK');
  retBekle(
    () => defter.kararYaz({ is_id: 999, konu: 'k', secenekler: ['a', 'b'], secilen: 'a', karsi_gorus: 'b daha hizli' }),
    'KAYIT_YOK',
  );
  await retBekleAsenk(() => defter.hukumVer({ is_id: 999 }), 'KAYIT_YOK');
  defter.kapat();
});

// ---- hukum: kaniti sunucu uretir ----

test('hukum_ver: dogrulama gecerse is gecti diye kapanir; kanit sunucu kaynaklidir', async () => {
  const { kok, defter } = ortam();
  const is = defter.isAc(girdi());
  const h = await defter.hukumVer({ is_id: is.id });
  assert.equal(h.kapandi, true);
  assert.equal(h.durum, 'gecti');
  assert.equal(h.dogrulama.gecti, true);
  assert.equal(h.dogrulama.cikis_kodu, 0);
  assert.match(h.dogrulama.cikti_ozeti, /3 test gecti/);
  const r = defter.rapor({ is_id: is.id });
  assert.equal(r.is?.durum, 'gecti');
  assert.ok(r.is?.bitis);
  // Gecen dogrulama kararsizlik bekcisince bir kez daha kosulur (Asama 10): iki sunucu kaniti.
  assert.equal(r.kanitlar?.length, 2);
  assert.equal(r.kanitlar?.[0]?.kaynak, 'sunucu');
  assert.match(r.kanitlar?.[1]?.cikti_ozeti ?? '', /^\[tekrar kosusu\]/);
  assert.ok(existsSync(join(kok, r.kanitlar?.[0]?.cikti_dosyasi ?? 'yok')));
  defter.kapat();
});

test('KABUL 2: dogrulama komutu kalan is kapanmaz, acik kalir, deneme sayilir', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node kalir.js' }));
  const h = await defter.hukumVer({ is_id: is.id });
  assert.equal(h.kapandi, false);
  assert.equal(h.durum, 'acik');
  assert.equal(h.dogrulama.gecti, false);
  assert.equal(h.dogrulama.cikis_kodu, 1);
  assert.match(h.dogrulama.cikti_ozeti, /1 test kaldi/);
  const r = defter.rapor({ is_id: is.id });
  assert.equal(r.is?.durum, 'acik');
  assert.equal(r.is?.bitis, null);
  assert.equal(r.is?.deneme_sayisi, 1);
  defter.kapat();
});

test('hukum_ver: is duzeltilince ikinci denemede kapanir, deneme sayisi 2', async () => {
  const { kok, defter } = ortam();
  writeFileSync(join(kok, 'degisen.js'), 'process.exit(1);');
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node degisen.js' }));
  assert.equal((await defter.hukumVer({ is_id: is.id })).kapandi, false);
  writeFileSync(join(kok, 'degisen.js'), 'process.exit(0);');
  const h = await defter.hukumVer({ is_id: is.id });
  assert.equal(h.durum, 'gecti');
  assert.equal(h.deneme_sayisi, 2);
  defter.kapat();
});

test('KABUL 1: ajanin beyani kanit sayilmaz; "testler gecti" notu isi kapatmaz', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node kalir.js' }));
  defter.kanitEkle({ is_id: is.id, icerik: 'Butun testler gecti, is bitti.' });
  const r = defter.rapor({ is_id: is.id });
  assert.equal(r.is?.durum, 'acik');
  assert.equal(r.kanitlar?.[0]?.kaynak, 'ajan');
  const h = await defter.hukumVer({ is_id: is.id });
  assert.equal(h.kapandi, false, 'beyan var ama dogrulama kaldi: is kapanmamali');
  defter.kapat();
});

test('hukum_ver: zaman asimi gecti sayilmaz, is acik kalir', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node yavas.js', zaman_asimi_sn: 1 }));
  const h = await defter.hukumVer({ is_id: is.id });
  assert.equal(h.kapandi, false);
  assert.equal(h.dogrulama.zaman_asimi, true);
  assert.equal(h.dogrulama.gecti, false);
  defter.kapat();
});

// ---- kaldi / belirsiz ----

test('ret: kaldi ve belirsiz hukmu gerekcesiz verilmez', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node kalir.js' }));
  await retBekleAsenk(() => defter.hukumVer({ is_id: is.id, hukum: 'kaldi' }), 'GEREKCE_YOK');
  await retBekleAsenk(() => defter.hukumVer({ is_id: is.id, hukum: 'belirsiz', gerekce: ' ' }), 'GEREKCE_YOK');
  assert.equal(defter.rapor({ is_id: is.id }).is?.deneme_sayisi, 0, 'gerekcesiz istek dogrulamayi kosturmamali');
  defter.kapat();
});

test('hukum_ver kaldi: dogrulama kaliyorsa is gerekceyle "kaldi" diye kapanir', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node kalir.js' }));
  const h = await defter.hukumVer({ is_id: is.id, hukum: 'kaldi', gerekce: 'Uc denemede cozulemedi.' });
  assert.equal(h.kapandi, true);
  assert.equal(h.durum, 'kaldi');
  assert.equal(defter.rapor({ is_id: is.id }).is?.gerekce, 'Uc denemede cozulemedi.');
  defter.kapat();
});

test('ret: dogrulama gecerken is "kaldi" diye kapatilamaz (hukum kanitla celisir)', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  await retBekleAsenk(() => defter.hukumVer({ is_id: is.id, hukum: 'kaldi', gerekce: 'vazgectim' }), 'HUKUM_CELISKILI');
  assert.equal(defter.rapor({ is_id: is.id }).is?.durum, 'acik');
  defter.kapat();
});

test('hukum_ver belirsiz: gerekceyle kapanir, dogrulama sonucu yine kayda girer', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  const h = await defter.hukumVer({ is_id: is.id, hukum: 'belirsiz', gerekce: 'Test geciyor ama asil durumu olcmuyor.' });
  assert.equal(h.durum, 'belirsiz');
  assert.equal(h.dogrulama.gecti, true);
  assert.equal(defter.rapor({ is_id: is.id }).kanitlar?.[0]?.kaynak, 'sunucu');
  defter.kapat();
});

test('ret: gecersiz hukum degeri', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  await retBekleAsenk(() => defter.hukumVer({ is_id: is.id, hukum: 'bitti' as never }), 'GECERSIZ_DEGER');
  defter.kapat();
});

test('ret: surucunun actigi iste hukmu ajan veremez; surucu verir (ajan not ekleyebilir)', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi({ istemci: 'mihenk-surucu', etiket: 'liste-1' }));
  await retBekleAsenk(() => defter.hukumVer({ is_id: is.id }), 'SURUCU_ISI');
  await retBekleAsenk(() => defter.hukumVer({ is_id: is.id, hukum: 'belirsiz', gerekce: 'ajan kapatmak istedi' }), 'SURUCU_ISI');
  assert.equal(defter.rapor({ is_id: is.id }).is?.durum, 'acik');
  assert.equal(defter.rapor({ is_id: is.id }).is?.deneme_sayisi, 0, 'reddedilen istek dogrulamayi kosturmamali');
  defter.kanitEkle({ is_id: is.id, icerik: 'ajanin notu' });
  assert.equal((await defter.hukumVer({ is_id: is.id, surucu: true })).durum, 'gecti');
  assert.equal(defter.etiketleBul('liste-1')?.id, is.id);
  defter.kapat();
});

// ---- kullanim ve maliyet (Asama 5) ----

const oturum = (isId: number, ek: Record<string, unknown> = {}) => ({
  is_id: isId, ajan: 'claude', model: 'model-a', oturum: 1, sure_ms: 2000, girdi: 100, onbellek_okuma: 1000, onbellek_yazma: 50, cikti: 20,
  maliyet_usd: 0.05 as number | null, ...ek,
});

test('kullanim: oturumlar ise baglanir, toplamlari is ve defter duzeyinde dogru', () => {
  const { defter } = ortam();
  const a = defter.isAc(girdi());
  const b = defter.isAc(girdi());
  defter.kullanimEkle(oturum(a.id));
  defter.kullanimEkle(oturum(a.id, { oturum: 2, sure_ms: 3000, girdi: 10, cikti: 5, maliyet_usd: 0.02 }));
  defter.kullanimEkle(oturum(b.id, { maliyet_usd: 0.1 }));
  const r = defter.rapor({ is_id: a.id });
  assert.deepEqual(r.is?.kullanim_toplami, {
    oturum: 2, ajan_sure_sn: 5, girdi: 110, onbellek_okuma: 2000, onbellek_yazma: 100, cikti: 25, maliyet_usd: 0.07, maliyeti_bilinmeyen_oturum: 0,
  });
  assert.equal(r.kullanimlar?.[0]?.maliyet_kaynagi, 'arac');
  assert.equal(r.kullanim.maliyet_usd, 0.17);
  assert.equal(defter.rapor({}).isler?.find((i) => i.id === b.id)?.maliyet_usd, 0.1);
  defter.kapat();
});

test('kullanim: arac maliyet bildirmezse uydurulmaz; fiyat tablosu varsa hesaplanir ve kaynagi yazilir', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-fiyat-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'mihenk.json'), JSON.stringify({ fiyatlar: { 'model-a': { girdi: 3, cikti: 15, onbellek_okuma: 0.3, onbellek_yazma: 3.75 } } }));
  const defter = new Defter(kok);
  const is = defter.isAc(girdi());
  defter.kullanimEkle(oturum(is.id, { model: 'bilinmeyen-model', maliyet_usd: null }));
  let t = defter.rapor({ is_id: is.id }).is?.kullanim_toplami;
  assert.equal(t?.maliyet_usd, null);
  assert.equal(t?.maliyeti_bilinmeyen_oturum, 1);
  const k = defter.kullanimEkle(oturum(is.id, { oturum: 2, maliyet_usd: null }));
  // Elle: (100*3 + 20*15 + 1000*0.3 + 50*3.75) / 1e6 = (300 + 300 + 300 + 187.5) / 1e6 = 0.0010875
  assert.equal(k.maliyet_kaynagi, 'fiyat_tablosu');
  assert.ok(Math.abs((k.maliyet_usd ?? 0) - 0.0010875) < 1e-12, String(k.maliyet_usd));
  t = defter.rapor({ is_id: is.id }).is?.kullanim_toplami;
  assert.equal(t?.maliyeti_bilinmeyen_oturum, 1, 'bilinmeyen oturum gizlenmez');
  defter.kapat();
});

test('ret: kullanim kaydi kayitsiz ise yazilmaz, eksi ya da kesirli token kabul etmez; veritabaninda degistirilemez', () => {
  const { kok, defter } = ortam();
  retBekle(() => defter.kullanimEkle(oturum(999)), 'KAYIT_YOK');
  const is = defter.isAc(girdi());
  retBekle(() => defter.kullanimEkle(oturum(is.id, { girdi: -1 })), 'GECERSIZ_DEGER');
  retBekle(() => defter.kullanimEkle(oturum(is.id, { cikti: 1.5 })), 'GECERSIZ_DEGER');
  retBekle(() => defter.kullanimEkle(oturum(is.id, { maliyet_usd: -0.01 })), 'GECERSIZ_DEGER');
  defter.kullanimEkle(oturum(is.id));
  const ham = new DatabaseSync(join(kok, '.mihenk', 'defter.db'));
  assert.throws(() => ham.exec('UPDATE kullanim SET maliyet_usd = 0'), /degismez/);
  ham.close();
  defter.kapat();
});

// ---- kapali is degismez ----

test('ret: kapali ise kanit eklenmez, karar yazilmaz, yeniden hukum verilmez', async () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  await defter.hukumVer({ is_id: is.id });
  retBekle(() => defter.kanitEkle({ is_id: is.id, icerik: 'sonradan not' }), 'IS_KAPALI');
  retBekle(
    () => defter.kararYaz({ is_id: is.id, konu: 'k', secenekler: ['a', 'b'], secilen: 'a', karsi_gorus: 'b' }),
    'IS_KAPALI',
  );
  await retBekleAsenk(() => defter.hukumVer({ is_id: is.id }), 'IS_KAPALI');
  defter.kapat();
});

// ---- karar notu ----

test('karar_yaz: secenekler, secilen ve karsi gorus kayda girer', () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  defter.kararYaz({
    is_id: is.id, konu: 'Depolama', secenekler: ['node:sqlite', 'better-sqlite3'], secilen: 'node:sqlite',
    karsi_gorus: 'better-sqlite3 daha olgun.',
  });
  const r = defter.rapor({ is_id: is.id });
  assert.equal(r.kararlar?.length, 1);
  assert.deepEqual(r.kararlar?.[0]?.secenekler, ['node:sqlite', 'better-sqlite3']);
  defter.kapat();
});

test('ret: karar_yaz karsi gorussuz, secimsiz ya da tek secenekle yazilmaz', () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  const tam = { is_id: is.id, konu: 'k', secenekler: ['a', 'b'], secilen: 'a', karsi_gorus: 'b daha ucuz' };
  retBekle(() => defter.kararYaz({ ...tam, karsi_gorus: '' }), 'EKSIK_ALAN');
  retBekle(() => defter.kararYaz({ ...tam, secilen: '' }), 'EKSIK_ALAN');
  retBekle(() => defter.kararYaz({ ...tam, konu: '' }), 'EKSIK_ALAN');
  retBekle(() => defter.kararYaz({ ...tam, secenekler: ['a'] }), 'EKSIK_ALAN');
  defter.kapat();
});

test('ret: kanit_ekle bos ya da asiri uzun icerik kabul etmez', () => {
  const { defter } = ortam();
  const is = defter.isAc(girdi());
  retBekle(() => defter.kanitEkle({ is_id: is.id, icerik: '' }), 'EKSIK_ALAN');
  retBekle(() => defter.kanitEkle({ is_id: is.id, icerik: 'x'.repeat(4001) }), 'COK_UZUN');
  defter.kapat();
});

// ---- veritabani duzeyi: kurallar kodun cevresinden dolasilamaz ----

test('veritabani: kanitsiz is dogrudan SQL ile de kapatilamaz', () => {
  const { kok, defter } = ortam();
  const is = defter.isAc(girdi());
  defter.kanitEkle({ is_id: is.id, icerik: 'testler gecti (beyan)' });
  const ham = new DatabaseSync(join(kok, '.mihenk', 'defter.db'));
  assert.throws(() => ham.exec(`UPDATE isler SET durum = 'gecti', bitis = 'simdi' WHERE id = ${is.id}`), /dogrulama/);
  assert.throws(() => ham.exec(`UPDATE isler SET durum = 'kaldi', bitis = 'simdi' WHERE id = ${is.id}`), /dogrulama/);
  ham.close();
  assert.equal(defter.rapor({ is_id: is.id }).is?.durum, 'acik');
  defter.kapat();
});

test('veritabani: son dogrulamasi kalan is SQL ile "gecti" yapilamaz', async () => {
  const { kok, defter } = ortam();
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node kalir.js' }));
  await defter.hukumVer({ is_id: is.id });
  const ham = new DatabaseSync(join(kok, '.mihenk', 'defter.db'));
  assert.throws(() => ham.exec(`UPDATE isler SET durum = 'gecti', bitis = 'simdi' WHERE id = ${is.id}`), /gecmeden/);
  ham.close();
  defter.kapat();
});

test('veritabani: is kapali dogamaz; kapali is ve kayit alanlari degismez; kapali ise kanit girmez', async () => {
  const { kok, defter } = ortam();
  const is = defter.isAc(girdi());
  const ham = new DatabaseSync(join(kok, '.mihenk', 'defter.db'));
  assert.throws(
    () => ham.exec(`INSERT INTO isler (tur, soru, beklenti, yanlissa, dogrulama_komutu, zaman_asimi_sn, ajan, model, durum, baslangic)
      VALUES ('t', 's', 'b', 'y', 'node x.js', 60, 'a', 'm', 'gecti', 'simdi')`),
    /acik/,
  );
  assert.throws(() => ham.exec(`UPDATE isler SET dogrulama_komutu = 'node gecer.js' WHERE id = ${is.id}`), /degismez/);
  await defter.hukumVer({ is_id: is.id });
  assert.throws(() => ham.exec(`UPDATE isler SET durum = 'acik' WHERE id = ${is.id}`), /kapali/);
  assert.throws(
    () => ham.exec(`INSERT INTO kanitlar (is_id, zaman, kaynak, icerik) VALUES (${is.id}, 'simdi', 'ajan', 'not')`),
    /acik/,
  );
  ham.close();
  defter.kapat();
});

// ---- sinirli cikti ----

test('sinirli cikti: uzun dogrulama ciktisi ozetlenir, tam metin dosyada durur', async () => {
  const { kok, defter } = ortam();
  const is = defter.isAc(girdi({ dogrulama_komutu: 'node gurultu.js' }));
  const h = await defter.hukumVer({ is_id: is.id });
  assert.ok(h.dogrulama.cikti_ozeti.length <= 2000, 'ozet uzunlugu: ' + h.dogrulama.cikti_ozeti.length);
  assert.match(h.dogrulama.cikti_ozeti, /SON SATIR/);
  const tam = readFileSync(join(kok, h.dogrulama.cikti_dosyasi), 'utf8');
  assert.ok(tam.length > 200_000, 'tam cikti dosyada olmali: ' + tam.length);
  defter.kapat();
});

// ---- rapor, dokum, log ----

test('rapor: ozet sayilari ve durum suzgeci', async () => {
  const { defter } = ortam();
  const a = defter.isAc(girdi());
  defter.isAc(girdi({ dogrulama_komutu: 'node kalir.js' }));
  await defter.hukumVer({ is_id: a.id });
  const r = defter.rapor({});
  assert.deepEqual(r.ozet, { toplam: 2, acik: 1, gecti: 1, kaldi: 0, belirsiz: 0 });
  assert.equal(defter.rapor({ durum: 'acik' }).isler?.length, 1);
  retBekle(() => defter.rapor({ is_id: 12345 }), 'KAYIT_YOK');
  defter.kapat();
});

test('JSONL dokumu: her is bir satir, kanitlariyla birlikte okunur', async () => {
  const { kok, defter } = ortam();
  const a = defter.isAc(girdi());
  defter.isAc(girdi({ tur: 'belge' }));
  await defter.hukumVer({ is_id: a.id });
  const satirlar = readFileSync(join(kok, '.mihenk', 'defter.jsonl'), 'utf8').trim().split('\n').map((s) => JSON.parse(s));
  assert.equal(satirlar.length, 2);
  assert.equal(satirlar[0].durum, 'gecti');
  assert.equal(satirlar[0].kanitlar.length, 2); // dogrulama ve tekrar kosusu
  assert.equal(satirlar[0].testler_ozeti, undefined); // buyuk ozet dokume girmez
  assert.equal(satirlar[1].tur, 'belge');
  defter.kapat();
});

test('log: her islem adi ve girdisiyle basla / bitti satiri yazar; ret de loga girer', async () => {
  const { kok, defter } = ortam();
  const is = defter.isAc(girdi());
  await defter.hukumVer({ is_id: is.id });
  assert.throws(() => defter.kanitEkle({ is_id: is.id, icerik: 'gec kaldim' }));
  const log = readFileSync(join(kok, '.mihenk', 'log.jsonl'), 'utf8').trim().split('\n').map((s) => JSON.parse(s));
  for (const islem of ['is_ac', 'hukum_ver', 'kanit_ekle']) {
    const basla = log.find((l) => l.islem === islem && l.asama === 'basla');
    const bitti = log.find((l) => l.islem === islem && l.asama === 'bitti');
    assert.ok(basla && bitti, `${islem} icin basla ve bitti satiri olmali`);
    assert.equal(basla.no, bitti.no);
    assert.ok(basla.girdi, 'girdi loga yazilmali');
    assert.ok(basla.zaman && typeof bitti.sure_ms === 'number');
  }
  assert.equal(log.find((l) => l.islem === 'is_ac' && l.asama === 'basla').girdi.dogrulama_komutu, 'node gecer.js');
  const ret = log.find((l) => l.islem === 'kanit_ekle' && l.asama === 'bitti');
  assert.equal(ret.sonuc, 'ret');
  assert.equal(ret.ret_kodu, 'IS_KAPALI');
  defter.kapat();
});

// ---- ortak defter ----

test('iki ayri baglanti ayni defteri gorur (iki surecin benzetimi)', async () => {
  const { kok, defter } = ortam();
  const ikinci = new Defter(kok);
  const a = defter.isAc(girdi({ ajan: 'ajan-a' }));
  const b = ikinci.isAc(girdi({ ajan: 'ajan-b' }));
  assert.notEqual(a.id, b.id);
  assert.equal(defter.rapor({}).ozet.toplam, 2);
  assert.equal(ikinci.rapor({ is_id: a.id }).is?.ajan, 'ajan-a');
  await ikinci.hukumVer({ is_id: a.id });
  assert.equal(defter.rapor({ is_id: a.id }).is?.durum, 'gecti');
  defter.kapat();
  ikinci.kapat();
});

test('ayarlar: mihenk.json izin listesini degistirir', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-ayar-'));
  writeFileSync(join(kok, 'mihenk.json'), JSON.stringify({ izinli_programlar: ['pytest'] }));
  const defter = new Defter(kok);
  retBekle(() => defter.isAc(girdi({ dogrulama_komutu: 'node gecer.js' })), 'KOMUT_IZINSIZ');
  assert.equal(defter.isAc(girdi({ dogrulama_komutu: 'pytest -q' })).durum, 'acik');
  defter.kapat();
});
