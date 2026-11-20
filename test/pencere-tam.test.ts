// Asama 30 kabul olcutu: komut satirinin her secenegi, mihenk.json'un her alani, is listesinin ve isin her alani icin pencerede bir
// karsilik var (yoksa nedeni yazili); yeni bolumler okunup yaziliyor ve dosyanin oteki alanlari korunuyor; uyum raporu varken pencere
// ve komut satiri ayni oneriyi veriyor; izinsiz program uyarisi "izin ver" ile kalkiyor; raporda ajan secim notu gorunuyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYARLAR } from '../src/ayar.js';
import { Defter, VARSAYILAN_AYARLAR } from '../src/defter.js';
import { METINLER } from '../src/dil.js';
import { GELISMIS_ALANLARI, IS_ALANLARI, pencereAc, SECENEK_ESLEME } from '../src/pencere.js';
import { PENCERE_SAYFASI } from '../src/pencere-sayfa.js';
import { LISTE_ALANLARI } from '../src/surucu.js';

const KAYNAK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

/** TypeScript arayuzunun alan adlari (kaynaktan; yorum satirlari atlanir). */
function arayuzAlanlari(dosya: string, ad: string): string[] {
  const k = readFileSync(join(KAYNAK, dosya), 'utf8');
  const bas = k.indexOf(`export interface ${ad} {`);
  const govde = k.slice(bas, k.indexOf('\n}', bas));
  return [...govde.matchAll(/^\s{2}([a-z_]+)\??:/gm)].map((m) => m[1]!);
}

test('KABUL esleme: komut satirinin her secenegi pencerede karsilikli ya da nedeni yazili', () => {
  const cli = readFileSync(join(KAYNAK, 'cli.ts'), 'utf8');
  const secenekler = new Set([...cli.matchAll(/(?:secenek|sayi|oran)\('(--[a-z-]+)'|gerisi\.includes\('(--[a-z-]+)'\)/g)].map((m) => m[1] ?? m[2]!));
  assert.ok(secenekler.size >= 21 && secenekler.has('--esik'), String(secenekler.size));
  const ayarlar = new Set(AYARLAR.map((a) => a.ad));
  for (const s of secenekler) {
    const k = SECENEK_ESLEME[s];
    assert.ok(k && k.length > 0, `${s}: pencerede karsiligi yazilmamis`);
    for (const x of k) {
      if ('ayar' in x) assert.ok(ayarlar.has(x.ayar), `${s}: ayar ${x.ayar} yok`);
      else if ('liste' in x) assert.ok(LISTE_ALANLARI.some((a) => a.ad === x.liste), `${s}: liste alani ${x.liste} yok`);
      else if ('is' in x) assert.ok((IS_ALANLARI as readonly string[]).includes(x.is), `${s}: is alani ${x.is} yok`);
      else if ('gelismis' in x) assert.ok((GELISMIS_ALANLARI as readonly string[]).includes(x.gelismis), `${s}`);
      else if ('yer' in x) assert.ok(PENCERE_SAYFASI.includes(x.yer), `${s}: sayfada ${x.yer} yok`);
      else assert.ok(x.yok.length > 10, `${s}: neden yazilmamis`);
    }
  }
});

test('KABUL esleme: mihenk.json, is listesi ve isin her alani pencerede', () => {
  // Defter ayarlari -> Gelismis; proje ayarlari -> Ayarlar sekmesi (hepsi sunucudan gelir ve genel cizilir).
  for (const k of Object.keys(VARSAYILAN_AYARLAR)) assert.ok((GELISMIS_ALANLARI as readonly string[]).includes(k), `mihenk.json ${k}: pencerede yok`);
  // Is listesi -> Liste ayarlari (+ ajan secimi, isler).
  for (const k of arayuzAlanlari('surucu.ts', 'IsListesi')) {
    assert.ok(k === 'isler' || k === 'ajan' || LISTE_ALANLARI.some((a) => a.ad === k), `is listesi ${k}: pencerede yok`);
  }
  // Isin alanlari -> isin formu (kimlik ic kullanim).
  for (const k of arayuzAlanlari('surucu.ts', 'ListeIsi')) {
    assert.ok(k === 'kimlik' || (IS_ALANLARI as readonly string[]).includes(k), `is ${k}: formda yok`);
  }
  for (const k of IS_ALANLARI) assert.ok(PENCERE_SAYFASI.includes(`'data-alan': '${k}'`) || PENCERE_SAYFASI.includes(`'data-alan': k`), k);
  // Her liste alaninin penceresi icin baslik ve aciklama metni var (iki dilde).
  for (const a of LISTE_ALANLARI) {
    for (const k of [`p_la_${a.ad}`, `p_la_${a.ad}_not`]) assert.ok((METINLER as Record<string, unknown>)[k], `${k} metni yok`);
  }
});

function istek(port: number, yol: string, anahtar: string, govde?: unknown): Promise<{ kod: number; veri: any }> {
  return new Promise((ok, red) => {
    const r = request({ host: '127.0.0.1', port, path: yol, method: govde === undefined ? 'GET' : 'POST', headers: { 'x-mihenk-anahtar': anahtar, 'content-type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (p) => (s += p));
      res.on('end', () => { let v: unknown = s; try { v = JSON.parse(s); } catch { /* html */ } ok({ kod: res.statusCode ?? 0, veri: v }); });
    });
    r.on('error', red);
    if (govde !== undefined) r.write(JSON.stringify(govde));
    r.end();
  });
}

async function ortam() {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-pencere-tam-'));
  const p = await pencereAc(kok, { port: 0, dosyaAcici: () => {} });
  const api = (yol: string, govde?: unknown) => istek(p.port, yol, p.anahtar, govde);
  return { kok, p, api };
}

test('KABUL liste ayarlari ve ise ozel alanlar okunur, yazilir; gecersiz deger dosyaya yazilmaz; oteki alanlar korunur', async () => {
  const { kok, p, api } = await ortam();
  try {
    writeFileSync(join(kok, 'mihenk-isler.json'), JSON.stringify({ aciklama_disi: 1, butce_usd: 3, isler: [] }));
    const is = { tur: 'ozellik', soru: 'Bir sey', beklenti: 'olur', yanlissa: 'olmaz', dogrulama_komutu: 'node -v', ajan: 'codex', zaman_asimi_sn: 300 };
    const r = await api('/api/liste', { isler: [is], ajan: 'oneri', liste_ayarlari: { butce_usd: null, is_butce_usd: 0.5, deneme_siniri: 5, gerileme_komutu: 'npm test', uyanik_tut: true, saklama: 'yok', oturum_dk: 30 } });
    assert.equal(r.kod, 200, JSON.stringify(r.veri));
    const dosya = JSON.parse(readFileSync(join(kok, 'mihenk-isler.json'), 'utf8'));
    assert.deepEqual(dosya, { aciklama_disi: 1, is_butce_usd: 0.5, deneme_siniri: 5, gerileme_komutu: 'npm test', uyanik_tut: true, saklama: 'yok', oturum_dk: 30, isler: [is], ajan: 'oneri' });
    const geri = (await api('/api/liste')).veri;
    assert.equal(geri.liste_ayarlari.deneme_siniri, 5);
    assert.equal(geri.liste_ayarlari.butce_usd, null);
    assert.deepEqual(geri.isler, [is]);
    const once = readFileSync(join(kok, 'mihenk-isler.json'), 'utf8');
    for (const kotu of [{ deneme_siniri: 2.5 }, { deneme_siniri: 0 }, { saklama: 'hepsi' }, { uyanik_tut: 'evet' }, { butce_usd: -1 }]) {
      assert.equal((await api('/api/liste', { isler: [is], liste_ayarlari: kotu })).kod, 400, JSON.stringify(kotu));
    }
    assert.equal(readFileSync(join(kok, 'mihenk-isler.json'), 'utf8'), once, 'gecersiz deger dosyaya dokunmadi');
  } finally {
    await p.kapat();
  }
});

test('KABUL gelismis: izinli programlar, kota, fiyat ve sureler yazilir; varsayilana donen alan dosyadan cikar; ayarlar korunur', async () => {
  const { kok, p, api } = await ortam();
  try {
    writeFileSync(join(kok, 'mihenk.json'), JSON.stringify({ dil: 'en' }));
    const g = (await api('/api/gelismis')).veri;
    assert.ok(g.izinli_programlar.includes('npm'));
    assert.equal((await api('/api/gelismis', { alan: 'izinli_programlar', deger: [...g.izinli_programlar, 'pytest2'] })).kod, 200);
    assert.equal((await api('/api/gelismis', { alan: 'kota', deger: { claude: { pencere_saat: 5, kapasite: 2000000, pencere_usd: null } } })).kod, 200);
    assert.equal((await api('/api/gelismis', { alan: 'fiyatlar', deger: { 'gpt-x': { girdi: 1, cikti: 4 } } })).kod, 200);
    assert.equal((await api('/api/gelismis', { alan: 'zaman_asimi_sn', deger: 300 })).kod, 200);
    let m = JSON.parse(readFileSync(join(kok, 'mihenk.json'), 'utf8'));
    assert.equal(m.dil, 'en', 'ayar korundu');
    assert.ok(m.izinli_programlar.includes('pytest2'));
    assert.deepEqual(m.kota, { claude: { pencere_saat: 5, kapasite: 2000000 } });
    assert.deepEqual(m.fiyatlar, { 'gpt-x': { girdi: 1, cikti: 4 } });
    assert.equal(m.zaman_asimi_sn, 300);
    for (const [alan, kotu] of [['izinli_programlar', ['rm -rf']], ['kota', { claude: { pencere_saat: 0 } }], ['fiyatlar', { x: { girdi: -1, cikti: 1 } }], ['zaman_asimi_sn', 0], ['bilinmeyen', 1]] as const) {
      assert.equal((await api('/api/gelismis', { alan, deger: kotu })).kod, 400, alan);
    }
    // Varsayilana donus: alan dosyadan cikar.
    await api('/api/gelismis', { alan: 'izinli_programlar', deger: g.varsayilan_izinli });
    await api('/api/gelismis', { alan: 'kota', deger: {} });
    await api('/api/gelismis', { alan: 'fiyatlar', deger: {} });
    await api('/api/gelismis', { alan: 'zaman_asimi_sn', deger: null });
    m = JSON.parse(readFileSync(join(kok, 'mihenk.json'), 'utf8'));
    assert.deepEqual(m, { dil: 'en' });
  } finally {
    await p.kapat();
  }
});

test('KABUL izinsiz program uyarisi programin adini tasir; izin verilince uyari kalkar', async () => {
  const { kok, p, api } = await ortam();
  try {
    const is = { tur: 'ozellik', soru: 'Bir sey', beklenti: 'olur', yanlissa: 'olmaz', dogrulama_komutu: 'deno test' };
    const r = (await api('/api/liste', { isler: [is] })).veri;
    assert.equal(r.uyarilar[0]?.program, 'deno');
    assert.ok(PENCERE_SAYFASI.includes("'data-izin-ver'"));
    const g = (await api('/api/gelismis')).veri;
    await api('/api/gelismis', { alan: 'izinli_programlar', deger: [...g.izinli_programlar, 'deno'] });
    const r2 = (await api('/api/liste', { isler: [is] })).veri;
    assert.deepEqual(r2.uyarilar.filter((u: { program?: string }) => u.program), []);
    void kok;
  } finally {
    await p.kapat();
  }
});

test('KABUL uyum raporu varken pencere ve komut satiri ayni oneriyi verir; esik Ayarlar\'dan', async () => {
  const { kok, p, api } = await ortam();
  try {
    writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
    const d = new Defter(kok);
    for (const [ajan, maliyet] of [['ucuz', 0.01], ['uyumlu', 0.05]] as const) {
      for (let i = 0; i < 6; i++) {
        const id = d.isAc({ tur: 'ozellik', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan, model: 'm' }).id;
        d.kullanimEkle({ is_id: id, ajan, oturum: 1, sure_ms: 1, girdi: 1, cikti: 1, onbellek_okuma: 0, onbellek_yazma: 0, maliyet_usd: maliyet });
        await d.hukumVer({ is_id: id });
      }
    }
    d.kapat();
    mkdirSync(join(kok, 'mihenk-uyum'));
    writeFileSync(join(kok, 'mihenk-uyum', 'uyum-raporu.json'), JSON.stringify({ ozet: [{ arac: 'ucuz', gecen: 5, toplam: 16 }, { arac: 'uyumlu', gecen: 16, toplam: 16 }] }));
    const pencere = (await api('/api/oneri')).veri.turler[0].oneri.ajan;
    const cli = JSON.parse(spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'oneri', '--hedef', kok, '--json'], { encoding: 'utf8' }).stdout)[0].oneri.ajan;
    assert.equal(cli, 'uyumlu', 'komut satiri uyumu dusuk ucuz ajani onermez');
    assert.equal(pencere, cli, 'pencere ayni oneriyi verir');
    // Esik Ayarlar'dan: %90 alt sinir 6/6 ile gecilemez -> ikisinde de oneri yok.
    assert.equal((await api('/api/ayar', { ad: 'oneri_esik', deger: 90 })).kod, 200);
    assert.equal((await api('/api/oneri')).veri.turler[0].oneri, null);
    assert.equal(JSON.parse(spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'oneri', '--hedef', kok, '--json'], { encoding: 'utf8' }).stdout)[0].oneri, null);
  } finally {
    await p.kapat();
  }
});
