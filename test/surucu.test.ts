// Surucunun denetimleri. Ajan yerine kucuk betikler kosar (model cagrisi yok): isi yapan, yapmayip "bitti" diyen,
// takilan, baglami sisiren, proje disina yazan. Adinda "KABUL" gecen testler planin Asama 3 olcutleridir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { Defter } from '../src/defter.js';
import { isKimligi, listeOku, listeyiYurut, type ListeIsi } from '../src/surucu.js';
import { uykuAyariniCoz, uykuUyarisi, uyanikTut } from '../src/uyanik.js';

const BETIKLER = mkdtempSync(join(tmpdir(), 'mihenk-sahte-ajan-'));
const ORTAK = `
import { appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const istem = process.argv[2] ?? '';
const hedef = (/HEDEF=([A-Za-z0-9_.-]+)/.exec(istem) ?? [])[1];
const burasi = dirname(fileURLToPath(import.meta.url));
appendFileSync(join(burasi, 'sayac.txt'), (hedef ?? '?') + '\\n');
const yap = () => { if (hedef) writeFileSync(hedef, 'tamam'); };
const de = (metin) => console.log(JSON.stringify({ metin }));
`;
const betik = (ad: string, govde: string): string => {
  const yol = join(BETIKLER, `${ad}.mjs`);
  writeFileSync(yol, ORTAK + govde);
  return yol;
};
const sahte = (ad: string, govde: string): AjanTanimi => {
  const yol = betik(ad, govde);
  return {
    ad,
    istemci: new RegExp(`^${ad}$`),
    komutBul: () => ({ program: process.execPath, onEk: [yol] }),
    argumanlar: (istem) => [istem],
    kullanimOku: (s) => (s && typeof s === 'object' && 'baglam' in s ? { baglam: Number((s as { baglam: unknown }).baglam) } : undefined),
    metinOku: (s) => (s && typeof s === 'object' && 'metin' in s ? String((s as { metin: unknown }).metin) : undefined),
    kullanimKatkisi: (s) => (s && typeof s === 'object' && 'kullanim' in s ? { tur: 'artis' as const, ...(s as { kullanim: object }).kullanim } : undefined),
  };
};

const AJANLAR: Record<string, AjanTanimi> = {
  yapan: sahte('yapan', `yap(); de('yaptim');`),
  yalanci: sahte('yalanci', `de('Butun testler gecti, is bitti.');`),
  takilan: sahte('takilan', `setTimeout(() => {}, 60000);`),
  gurultucu: sahte('gurultucu', `
if (istem.includes('DEVIR NOTU')) { yap(); de('devir notunu okudum, bitirdim'); }
else { de('cok cikti uretiyorum'); let n = 0; setInterval(() => { n += 400; console.log(JSON.stringify({ baglam: n })); }, 20); }`),
  ikincide: sahte('ikincide', `if (istem.includes('daha once denendi')) { yap(); de('ikinci denemede yaptim'); } else { de('ilk denemede yapmadim'); }`),
  disari: sahte('disari', `writeFileSync(join(process.env.MIHENK_TEST_DISARI, 'ajan-buraya-yazdi.txt'), 'x'); yap(); de('yaptim');`),
  neredeyim: sahte('neredeyim', `writeFileSync('neredeyim.txt', JSON.stringify({ cwd: process.cwd(), pwd: process.env.PWD })); yap();`),
  // Iki adimda kullanim ve maliyet bildirir (Asama 5).
  olculu: sahte('olculu', `console.log(JSON.stringify({ kullanim: { girdi: 120, onbellek_okuma: 900, onbellek_yazma: 30, cikti: 40, maliyet_usd: 0.012, model: 'sahte-model' } })); yap(); console.log(JSON.stringify({ kullanim: { girdi: 80, onbellek_okuma: 100, cikti: 10, maliyet_usd: 0.003 } }));`),
};

function proje(git = false): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-surucu-'));
  writeFileSync(join(kok, 'var.js'), "process.exit(require('node:fs').existsSync(process.argv[2]) ? 0 : 1);");
  if (git) {
    for (const a of [['init', '-q'], ['config', 'user.email', 'test@ornek.test'], ['config', 'user.name', 'Test'], ['add', '-A'], ['commit', '-q', '-m', 'baslangic']]) {
      spawnSync('git', a, { cwd: kok });
    }
  }
  return kok;
}

const is = (hedef: string, ek: Partial<ListeIsi> = {}): ListeIsi => ({
  tur: 'test', soru: `Dosyayi olustur. HEDEF=${hedef}`, beklenti: 'Dosya olusur.', yanlissa: 'Dosya yoktur.',
  dogrulama_komutu: `node var.js ${hedef}`, ...ek,
});

const sessiz = { ajanlar: AJANLAR, yaz: () => undefined, korunanDizinler: [] as string[] };
const sayac = (): string[] => (existsSync(join(BETIKLER, 'sayac.txt')) ? readFileSync(join(BETIKLER, 'sayac.txt'), 'utf8').trim().split('\n') : []);
const commitSayisi = (kok: string): number => Number(spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: kok, encoding: 'utf8' }).stdout.trim());

test('KABUL: on islik liste kullanici girisi olmadan biter; yeniden kosunca biten isler atlanir', async () => {
  const kok = proje();
  const liste = { ajan: 'yapan', isler: Array.from({ length: 10 }, (_, i) => is(`on-${i + 1}.txt`)) };
  const r = await listeyiYurut({ kok, liste, saklama: 'yok', ...sessiz });
  assert.deepEqual(r.ozet, { toplam: 10, gecti: 10, kaldi: 0, belirsiz: 0, acik: 0 });
  const defter = new Defter(kok);
  assert.equal(defter.rapor({}).ozet.gecti, 10);
  const ilk = defter.rapor({ is_id: 1 });
  assert.equal(ilk.is?.istemci, 'mihenk-surucu');
  assert.equal(ilk.kanitlar?.at(-1)?.kaynak, 'sunucu', 'isi kapatan kanit sunucunun kostugu dogrulamadir');
  defter.kapat();

  const once = sayac().filter((h) => h.startsWith('on-')).length;
  const r2 = await listeyiYurut({ kok, liste, saklama: 'yok', ...sessiz });
  assert.equal(r2.isler.every((i) => i.atlandi && i.durum === 'gecti'), true);
  assert.equal(sayac().filter((h) => h.startsWith('on-')).length, once, 'biten isler icin ajan yeniden kosmamali');
});

test('KABUL: takilan is listeyi durdurmaz; "takildi" diye kapanir, siradaki is yapilir', async () => {
  const kok = proje();
  const liste = { isler: [is('takilan.txt', { ajan: 'takilan' }), is('sonraki.txt', { ajan: 'yapan' })] };
  const t0 = Date.now();
  const r = await listeyiYurut({ kok, liste, saklama: 'yok', ajanZamanAsimiSn: 1, denemeSiniri: 2, ...sessiz });
  assert.equal(r.isler[0]?.durum, 'kaldi');
  assert.equal(r.isler[0]?.deneme, 2);
  assert.equal(r.isler[1]?.durum, 'gecti');
  assert.ok(Date.now() - t0 < 30_000, 'takilan ajan olduruldu, 60 saniye beklenmedi');
  const defter = new Defter(kok);
  assert.match(defter.rapor({ is_id: r.isler[0]?.is_id as number }).is?.gerekce ?? '', /takildi/);
  defter.kapat();
});

test('"bitti" diyen ama yapmayan ajan: is gecmez; deneme siniri dolunca "kaldi" diye kapanir', async () => {
  const kok = proje();
  const r = await listeyiYurut({ kok, liste: { ajan: 'yalanci', isler: [is('yalan.txt')] }, saklama: 'yok', denemeSiniri: 3, ...sessiz });
  assert.equal(r.isler[0]?.durum, 'kaldi');
  assert.equal(r.isler[0]?.deneme, 3);
  assert.deepEqual(r.ozet, { toplam: 1, gecti: 0, kaldi: 1, belirsiz: 0, acik: 0 });
});

test('KABUL: baglami sisiren oturum kapatilir, yenisi devir notuyla acilir ve isi bitirir', async () => {
  const kok = proje();
  const t0 = Date.now();
  const r = await listeyiYurut({ kok, liste: { ajan: 'gurultucu', isler: [is('devir.txt')] }, saklama: 'yok', baglamEsigi: 2000, ...sessiz });
  assert.equal(r.isler[0]?.durum, 'gecti');
  assert.equal(r.isler[0]?.devir, 1);
  assert.equal(r.isler[0]?.deneme, 1, 'devir basarisiz deneme sayilmaz');
  assert.ok(Date.now() - t0 < 30_000, 'sisiren oturum olduruldu');
  const defter = new Defter(kok);
  const notlar = (defter.rapor({ is_id: r.isler[0]?.is_id as number }).kanitlar ?? []).map((k) => k.icerik ?? '');
  defter.kapat();
  assert.ok(notlar.some((n) => /baglam esigi .* asildi .* oturum devredildi/.test(n)), 'devir deftere not edilmeli');
  const olaylar = readFileSync(join(kok, '.mihenk', 'surucu.jsonl'), 'utf8').trim().split('\n').map((s) => JSON.parse(s));
  assert.equal(olaylar.filter((o) => o.olay === 'oturum_bitti' && o.esik_asildi === true).length, 1);
});

test('devir notu yeni oturuma ulasir: ilk denemede kalan is ikinci denemede gecer', async () => {
  const kok = proje();
  const r = await listeyiYurut({ kok, liste: { ajan: 'ikincide', isler: [is('ikinci.txt')] }, saklama: 'yok', ...sessiz });
  assert.equal(r.isler[0]?.durum, 'gecti');
  assert.equal(r.isler[0]?.deneme, 2);
});

test('KABUL: ajan proje disinda degisiklik yaparsa is gecersiz sayilir; liste surer', async () => {
  const kok = proje();
  const disari = proje(true); // korunan git deposu
  process.env.MIHENK_TEST_DISARI = disari;
  const liste = { isler: [is('disari.txt', { ajan: 'disari' }), is('temiz.txt', { ajan: 'yapan' })] };
  const r = await listeyiYurut({ kok, liste, saklama: 'yok', ajanlar: AJANLAR, yaz: () => undefined, korunanDizinler: [disari] });
  assert.equal(r.isler[0]?.gecersiz, true);
  assert.equal(r.isler[0]?.durum, 'belirsiz', 'dosya olussa bile is "gecti" sayilmaz');
  assert.match(r.isler[0]?.not ?? '', /proje disinda degisiklik/);
  assert.equal(r.isler[1]?.durum, 'gecti');
  assert.ok(existsSync(join(disari, 'ajan-buraya-yazdi.txt')), 'surucu korunan klasore dokunmaz, yalniz bildirir');
});

test('KABUL (Asama 5): kapanan her iste sure ve kullanim dolu; adimlar toplanir, maliyet bilinmiyorsa uydurulmaz', async () => {
  const kok = proje();
  const liste = { isler: [is('m1.txt', { ajan: 'olculu' }), is('m2.txt', { ajan: 'yapan' }), is('m3.txt', { ajan: 'takilan' })] };
  const r = await listeyiYurut({ kok, liste, saklama: 'yok', ajanZamanAsimiSn: 1, denemeSiniri: 1, ...sessiz });
  const defter = new Defter(kok);
  const ayrinti = r.isler.map((i) => defter.rapor({ is_id: i.is_id }).is!);
  defter.kapat();
  for (const is of ayrinti) {
    assert.notEqual(is.durum, 'acik');
    assert.ok(is.sure_sn !== null && is.sure_sn >= 0, `is ${is.id}: sure bos`);
    assert.ok(is.kullanim_toplami.oturum >= 1, `is ${is.id}: kullanim kaydi yok`);
    assert.ok(is.kullanim_toplami.ajan_sure_sn >= 0);
  }
  // olculu: iki adim toplanir. Elle: girdi 120+80, okuma 900+100, yazma 30+0, cikti 40+10, maliyet 0.012+0.003.
  assert.deepEqual(ayrinti[0]?.kullanim_toplami && { ...ayrinti[0].kullanim_toplami, ajan_sure_sn: 0 }, {
    oturum: 1, ajan_sure_sn: 0, girdi: 200, onbellek_okuma: 1000, onbellek_yazma: 30, cikti: 50, maliyet_usd: 0.015, maliyeti_bilinmeyen_oturum: 0,
  });
  // yapan ve takilan maliyet bildirmez: maliyet null ve "bilinmeyen" olarak sayilir, sifir yazilmaz.
  assert.equal(ayrinti[1]?.kullanim_toplami.maliyet_usd, null);
  assert.equal(ayrinti[1]?.kullanim_toplami.maliyeti_bilinmeyen_oturum, 1);
  assert.equal(ayrinti[2]?.durum, 'kaldi');
  assert.equal(ayrinti[2]?.kullanim_toplami.oturum, 1, 'takilan oturumun suresi de kayda girer');
});

test('ajan dogru klasorde baslar: calisma dizini ve PWD proje klasorudur', async () => {
  const kok = proje();
  await listeyiYurut({ kok, liste: { ajan: 'neredeyim', isler: [is('nerede.txt')] }, saklama: 'yok', ...sessiz });
  const n = JSON.parse(readFileSync(join(kok, 'neredeyim.txt'), 'utf8')) as { cwd: string; pwd: string };
  const ayni = (a: string, b: string): boolean => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
  assert.ok(ayni(n.cwd, kok), `cwd: ${n.cwd}`);
  assert.ok(ayni(n.pwd, kok), `PWD: ${n.pwd}`);
});

test('KABUL: uzak deposu olmayan projede "yerel" kipte biter: her gecen is icin commit, push yok, defter commit edilmez', async () => {
  const kok = proje(true);
  const r = await listeyiYurut({ kok, liste: { ajan: 'yapan', isler: [is('y1.txt'), is('y2.txt')] }, saklama: 'yerel', ...sessiz });
  assert.equal(r.ozet.gecti, 2);
  assert.equal(commitSayisi(kok), 3, 'baslangic + iki is');
  assert.match(r.isler[0]?.not ?? '', /yerelde saklandi/);
  const dosyalar = spawnSync('git', ['ls-files'], { cwd: kok, encoding: 'utf8' }).stdout;
  assert.ok(dosyalar.includes('y1.txt') && !dosyalar.includes('.mihenk/defter.db'), dosyalar);
});

test('saklama "yok": commit yapilmaz. "yerel_gonder": uzak depo yoksa gonderilmez, varsa gonderilir', async () => {
  const yok = proje(true);
  await listeyiYurut({ kok: yok, liste: { ajan: 'yapan', isler: [is('n1.txt')] }, saklama: 'yok', ...sessiz });
  assert.equal(commitSayisi(yok), 1);

  const uzaksiz = proje(true);
  const r1 = await listeyiYurut({ kok: uzaksiz, liste: { ajan: 'yapan', isler: [is('g1.txt')] }, saklama: 'yerel_gonder', ...sessiz });
  assert.match(r1.isler[0]?.not ?? '', /uzak depo tanimli olmadigi icin gonderilmedi/);

  const uzakli = proje(true);
  const uzak = mkdtempSync(join(tmpdir(), 'mihenk-uzak-'));
  spawnSync('git', ['init', '-q', '--bare'], { cwd: uzak });
  spawnSync('git', ['remote', 'add', 'origin', uzak], { cwd: uzakli });
  spawnSync('git', ['push', '-q', '-u', 'origin', 'HEAD'], { cwd: uzakli });
  const r2 = await listeyiYurut({ kok: uzakli, liste: { ajan: 'yapan', isler: [is('g2.txt')] }, saklama: 'yerel_gonder', ...sessiz });
  assert.match(r2.isler[0]?.not ?? '', /uzak depoya gonderildi/);
  const uzaktaki = spawnSync('git', ['rev-list', '--count', '--all'], { cwd: uzak, encoding: 'utf8' }).stdout.trim();
  assert.equal(uzaktaki, '2');
});

test('KABUL: "yerel" kip uzak depo olsa bile push yapmaz; git deposu olmayan klasorde de liste biter', async () => {
  const kok = proje(true);
  const uzak = mkdtempSync(join(tmpdir(), 'mihenk-uzak-'));
  spawnSync('git', ['init', '-q', '--bare'], { cwd: uzak });
  spawnSync('git', ['remote', 'add', 'origin', uzak], { cwd: kok });
  // Uzak depo bagli ve push'a hazir olmali; yoksa push zaten basarisiz olur ve test hicbir seyi sinamaz
  // (ilk yazimda boyleydi: kasitli bozma denemesi bunu yakaladi).
  spawnSync('git', ['push', '-q', '-u', 'origin', 'HEAD'], { cwd: kok });
  const uzakta = (): string => spawnSync('git', ['rev-list', '--count', '--all'], { cwd: uzak, encoding: 'utf8' }).stdout.trim();
  assert.equal(uzakta(), '1', 'on kosul: baslangic commit\'i uzakta');
  await listeyiYurut({ kok, liste: { ajan: 'yapan', isler: [is('p1.txt')] }, saklama: 'yerel', ...sessiz });
  assert.equal(commitSayisi(kok), 2);
  assert.equal(uzakta(), '1', 'yerel kipte uzak depoya yeni hicbir sey gitmemeli');

  const gitsiz = proje(false);
  const r = await listeyiYurut({ kok: gitsiz, liste: { ajan: 'yapan', isler: [is('d1.txt')] }, saklama: 'yerel', ...sessiz });
  assert.equal(r.isler[0]?.durum, 'gecti');
  assert.match(r.isler[0]?.not ?? '', /git deposu degil/);
});

test('kaydi acilamayan is (izinsiz komut) ve tanimsiz ajan listeyi durdurmaz', async () => {
  const kok = proje();
  const liste = { ajan: 'yapan', isler: [is('k1.txt', { dogrulama_komutu: 'curl http://ornek.test' }), is('k2.txt', { ajan: 'olmayan' }), is('k3.txt')] };
  const r = await listeyiYurut({ kok, liste, saklama: 'yok', ...sessiz });
  assert.match(r.isler[0]?.not ?? '', /kayit acilamadi/);
  assert.equal(r.isler[1]?.durum, 'kaldi');
  assert.match(r.isler[1]?.not ?? '', /ajan tanimli degil/);
  assert.equal(r.isler[2]?.durum, 'gecti');
});

test('is listesi dosyasi: okunur, bozuksa anlasilir hata verir; kimlik siradan bagimsizdir', () => {
  const kok = proje();
  mkdirSync(join(kok, 'x'));
  writeFileSync(join(kok, 'iyi.json'), JSON.stringify({ ajan: 'yapan', isler: [is('a.txt')] }));
  writeFileSync(join(kok, 'dizi.json'), JSON.stringify([is('a.txt')]));
  writeFileSync(join(kok, 'bozuk.json'), '{ isler: [');
  writeFileSync(join(kok, 'kip.json'), JSON.stringify({ saklama: 'bulut', isler: [] }));
  assert.equal(listeOku(join(kok, 'iyi.json')).isler.length, 1);
  assert.equal(listeOku(join(kok, 'dizi.json')).isler.length, 1);
  assert.throws(() => listeOku(join(kok, 'bozuk.json')), /gecerli JSON degil/);
  assert.throws(() => listeOku(join(kok, 'yok.json')), /bulunamadi/);
  assert.throws(() => listeOku(join(kok, 'kip.json')), /saklama/);
  assert.equal(isKimligi(is('a.txt')), isKimligi(is('a.txt')));
  assert.notEqual(isKimligi(is('a.txt')), isKimligi(is('b.txt')));
  assert.equal(isKimligi(is('a.txt', { kimlik: 'ozel-1' })), 'ozel-1');
});

test('KABUL: uyku acikken uyari uretilir, kapaliyken uretilmez', () => {
  const ornek = (ac: string, dc: string): string => `    GUID Alias: STANDBYIDLE\n    Possible Settings units: Seconds\n    Current AC Power Setting Index: ${ac}\n    Current DC Power Setting Index: ${dc}\n`;
  assert.deepEqual(uykuAyariniCoz(ornek('0x00000708', '0x00000384')), { priz_sn: 1800, pil_sn: 900 });
  assert.match(uykuUyarisi(uykuAyariniCoz(ornek('0x00000708', '0x00000384'))) ?? '', /UYARI: .*prizde: 30 dakika, pilde: 15 dakika.*uyanik_tut/);
  assert.equal(uykuUyarisi(uykuAyariniCoz(ornek('0x00000000', '0x00000000'))), null);
  assert.match(uykuUyarisi(uykuAyariniCoz(ornek('0x00000000', '0x00000384'))) ?? '', /prizde: hic, pilde: 15 dakika/);
  assert.equal(uykuAyariniCoz('anlasilmaz cikti'), null);
  assert.equal(uykuUyarisi(null), null);
});

test('uyanik tutma: Windows\'ta isletim sistemi istegi kabul eder, yardimci durdurulunca kapanir; baska sistemde durustce "yok" der', async () => {
  const u = await uyanikTut();
  if (process.platform === 'win32') {
    assert.equal(u.tamam, true, u.not);
    assert.match(u.not, /uyanik tutuluyor/);
  } else {
    assert.equal(u.tamam, false);
    assert.match(u.not, /desteklenmiyor/);
  }
  u.tutucu.durdur();
});
