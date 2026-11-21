// Asama 32 (a, c) kabul olcutu: fikirden uretilen liste liste denetiminden uyarisiz gecer; sahte ajanla fikirden bitmis ise kadar
// uctan uca akis; planlama projenin icinde calismaz; islerin durumu duz dille (sirada, bitti, baslayamadi ve nedeni).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { fikriBol, isleriAyikla } from '../src/fikir.js';
import { pencereAc } from '../src/pencere.js';
import { listeOku, listeyiYurut } from '../src/surucu.js';

test('isleriAyikla: son {"isler": [...]} alinir; eksik is atilir; tur ve zorluk temizlenir; en cok 12', () => {
  const metin = 'once {"isler": [{"soru":"eski"}]} sonra aciklama {"isler": [' +
    '{"tur": "ozellik", "soru": "Tarif ekle", "beklenti": "eklenen tarif listede gorunur", "yanlissa": "liste bos", "zorluk": "kolay"},' +
    '{"tur": "BOZUK TUR!", "soru": "Ara", "beklenti": "malzemeyle aranir", "yanlissa": "bulunmaz", "zorluk": "cok"},' +
    '{"tur": "ozellik", "soru": "", "beklenti": "x", "yanlissa": "y"}]} bitti';
  assert.deepEqual(isleriAyikla(metin), [
    { tur: 'ozellik', soru: 'Tarif ekle', beklenti: 'eklenen tarif listede gorunur', yanlissa: 'liste bos', zorluk: 'kolay' },
    { tur: 'ozellik', soru: 'Ara', beklenti: 'malzemeyle aranir', yanlissa: 'bulunmaz' },
  ]);
  const cok = JSON.stringify({ isler: Array.from({ length: 20 }, (_, i) => ({ soru: `s${i}`, beklenti: 'b', yanlissa: 'y' })) });
  assert.equal(isleriAyikla(cok)!.length, 12);
  assert.equal(isleriAyikla('plan yok'), null);
  assert.equal(isleriAyikla('{"isler": [{"soru": "eksik"}]}'), null);
});

test('KABUL planlama projenin icinde calismaz; istem fikri ve projenin dosya adlarini tasir; cok kisa fikir reddedilir', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-fikir-proje-'));
  writeFileSync(join(kok, 'tarifler.txt'), 'x');
  let gelen = { istem: '', cwd: '' };
  const tanim = { ad: 'planci' } as AjanTanimi;
  const r = await fikriBol({ kok, fikir: 'Tariflerimi saklayan bir uygulama istiyorum', tanim, kosucu: async (_t, istem, cwd) => {
    gelen = { istem, cwd };
    return { son_metin: '{"isler": [{"soru": "s", "beklenti": "b", "yanlissa": "y"}]}', sure_ms: 1, kullanim: { girdi: 0, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 0, maliyet_usd: null, model: null } };
  } });
  assert.equal(r.tamam, true);
  assert.notEqual(resolve(gelen.cwd).toLowerCase(), resolve(kok).toLowerCase(), 'planlama gecici bos klasorde');
  assert.equal(existsSync(gelen.cwd), false, 'gecici planlama klasoru is bitince silinir');
  assert.match(gelen.istem, /FIKIR: Tariflerimi saklayan/);
  assert.match(gelen.istem, /tarifler\.txt/);
  assert.deepEqual(await fikriBol({ kok, fikir: 'kisa', tanim, kosucu: async () => { throw new Error('cagrilmamali'); } }), { tamam: false, neden: 'Fikir çok kısa; ne istediğinizi bir iki cümleyle anlatın.' });
});

// --- Uctan uca: pencere (fikir, liste) + surucu (sahte ajanlar)
const BETIKLER = mkdtempSync(join(tmpdir(), 'mihenk-fikir-ajan-'));
const sahte = (ad: string, govde: string): AjanTanimi => {
  const yol = join(BETIKLER, `${ad}.mjs`);
  writeFileSync(yol, `import { mkdirSync, writeFileSync } from 'node:fs';\nconst istem = process.argv[2] ?? '';\nconst yaz = (d, m) => { mkdirSync(d.split('/').slice(0, -1).join('/') || '.', { recursive: true }); writeFileSync(d, m); };\n${govde}\n`);
  return {
    ad, istemci: new RegExp(`^${ad}$`), komutBul: () => ({ program: process.execPath, onEk: [yol] }), argumanlar: (i) => [i],
    kullanimOku: () => undefined, metinOku: (s) => (typeof s === 'string' ? s : JSON.stringify(s)),
  };
};
const TEST = "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { topla } from '../src/topla.mjs'; test('topla', () => assert.equal(topla(2, 3), 5));";
const AJANLAR: Record<string, AjanTanimi> = {
  // Planlama: fikri tek ise boler.
  planci: sahte('planci', `if (istem.includes('PLANLAMA')) console.log(JSON.stringify({ isler: [{ tur: 'ozellik', soru: 'Iki sayiyi toplayan topla islevini yaz', beklenti: 'topla(2, 3) 5 doner', yanlissa: 'baska sonuc', zorluk: 'kolay' }] }));`),
  // Is: once test (HAZIRLIK), sonra kod.
  usta: sahte('usta', `if (istem.includes('HAZIRLIK')) { yaz('test/topla.test.mjs', ${JSON.stringify(TEST)}); console.log(JSON.stringify({ dogrulama_komutu: 'node --test test/topla.test.mjs' })); } else yaz('src/topla.mjs', 'export const topla = (a, b) => a + b;');`),
  sessiz: sahte('sessiz', `console.log('bir sey yapmadim');`),
};

function istek(port: number, yol: string, anahtar: string, govde?: unknown): Promise<{ kod: number; veri: any }> {
  return new Promise((ok, red) => {
    const r = request({ host: '127.0.0.1', port, path: yol, method: govde === undefined ? 'GET' : 'POST', headers: { 'x-mihenk-anahtar': anahtar, 'content-type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (p) => (s += p));
      res.on('end', () => { let v: unknown = s; try { v = JSON.parse(s); } catch { /* */ } ok({ kod: res.statusCode ?? 0, veri: v }); });
    });
    r.on('error', red);
    if (govde !== undefined) r.write(JSON.stringify(govde));
    r.end();
  });
}

test('KABUL fikirden bitmis ise: fikir -> onerilen isler (komutsuz, uyarisiz) -> kayit -> once test -> is -> "Bitti" duz dille', { timeout: 180_000 }, async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-fikir-uctan-'));
  ayarYaz(kok, { bekci_dongu: false });
  const p = await pencereAc(kok, { port: 0, dosyaAcici: () => {}, ajanlar: AJANLAR });
  const api = (yol: string, govde?: unknown) => istek(p.port, yol, p.anahtar, govde);
  try {
    assert.equal((await api('/api/fikir', { fikir: 'Hesap makinesi gibi iki sayiyi toplayan bir sey istiyorum', ajan: 'planci' })).veri.ajan, 'planci');
    let f: any;
    for (let i = 0; i < 100; i++) { f = (await api('/api/fikir')).veri; if (!f.calisiyor) break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal(f.tamam, true, JSON.stringify(f));
    assert.equal(f.isler.length, 1);
    assert.equal(f.isler[0].dogrulama_komutu, undefined, 'kullanicidan komut istenmez');
    const kayit = await api('/api/liste', { isler: f.isler, ajan: 'usta' });
    assert.equal(kayit.kod, 200, JSON.stringify(kayit.veri));
    assert.deepEqual(kayit.veri.uyarilar.filter((u: { uyari: string }) => !/bulunamadi|found/.test(u.uyari)), [], 'liste denetimi uyarisiz (sahte ajanin "kurulu degil" uyarisi haric)');
    assert.deepEqual((await api('/api/liste-durum')).veri.map((x: { durum: string }) => x.durum), ['sirada']);
    // Liste sahte ajanla yurutulur (pencere gercek araclari baslatir; burada surucu dogrudan).
    const r = await listeyiYurut({ kok, liste: listeOku(join(kok, 'mihenk-isler.json')), saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: () => {} });
    assert.equal(r.isler[0]!.durum, 'gecti', r.isler[0]!.not);
    const durum = (await api('/api/liste-durum')).veri;
    assert.equal(durum[0].durum, 'gecti');
    assert.match(durum[0].neden, /./, 'duz dille neden');
    assert.match(readFileSync(join(kok, 'src', 'topla.mjs'), 'utf8'), /a \+ b/);
  } finally {
    await p.kapat();
  }
});

test('KABUL islerin durumu: hazirligi olmayan is "Baslayamadi" ve nedeniyle; kaydi olmayan "Sirada"', { timeout: 120_000 }, async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-fikir-takildi-'));
  ayarYaz(kok, { bekci_dongu: false });
  const isler = [{ tur: 'ozellik', soru: 'Bir', beklenti: 'b', yanlissa: 'y' }, { tur: 'ozellik', soru: 'Iki', beklenti: 'b', yanlissa: 'y' }];
  writeFileSync(join(kok, 'mihenk-isler.json'), JSON.stringify({ ajan: 'sessiz', isler }));
  await listeyiYurut({ kok, liste: { ajan: 'sessiz', isler: [isler[0]!] }, saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: () => {} });
  const p = await pencereAc(kok, { port: 0, dosyaAcici: () => {} });
  try {
    const d = (await istek(p.port, '/api/liste-durum', p.anahtar)).veri;
    assert.deepEqual(d.map((x: { durum: string }) => x.durum), ['takildi', 'sirada']);
    assert.match(d[0].neden, /test dosyasi yazilmadi/);
  } finally {
    await p.kapat();
  }
});
