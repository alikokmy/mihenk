// Asama 34 kabul olcutu (metamorfik karari 1, 2026-11-20): iki vites ve once kusur. Komutsuz kesif isi acilir ama "gecti" kapanmaz;
// kesif isi oneri sayimina girmez; eski defterde hesap ayni; kusur isi listenin sonunda da olsa ilk yurur; giderilmemis kusur uyarisi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { Defter, type IsOlcumu } from '../src/defter.js';
import { listeDenetimi } from '../src/liste-denetim.js';
import { oneriHesapla } from '../src/oneri.js';
import { listeyiYurut } from '../src/surucu.js';

const G = { tur: 'arastirma', soru: 'Log dosyasina bak, gecikme nerede', beklenti: 'gecikmenin kaynagi bulunur', yanlissa: 'log bos', ajan: 'claude', model: 'm' };

test('KABUL komutsuz kesif isi acilir, "gecti" kapanmaz, gerekceyle "belirsiz" kapanir; hukum vitesinde komut zorunlu', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-vites-'));
  const d = new Defter(kok);
  try {
    assert.throws(() => d.isAc(G as never), /dogrulama_komutu/, 'hukum vitesinde komutsuz kayit acilmaz');
    const is = d.isAc({ ...G, vites: 'kesif' });
    assert.deepEqual([is.vites, is.dogrulama_komutu], ['kesif', '']);
    await assert.rejects(d.hukumVer({ is_id: is.id }), (e: Error & { kod?: string }) => e.kod === 'KESIF_HUKUM');
    const r = await d.hukumVer({ is_id: is.id, hukum: 'belirsiz', gerekce: 'kesif: gecikme ag katmaninda gorundu' });
    assert.deepEqual([r.durum, r.dogrulama.komut], ['belirsiz', '']);
    assert.equal(d.olcumler()[0]!.vites, 'kesif');
  } finally {
    d.kapat();
  }
});

let sayac = 0;
const isler = (ajan: string, n: number, vites?: 'kesif' | 'hukum'): IsOlcumu[] => Array.from({ length: n }, () => ({
  id: ++sayac, tur: 'ozellik', ajan, model: 'm', durum: 'gecti' as const, sure_sn: 60, deneme_sayisi: 1, maliyet_usd: 0.01, ...(vites ? { vites } : {}),
}));

test('KABUL kesif isleri dogrulanmis basari sayilmaz; vitesi olmayan (eski) olcumde hesap ayni', () => {
  const [t] = oneriHesapla([...isler('pahali', 6), ...isler('kesifci', 20, 'kesif')]);
  assert.deepEqual(t!.secenekler.map((s) => s.ajan), ['pahali'], 'kesif secenegi sayilmadi');
  assert.equal(t!.is_sayisi, 6);
  const eski = isler('a', 6);
  assert.deepEqual(oneriHesapla(eski), oneriHesapla(eski.map((x) => ({ ...x, vites: 'hukum' as const }))));
});

test('eski defter (vites sutunu ve yeni tetikleyici yok) acilir; olcumde vites "hukum" sayilir; tetikleyici yenilenir', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-vites-eski-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  const d1 = new Defter(kok);
  const id = d1.isAc({ ...G, dogrulama_komutu: 'node gecer.js' }).id;
  d1.kapat();
  const db = new DatabaseSync(join(kok, '.mihenk', 'defter.db'));
  db.exec('ALTER TABLE isler DROP COLUMN vites;');
  // 0.6 tetikleyicisi: sunucu kaniti olmadan hicbir is kapanmaz.
  db.exec("DROP TRIGGER kapanis_dogrulama_ister; CREATE TRIGGER kapanis_dogrulama_ister BEFORE UPDATE OF durum ON isler WHEN NEW.durum <> 'acik' AND NOT EXISTS (SELECT 1 FROM kanitlar WHERE is_id = NEW.id AND kaynak = 'sunucu') BEGIN SELECT RAISE(ABORT, 'eski'); END;");
  db.close();
  const d2 = new Defter(kok);
  try {
    assert.equal(d2.rapor({ is_id: id }).is!.soru, G.soru);
    await d2.hukumVer({ is_id: id });
    assert.equal(d2.olcumler()[0]!.vites, 'hukum');
    // Yenilenen tetikleyiciyle komutsuz kesif bu eski defterde de kapanir.
    const k = d2.isAc({ ...G, vites: 'kesif' }).id;
    assert.equal((await d2.hukumVer({ is_id: k, hukum: 'belirsiz', gerekce: 'kesif' })).durum, 'belirsiz');
  } finally {
    d2.kapat();
  }
});

// --- Once kusur
const BETIK = join(mkdtempSync(join(tmpdir(), 'mihenk-vites-ajan-')), 'yapar.mjs');
writeFileSync(BETIK, `import { writeFileSync } from 'node:fs';\nconst m = /dosya-\\w+/.exec(process.argv[2] ?? '');\nif (m) writeFileSync(m[0] + '.txt', 'x');\n`);
const YAPAR: AjanTanimi = { ad: 'yapar', istemci: /^yapar$/, komutBul: () => ({ program: process.execPath, onEk: [BETIK] }), argumanlar: (i) => [i], kullanimOku: () => undefined, metinOku: () => undefined };
const is = (ad: string, ek: object = {}) => ({ tur: 'ozellik', soru: `dosya-${ad} yaz`, beklenti: 'var', yanlissa: 'yok', dogrulama_komutu: `node var.js dosya-${ad}`, ...ek });

test('KABUL once kusur: "kusur" isaretli is listenin sonunda da olsa ilk yurur', { timeout: 120_000 }, async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kusur-'));
  writeFileSync(join(kok, 'var.js'), "process.exit(require('node:fs').existsSync(process.argv[2] + '.txt') ? 0 : 1);");
  ayarYaz(kok, { bekci_dongu: false });
  const r = await listeyiYurut({ kok, liste: { ajan: 'yapar', isler: [is('a'), is('b'), is('kusur', { kusur: true })] }, saklama: 'yok', ajanlar: { yapar: YAPAR }, korunanDizinler: [], yaz: () => {} });
  const d = new Defter(kok);
  const sira = r.isler.map((x) => d.rapor({ is_id: x.is_id }).is!.soru);
  d.kapat();
  assert.deepEqual(sira, ['dosya-kusur yaz', 'dosya-a yaz', 'dosya-b yaz']);
});

test('KABUL giderilmemis kusur liste denetiminde uyari olur; ayni is sonra gecince uyari kalkar', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kusur-uyari-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  const d = new Defter(kok);
  const k = d.isAc({ ...G, dogrulama_komutu: 'node kalir.js', etiket: 'tarih' }).id;
  await d.hukumVer({ is_id: k, hukum: 'kaldi', gerekce: 'tarih ayristirma bozuk' });
  d.kapat();
  const u = listeDenetimi(kok, []);
  assert.equal(u.length, 1);
  assert.equal(u[0]!.is, 0);
  assert.match(u[0]!.uyari, /önce kusur|defect first/);
  assert.match(u[0]!.uyari, new RegExp(`${k}`));
  const d2 = new Defter(kok);
  const g = d2.isAc({ ...G, dogrulama_komutu: 'node gecer.js', etiket: 'tarih' }).id;
  await d2.hukumVer({ is_id: g });
  d2.kapat();
  assert.deepEqual(listeDenetimi(kok, []), []);
});
