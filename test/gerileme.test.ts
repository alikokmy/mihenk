// Asama 11 kabul olcutu: taklit bir ajanin kendi testini gecirip baska testi bozdugu is "gecti" kapanmiyor.
// Ajan yerine kucuk betikler kosar (model cagrisi yok). Butun test takimi: ortak.txt'nin "saglam" kalmasi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { Defter } from '../src/defter.js';
import { listeyiYurut, type IsListesi } from '../src/surucu.js';

const BETIKLER = mkdtempSync(join(tmpdir(), 'mihenk-gerileme-ajan-'));
const sahte = (ad: string, govde: string): AjanTanimi => {
  const yol = join(BETIKLER, `${ad}.mjs`);
  writeFileSync(yol, `import { writeFileSync } from 'node:fs';\nconst istem = process.argv[2] ?? '';\n${govde}\n`);
  return {
    ad, istemci: new RegExp(`^${ad}$`), komutBul: () => ({ program: process.execPath, onEk: [yol] }), argumanlar: (i) => [i],
    kullanimOku: () => undefined, metinOku: () => undefined,
  };
};

const AJANLAR: Record<string, AjanTanimi> = {
  // Isini yapar (hedef.txt) ama baska bir seyi bozar (ortak.txt).
  bozan: sahte('bozan', `writeFileSync('hedef.txt', 'tamam'); writeFileSync('ortak.txt', 'bozuk');`),
  // Ilk denemede bozar; geri bildirimi alinca bozdugunu onarir.
  onaran: sahte('onaran', `writeFileSync('hedef.txt', 'tamam'); writeFileSync('ortak.txt', istem.includes('onceden gecen testleri bozdu') ? 'saglam' : 'bozuk');`),
  temiz: sahte('temiz', `writeFileSync('hedef.txt', 'tamam');`),
};

function proje(ortak = 'saglam'): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-gerileme-'));
  writeFileSync(join(kok, 'hedef-var.js'), "process.exit(require('node:fs').existsSync('hedef.txt') ? 0 : 1);");
  writeFileSync(join(kok, 'tum.js'), "const f=require('node:fs');process.exit(f.readFileSync('ortak.txt','utf8')==='saglam'?0:1);");
  writeFileSync(join(kok, 'ortak.txt'), ortak);
  ayarYaz(kok, { gerileme: 'her_iste' }); // varsayilan "gonderirken"; bu dosya her iste kosan kipi sinar
  return kok;
}

const liste = (ajan: string, ek: Partial<IsListesi> = {}): IsListesi => ({
  ajan, gerileme_komutu: 'node tum.js', ...ek,
  isler: [{ tur: 'ozellik', soru: 'hedef.txt olustur', beklenti: 'hedef.txt var', yanlissa: 'yok', dogrulama_komutu: 'node hedef-var.js' }],
});

async function yurut(kok: string, l: IsListesi) {
  const satirlar: string[] = [];
  const r = await listeyiYurut({ kok, liste: l, saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: (s) => satirlar.push(s), denemeSiniri: 3 });
  const defter = new Defter(kok);
  const is = defter.rapor({ is_id: r.isler[0]!.is_id }).is!;
  defter.kapat();
  return { r, is, satirlar };
}

test('KABUL: kendi dogrulamasini gecip baska testi bozan is "gecti" kapanmaz', async () => {
  const kok = proje();
  const { r, is, satirlar } = await yurut(kok, liste('bozan'));
  assert.notEqual(is.durum, 'gecti');
  assert.equal(is.durum, 'belirsiz');
  assert.match(is.gerekce ?? '', /gerileme: .*node tum\.js.* simdi kaliyor/);
  assert.equal(r.isler[0]!.deneme, 3);
  assert.ok(satirlar.some((s) => /Gerileme tabani: "node tum\.js" liste baslamadan geciyor/.test(s)));
  // Is kendi dogrulamasini gercekten geciyor: yakalanan sey gerilemedir.
  assert.equal(readFileSync(join(kok, 'hedef.txt'), 'utf8'), 'tamam');
});

test('bozdugunu geri bildirimle onaran ajan ikinci denemede gecer; temiz ajan ilk denemede', async () => {
  const onaran = await yurut(proje(), liste('onaran'));
  assert.equal(onaran.is.durum, 'gecti');
  assert.equal(onaran.r.isler[0]!.deneme, 2);
  const temiz = await yurut(proje(), liste('temiz'));
  assert.equal(temiz.is.durum, 'gecti');
  assert.equal(temiz.r.isler[0]!.deneme, 1);
});

test('taban liste baslamadan kaliyorsa denetim yapilamaz ve bu soylenir (bilinen sinir)', async () => {
  const { is, satirlar } = await yurut(proje('bozuk'), liste('bozan'));
  assert.ok(satirlar.some((s) => /Gerileme denetimi yok: "node tum\.js" liste baslamadan da kaliyor/.test(s)));
  assert.equal(is.durum, 'gecti');
});

test('gerileme "kapali" iken denetim yok; komut yoksa ve package.json test betigi varsa "npm test" secilir', async () => {
  const kok = proje();
  ayarYaz(kok, { gerileme: 'kapali' });
  const { is } = await yurut(kok, liste('bozan'));
  assert.equal(is.durum, 'gecti');

  const kok2 = proje();
  writeFileSync(join(kok2, 'package.json'), JSON.stringify({ scripts: { test: 'node tum.js' } }));
  const { is: is2, satirlar } = await yurut(kok2, liste('bozan', { gerileme_komutu: undefined }));
  assert.ok(satirlar.some((s) => /Gerileme tabani: "npm test"/.test(s)), satirlar.join('\n'));
  assert.equal(is2.durum, 'belirsiz');
});

test('gerileme "liste_sonunda": isler bloklanmaz, liste sonunda tam takim kalirsa uyari yazilir', async () => {
  const kok = proje();
  ayarYaz(kok, { gerileme: 'liste_sonunda' });
  const { is, satirlar } = await yurut(kok, liste('bozan'));
  assert.equal(is.durum, 'gecti');
  assert.ok(satirlar.some((s) => /listenin sonunda yeniden kosulacak/.test(s)));
  assert.ok(satirlar.some((s) => /UYARI: GERILEME: tam test takimi \(node tum\.js\) liste basinda geciyordu, simdi kaliyor/.test(s)), satirlar.join('\n'));
});

test('gerileme "gonderirken" (varsayilan): yerel kipte tam takim kosmaz; yerel_gonder kipinde kalirsa gonderilmez', async () => {
  const kok = proje();
  ayarYaz(kok, { gerileme: 'gonderirken' });
  const yerel = await yurut(kok, liste('bozan'));
  assert.ok(!yerel.satirlar.some((s) => /Gerileme tabani/.test(s)), 'yerel kipte tam takim kosmadi');

  const { spawnSync } = await import('node:child_process');
  const uzak = mkdtempSync(join(tmpdir(), 'mihenk-uzak-'));
  spawnSync('git', ['init', '-q', '--bare', uzak]);
  const kok2 = proje();
  ayarYaz(kok2, { gerileme: 'gonderirken' });
  writeFileSync(join(kok2, '.gitignore'), '.mihenk/\n');
  for (const a of [['init', '-q', '-b', 'main'], ['config', 'user.email', 'g@ornek.test'], ['config', 'user.name', 'g'], ['add', '-A'], ['commit', '-q', '-m', 'ilk'], ['remote', 'add', 'origin', uzak], ['push', '-q', '-u', 'origin', 'main']]) {
    spawnSync('git', a, { cwd: kok2 });
  }
  const satirlar: string[] = [];
  await listeyiYurut({ kok: kok2, liste: liste('bozan', { saklama: 'yerel_gonder' }), ajanlar: AJANLAR, korunanDizinler: [], yaz: (s) => satirlar.push(s), denemeSiniri: 1 });
  assert.ok(satirlar.some((s) => /GONDERILMEDI: tam test takimi kaliyor/.test(s)), satirlar.join('\n'));
  const say = (d: string) => spawnSync('git', ['rev-list', '--count', 'main'], { cwd: d, encoding: 'utf8' }).stdout.trim();
  assert.equal(say(kok2), '2', 'yerelde commit edildi');
  assert.equal(say(uzak), '1', 'uzak depoya gonderilmedi');
});

test('olcume dayali oneri: butun testler listenin buyuk payini yiyorsa daha hizli kip onerilir; ucuzsa onerilmez', async () => {
  const kok = proje();
  ayarYaz(kok, { gerileme: 'liste_sonunda' });
  writeFileSync(join(kok, 'tum.js'), "const f=require('node:fs');const t=Date.now();while(Date.now()-t<400){}process.exit(f.readFileSync('ortak.txt','utf8')==='saglam'?0:1);");
  const satirlar: string[] = [];
  await listeyiYurut({ kok, liste: liste('temiz'), saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: (s) => satirlar.push(s), denemeSiniri: 1, gerilemeOneriEsigi: { enAzMs: 300, oran: 0.3 } });
  assert.ok(satirlar.some((s) => /^ONERI: butun testler bu listede [\d.]+ dakika surdu \(listenin %\d+'i\)/.test(s)), satirlar.join('\n'));
  const kok2 = proje();
  ayarYaz(kok2, { gerileme: 'liste_sonunda' });
  const satirlar2: string[] = [];
  await listeyiYurut({ kok: kok2, liste: liste('temiz'), saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: (s) => satirlar2.push(s), denemeSiniri: 1, gerilemeOneriEsigi: { enAzMs: 60_000, oran: 0.3 } });
  assert.ok(!satirlar2.some((s) => /^ONERI:/.test(s)), 'esigin altinda oneri yok');
});
