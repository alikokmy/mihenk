// Asama 31 kabul olcutu: pencere proje secmeden acilir (baslangic ekrani); secilen bos klasore kurup proje ekranina gecer; son projeler
// kalici; uygun olmayan klasor reddedilir; liste calisirken proje degismez; nabiz kesilince sunucu kapanir, liste calisirken kapanmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { kapanmaliMi, projeUygunMu, sonProjeler, yeniProjeKlasoru } from '../src/baslangic.js';
import { pencereAc, type PencereSecenekleri } from '../src/pencere.js';
import { PENCERE_SAYFASI } from '../src/pencere-sayfa.js';

// Son projeler bu testte gecici bir klasore yazilir (kullanicinin gercek listesine dokunulmaz).
process.env.MIHENK_VERI_DIZINI = mkdtempSync(join(tmpdir(), 'mihenk-veri-'));

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

async function ortam(o: PencereSecenekleri = {}) {
  const p = await pencereAc(null, { port: 0, dosyaAcici: () => {}, ...o });
  return { p, api: (yol: string, govde?: unknown) => istek(p.port, yol, p.anahtar, govde) };
}

test('KABUL baslangic ekrani: secilen bos klasor once sorulur, "kur" ile kurulur ve proje ekranina gecilir; son projeler kalici', async () => {
  const { p, api } = await ortam();
  try {
    let d = (await api('/api/durum')).veri;
    assert.equal(d.secim, true);
    assert.deepEqual(d.son_projeler, []);
    assert.equal((await api('/api/isler')).kod, 409, 'proje secilmeden proje uclari calismaz');
    const bos = mkdtempSync(join(tmpdir(), 'mihenk-bos-proje-'));
    const sor = (await api('/api/proje', { kok: bos })).veri;
    assert.deepEqual([sor.kurulu, existsSync(join(bos, '.mihenk'))], [false, false], 'onaysiz kurulmaz');
    const kur = (await api('/api/proje', { kok: bos, kur: true })).veri;
    assert.equal(kur.kurulu, true);
    assert.ok(existsSync(join(bos, '.mihenk', 'kurulum.json')));
    d = (await api('/api/durum')).veri;
    assert.equal(d.secim, false);
    assert.equal(d.proje.kok, bos);
    assert.equal((await api('/api/isler')).kod, 200);
    assert.deepEqual(sonProjeler().map((x) => x.kok), [bos]);
    // Proje degistir: baslangic ekranina donulur, liste kalicidir.
    await api('/api/proje', { kok: null });
    d = (await api('/api/durum')).veri;
    assert.equal(d.secim, true);
    assert.equal(d.son_projeler[0].kok, bos);
    assert.equal(d.son_projeler[0].kurulu, true);
    assert.equal((await api('/api/son-proje-cikar', { kok: bos })).veri.son_projeler.length, 0);
  } finally {
    await p.kapat();
  }
});

test('KABUL uygun olmayan klasor reddedilir; yeni proje Belgeler altinda acilir; klasor secici ve kisayol (sahte) baglanir', async () => {
  const koku = mkdtempSync(join(tmpdir(), 'mihenk-projeler-'));
  const secilen = mkdtempSync(join(tmpdir(), 'mihenk-secilen-'));
  let kisayol = 0;
  const { p, api } = await ortam({ projelerKoku: koku, klasorSecici: async () => secilen, kisayolYapici: async () => { kisayol++; return 'C:/Masaustu/mihenk.lnk'; } });
  try {
    for (const kotu of [homedir(), 'C:\\', process.env.SystemRoot ?? 'C:\\Windows', join(tmpdir(), 'yok-boyle-bir-klasor-123')]) {
      assert.equal((await api('/api/proje', { kok: kotu })).kod, 400, kotu);
    }
    const dosya = join(secilen, 'a.txt');
    writeFileSync(dosya, 'x');
    assert.equal((await api('/api/proje', { kok: dosya })).kod, 400, 'dosya');
    assert.equal((await api('/api/yeni-proje', { ad: '../kacis' })).kod, 400);
    const y = (await api('/api/yeni-proje', { ad: 'Tarif defteri' })).veri;
    assert.equal(y.kok, join(koku, 'Tarif defteri'));
    assert.ok(existsSync(y.kok));
    assert.equal((await api('/api/klasor-sec', {})).veri.kok, secilen);
    assert.equal((await api('/api/kisayol', {})).kod, 200);
    assert.equal(kisayol, 1);
    assert.equal(projeUygunMu(secilen).tamam, true);
    assert.deepEqual(yeniProjeKlasoru('', koku), { tamam: false });
  } finally {
    await p.kapat();
  }
});

test('KABUL liste calisirken proje degismez', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-calisan-'));
  // Dogrulamasi 5 sn suren tek isli liste: liste bu sure boyunca "calisiyor".
  writeFileSync(join(kok, 'bekle.js'), 'setTimeout(() => process.exit(1), 5000);');
  writeFileSync(join(kok, 'mihenk-isler.json'), JSON.stringify({ ajan: 'yok-boyle-arac', isler: [{ tur: 'ozellik', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node bekle.js' }] }));
  const { p, api } = await ortam();
  try {
    assert.equal((await api('/api/proje', { kok, kur: true })).veri.kurulu, true);
    assert.equal((await api('/api/sur', {})).kod, 200);
    assert.equal((await api('/api/sur')).veri.calisiyor, true);
    assert.equal((await api('/api/proje', { kok: null })).kod, 409);
    assert.equal((await api('/api/durum')).veri.secim, false, 'proje ayni kaldi');
    await api('/api/sur/durdur', {});
  } finally {
    await p.kapat();
  }
});

test('KABUL kendiliginden kapanma: sayfa hic acilmadiysa kapanmaz; nabiz kesilince kapanir; liste calisirken kapanmaz', async () => {
  assert.equal(kapanmaliMi({ sonNabiz: 0, simdi: 10_000_000, sureMs: 1000, listeCalisiyor: false }), false);
  assert.equal(kapanmaliMi({ sonNabiz: 1000, simdi: 3000, sureMs: 1000, listeCalisiyor: false }), true);
  assert.equal(kapanmaliMi({ sonNabiz: 1000, simdi: 3000, sureMs: 1000, listeCalisiyor: true }), false);
  assert.equal(kapanmaliMi({ sonNabiz: 1000, simdi: 1500, sureMs: 1000, listeCalisiyor: false }), false);
  let kapandi = false;
  const { p, api } = await ortam({ otomatikKapan: { sureMs: 300, denetimMs: 50 }, kapaninca: () => { kapandi = true; } });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(kapandi, false, 'nabiz hic gelmedi: acik kalir');
  await api('/api/nabiz', {});
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(kapandi, true, 'nabiz kesildi: kapandi');
  await assert.rejects(api('/api/durum'), 'sunucu artik cevap vermiyor');
  await p.kapat().catch(() => {});
  assert.ok(PENCERE_SAYFASI.includes("api('/api/nabiz'"), 'sayfa nabiz gonderiyor');
});

test('son projeler bozuk dosyada bos liste; silinmis klasor listelenmez', () => {
  const v = process.env.MIHENK_VERI_DIZINI!;
  mkdirSync(v, { recursive: true });
  writeFileSync(join(v, 'son-projeler.json'), '{bozuk');
  assert.deepEqual(sonProjeler(), []);
  writeFileSync(join(v, 'son-projeler.json'), JSON.stringify([{ kok: join(tmpdir(), 'silinmis-proje-xyz'), zaman: 'z' }]));
  assert.deepEqual(sonProjeler(), []);
  void readFileSync;
});
