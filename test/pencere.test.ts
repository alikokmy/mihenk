// Asama 16 kabul olcutu: CLI'de yapilabilen her yonetim isi ve her ayar pencereden de yapilabiliyor (esleme ve test); pencere yalniz
// 127.0.0.1'e baglaniyor; bir ayar degistirilip sonucu dosyada goruluyor; iki dilde; bilgi notlari ve onlari gizleyen anahtar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYARLAR, ayarlariOku, ayarYaz } from '../src/ayar.js';
import { Defter } from '../src/defter.js';
import { kur } from '../src/kur.js';
import { pencereAc, PENCERE_ESLEME } from '../src/pencere.js';
import { PENCERE_SAYFASI } from '../src/pencere-sayfa.js';

const KAYNAK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

function istek(port: number, yol: string, o: { yontem?: string; anahtar?: string; govde?: unknown; host?: string } = {}): Promise<{ kod: number; govde: string }> {
  return new Promise((ok, red) => {
    const r = request({ host: '127.0.0.1', port, path: yol, method: o.yontem ?? 'GET',
      headers: { host: o.host ?? `127.0.0.1:${port}`, 'content-type': 'application/json', ...(o.anahtar ? { 'x-mihenk-anahtar': o.anahtar } : {}) } }, (res) => {
      let s = '';
      res.on('data', (p: Buffer) => { s += p.toString('utf8'); });
      res.on('end', () => ok({ kod: res.statusCode ?? 0, govde: s }));
    });
    r.on('error', red);
    if (o.govde !== undefined) r.write(JSON.stringify(o.govde));
    r.end();
  });
}

async function ortam() {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-pencere-'));
  writeFileSync(join(kok, 'AGENTS.md'), '# benim\n');
  kur(kok, { esitle: true });
  const p = await pencereAc(kok);
  const api = async (yol: string, govde?: unknown) => {
    const r = await istek(p.port, yol, { anahtar: p.anahtar, ...(govde === undefined ? {} : { yontem: 'POST', govde }) });
    return { kod: r.kod, veri: JSON.parse(r.govde) as any };
  };
  return { kok, p, api };
}

test('KABUL guvenlik: yalniz 127.0.0.1; anahtarsiz ve yabanci Host reddedilir', async () => {
  const { p } = await ortam();
  try {
    assert.match(p.url, /^http:\/\/127\.0\.0\.1:\d+\/\?anahtar=[0-9a-f]{48}$/);
    assert.equal((await istek(p.port, '/api/durum')).kod, 403, 'anahtarsiz');
    assert.equal((await istek(p.port, '/api/durum', { anahtar: 'yanlis' })).kod, 403, 'yanlis anahtar');
    assert.equal((await istek(p.port, '/api/durum', { anahtar: p.anahtar, host: 'kotu.example:80' })).kod, 403, 'yabanci Host (DNS yeniden baglama)');
    assert.equal((await istek(p.port, '/')).kod, 403, 'sayfa da anahtarsiz acilmaz');
    assert.equal((await istek(p.port, `/?anahtar=${p.anahtar}`)).kod, 200);
    assert.equal((await istek(p.port, '/api/durum', { anahtar: p.anahtar })).kod, 200);
  } finally {
    await p.kapat();
  }
});

test('KABUL esleme: her CLI komutunun penceredeki karsiligi var ve calisiyor', async () => {
  const cli = readFileSync(join(KAYNAK, 'cli.ts'), 'utf8');
  const komutlar = [...cli.matchAll(/komut === '([a-z][a-z-]*)'/g)].map((m) => m[1]!);
  assert.ok(komutlar.length >= 8);
  for (const k of komutlar) assert.ok(PENCERE_ESLEME[k], `${k}: pencerede karsiligi yazilmamis`);
  const { p, api } = await ortam();
  try {
    for (const [k, e] of Object.entries(PENCERE_ESLEME)) {
      if ('yok' in e) continue;
      const [yontem, yol] = e.api.split(' ') as [string, string];
      if (yontem === 'GET') {
        const r = await istek(p.port, yol, { anahtar: p.anahtar });
        assert.notEqual(r.kod, 404, `${k}: ${e.api}`);
      }
      assert.ok(PENCERE_SAYFASI.includes(`id="${e.sekme}"`), `${k}: sekme ${e.sekme} sayfada yok`);
    }
    // POST karsiliklari: zararsiz bicimde cagrilir.
    assert.equal((await api('/api/kur', {})).kod, 200);
    assert.equal((await api('/api/kaldir', {})).kod, 400, 'onaysiz kaldirma reddedilir');
    assert.equal((await api('/api/sur', {})).kod, 400, 'liste yokken baslamaz');
  } finally {
    await p.kapat();
  }
});

test('KABUL ayar: pencereden degisen ayarin sonucu dosyada gorulur; her ayar notlariyla gelir; gecersiz deger reddedilir', async () => {
  const { kok, p, api } = await ortam();
  try {
    const d = (await api('/api/durum')).veri;
    assert.deepEqual(d.ayarlar.map((a: any) => a.ad), AYARLAR.map((a) => a.ad), 'her ayar pencerede');
    for (const a of d.ayarlar) assert.ok(a.baslik && a.amac && a.sonuc && a.varsayilan_aciklama, a.ad);
    assert.equal(d.ayarlar.find((a: any) => a.ad === 'saklama').secenek_adlari.yerel, 'Bu bilgisayarda kaydet');
    assert.equal((await api('/api/ayar', { ad: 'skiller', deger: false })).kod, 200);
    assert.equal(JSON.parse(readFileSync(join(kok, 'mihenk.json'), 'utf8')).skiller, false);
    assert.ok(!existsSync(join(kok, '.claude', 'skills')), 'kurulum ayara esitlendi');
    assert.equal((await api('/api/ayar', { ad: 'geri_alma_sakla', deger: '7' })).kod, 200);
    assert.equal(ayarlariOku(kok).geri_alma_sakla, 7);
    assert.equal((await api('/api/ayar', { ad: 'geri_alma_sakla', deger: '500' })).kod, 400);
    assert.equal((await api('/api/ayar', { ad: 'saklama', deger: true })).kod, 400);
    assert.equal((await api('/api/ayar', { ad: 'bilgi_notlari', deger: false })).kod, 200);
    assert.equal(ayarlariOku(kok).bilgi_notlari, false);
  } finally {
    await p.kapat();
  }
});

test('is listesi formu: alan alan okunur ve yazilir; bos alanli is reddedilir; listedeki oteki ayarlar korunur', async () => {
  const { kok, p, api } = await ortam();
  try {
    const ilk = (await api('/api/liste')).veri;
    assert.equal(ilk.var, false);
    assert.ok(Array.isArray(ilk.isler) && Array.isArray(ilk.araclar), 'ornek listeden alanlar');
    assert.equal((await api('/api/liste', { isler: [{ tur: 'ozellik', soru: 'Bir sey yap', beklenti: '', yanlissa: 'y', dogrulama_komutu: 'node -v' }] })).kod, 400);
    assert.ok(!existsSync(join(kok, 'mihenk-isler.json')), 'gecersiz liste dosyaya yazilmadi');
    writeFileSync(join(kok, 'mihenk-isler.json'), JSON.stringify({ saklama: 'yok', butce_usd: 2, isler: [] }));
    const is = { tur: 'ozellik', soru: 'Bir sey yap', beklenti: 'olur', yanlissa: 'olmaz', dogrulama_komutu: 'node -v' };
    assert.equal((await api('/api/liste', { isler: [is], ajan: 'kilo' })).kod, 200);
    assert.deepEqual(JSON.parse(readFileSync(join(kok, 'mihenk-isler.json'), 'utf8')), { saklama: 'yok', butce_usd: 2, isler: [is], ajan: 'kilo' });
    const geri = (await api('/api/liste')).veri;
    assert.deepEqual(geri.isler, [is]);
    assert.equal(geri.ajan, 'kilo');
    // Ise ozel ek alanlar (zorluk, ajan, kimlik, zaman asimi) okuma-yazma turunda kaybolmaz; gecersiz zorluk atilir (Asama 28).
    const ekli = { ...is, zorluk: 'zor', ajan: 'codex', kimlik: 'is-1', zaman_asimi_sn: 300 };
    assert.equal((await api('/api/liste', { isler: [ekli, { ...is, soru: 'Iki', zorluk: 'cok' }] })).kod, 200);
    const tur = (await api('/api/liste')).veri;
    assert.deepEqual(tur.isler, [ekli, { ...is, soru: 'Iki' }]);
    assert.equal((await api('/api/liste', { isler: tur.isler })).kod, 200);
    assert.deepEqual(JSON.parse(readFileSync(join(kok, 'mihenk-isler.json'), 'utf8')).isler, [ekli, { ...is, soru: 'Iki' }]);
  } finally {
    await p.kapat();
  }
});

test('port cakismasi: istenen port doluysa baska bir portta acilir', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-port-'));
  const ilk = await pencereAc(kok, { port: 47790 });
  try {
    const ikinci = await pencereAc(kok, { port: ilk.port });
    try {
      assert.notEqual(ikinci.port, ilk.port);
      assert.equal((await istek(ikinci.port, '/api/durum', { anahtar: ikinci.anahtar })).kod, 200);
    } finally {
      await ikinci.kapat();
    }
  } finally {
    await ilk.kapat(); // ikinci acilamasa bile ilk kapanir (aksi halde test sureci asili kalir)
  }
});

test('dosyayi ac: her ayar kendi dosyasini acar; yol disaridan alinmaz', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-dosya-'));
  kur(kok, { esitle: true });
  const acilan: string[] = [];
  const p = await pencereAc(kok, { dosyaAcici: (y) => acilan.push(y) });
  try {
    const ac = async (ayar: string) => JSON.parse((await istek(p.port, '/api/dosya-ac', { anahtar: p.anahtar, yontem: 'POST', govde: { ayar } })).govde);
    assert.equal((await ac('arac_claude')).acilan, '.mcp.json');
    assert.equal((await ac('yontem_metni')).acilan, 'AGENTS.md');
    assert.equal((await ac('kapi')).acilan, '.', 'mihenk.json yokken proje klasoru acilir');
    assert.equal((await istek(p.port, '/api/dosya-ac', { anahtar: p.anahtar, yontem: 'POST', govde: { ayar: '../../Windows' } })).kod, 400);
    assert.ok(acilan.every((y) => y.startsWith(kok)), 'yalniz proje icindeki yollar');
  } finally {
    await p.kapat();
  }
});

test('defter sekmesi: isler listelenir, pencereden geri alinir; rapor acilir; oneri gelir', async () => {
  const { kok, p, api } = await ortam();
  try {
    writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
    writeFileSync(join(kok, 'a.txt'), 'once');
    const defter = new Defter(kok);
    const is = defter.isAc({ tur: 't', soru: 'a.txt degistir', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node kalir.js', ajan: 'kilo', model: 'm' });
    writeFileSync(join(kok, 'a.txt'), 'sonra');
    await defter.hukumVer({ is_id: is.id, hukum: 'kaldi', gerekce: 'takildi: 3 denemede dogrulama gecmedi' });
    defter.kapat();
    const isler = (await api('/api/isler')).veri;
    assert.equal(isler[0].id, is.id);
    assert.equal(isler[0].geri_alinabilir, true);
    // KABUL (Asama 18): onaysiz geri alma reddedilir ve dosya degismez; onizleme komut satirinin --deneme ciktisiyla ayni.
    assert.equal((await api('/api/geri-al', { id: is.id })).kod, 400);
    assert.equal(readFileSync(join(kok, 'a.txt'), 'utf8'), 'sonra');
    const onizleme = (await api('/api/geri-al', { id: is.id, deneme: true })).veri;
    assert.equal(readFileSync(join(kok, 'a.txt'), 'utf8'), 'sonra', 'onizleme dosyaya dokunmaz');
    const cli = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(KAYNAK, '..', 'dist', 'src', 'cli.js'), 'geri-al', String(is.id), '--deneme', '--hedef', kok], { encoding: 'utf8' });
    for (const y of onizleme.geri_yuklenen) assert.ok(cli.stdout.includes(y), `${y} komut satiri onizlemesinde de var`);
    assert.deepEqual(onizleme.geri_yuklenen, ['a.txt']);
    const g = await api('/api/geri-al', { id: is.id, onay: true });
    assert.equal(g.kod, 200);
    assert.equal(readFileSync(join(kok, 'a.txt'), 'utf8'), 'once');
    const rapor = await istek(p.port, '/rapor', { anahtar: p.anahtar });
    assert.match(rapor.govde, /1 işin 0 tanesi başarıyla bitti, 1 tanesi yapılamadı/);
    assert.match((await api('/api/oneri')).veri.metin, /veri yetersiz/);
  } finally {
    await p.kapat();
  }
});

test('iki dil: dil "en" iken pencere metinleri ve ayar notlari Ingilizce', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-pencere-en-'));
  ayarYaz(kok, { dil: 'en' });
  const p = await pencereAc(kok);
  try {
    const d = JSON.parse((await istek(p.port, '/api/durum', { anahtar: p.anahtar })).govde);
    assert.equal(d.dil, 'en');
    assert.equal(d.metinler.p_sekme_ayarlar, 'Settings');
    assert.match(d.ayarlar.find((a: any) => a.ad === 'kapi').amac, /cannot call the job done/);
    const tr = JSON.parse((await istek(p.port, '/api/durum', { anahtar: p.anahtar })).govde);
    assert.equal(tr.metinler.p_bilgi_goster, 'Show notes under the settings');
  } finally {
    await p.kapat();
  }
});

test('sayfa: bes sekme, bilgi notu kutusu; kullanici verisi textContent ile yazilir (innerHTML yok)', () => {
  for (const id of ['proje', 'liste', 'defter', 'ayarlar', 'oneri']) assert.ok(PENCERE_SAYFASI.includes(`<section id="${id}"`), id);
  assert.ok(PENCERE_SAYFASI.includes("id: 'bilgi-notlari'"));
  assert.ok(!PENCERE_SAYFASI.includes('innerHTML'));
  assert.ok(!/\bs\.replaceChildren\(/.test(PENCERE_SAYFASI), 'sekmeler null ayiklayan koy() ile cizilir');
  // Sayfanin betigi sozdizimi bakimindan gecerli (tarayici denemesinde bir kacis hatasi sayfayi bos birakmisti).
  const betik = /<script>([\s\S]*)<\/script>/.exec(PENCERE_SAYFASI)![1]!;
  assert.doesNotThrow(() => new vm.Script(betik), 'sayfa betiginde sozdizimi hatasi');
  // Gunluk kullanici JSON gormez: liste alan alan, oneri cumleyle, ayarlarda kod adi yok.
  assert.ok(!PENCERE_SAYFASI.includes('JSON.stringify(D') && !PENCERE_SAYFASI.includes('liste-metni') && !PENCERE_SAYFASI.includes('oneri-metni'));
  assert.ok(!PENCERE_SAYFASI.includes("class: 'ad', metin: a.ad"));
  // "display:flex" gibi kurallar hidden ozniteligini ezmesin (kaldir onayi tiklanmadan gorunuyordu).
  assert.ok(PENCERE_SAYFASI.includes('[hidden]{display:none!important}'));
  // append'e null verilirse sayfaya "null" yazisi duser (tarayici denemesinde goruldu): dogrudan append(...) cagrilari null tasimamali.
  for (const m of PENCERE_SAYFASI.matchAll(/\.append\(([^;]*)\);/g)) assert.ok(!/: null\)$/.test(m[1]!) || m[1]!.includes('.filter(Boolean)'), m[1]);
  assert.ok(!/https?:\/\/(?!127)/.test(PENCERE_SAYFASI), 'dis kaynak yok');
});
