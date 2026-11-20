// Asama 32 (b) kabul olcutu: komutsuz iste ajan once kabul testini yazar; test is baslamadan kalir ve isin denetimi olur; ajan testi
// sonradan degistirirse "gecti" supheli isaretlenir; hemen gecen test, test disi dosya, komutsuz ya da izinsiz komutlu hazirlik
// reddedilir ve is baslamaz. Kullanici komut yazmak zorunda degildir (liste denetimi ve pencere komutsuz isi kabul eder).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { Defter } from '../src/defter.js';
import { listeDenetimi } from '../src/liste-denetim.js';
import { listeyiYurut } from '../src/surucu.js';
import { komutuAyikla } from '../src/test-once.js';
import { kur } from '../src/kur.js';

const BETIKLER = mkdtempSync(join(tmpdir(), 'mihenk-testonce-ajan-'));
const TEST = "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { topla } from '../src/topla.mjs'; test('topla', () => assert.equal(topla(2, 3), 5));";
const HILE = "import { test } from 'node:test'; test('topla', () => {});";
const KOD = 'export const topla = (a, b) => a + b;';
/** Hazirlikta (istemde HAZIRLIK) `hazirlik`, is oturumunda `is` govdesi calisir. */
const sahte = (ad: string, hazirlik: string, is: string): AjanTanimi => {
  const yol = join(BETIKLER, `${ad}.mjs`);
  writeFileSync(yol, `import { mkdirSync, writeFileSync } from 'node:fs';
const istem = process.argv[2] ?? '';
const yaz = (d, m) => { mkdirSync(d.split('/').slice(0, -1).join('/') || '.', { recursive: true }); writeFileSync(d, m); };
if (istem.includes('HAZIRLIK')) { ${hazirlik} } else { ${is} }
`);
  return {
    ad, istemci: new RegExp(`^${ad}$`), komutBul: () => ({ program: process.execPath, onEk: [yol] }), argumanlar: (i) => [i],
    kullanimOku: () => undefined, metinOku: (s) => (typeof s === 'string' ? s : JSON.stringify(s)),
  };
};
const KOMUT = `console.log(JSON.stringify({ dogrulama_komutu: 'node --test test/topla.test.mjs' }));`;
const AJANLAR: Record<string, AjanTanimi> = {
  durust: sahte('durust', `yaz('test/topla.test.mjs', ${JSON.stringify(TEST)}); ${KOMUT}`, `yaz('src/topla.mjs', ${JSON.stringify(KOD)});`),
  hileci: sahte('hileci', `yaz('test/topla.test.mjs', ${JSON.stringify(TEST)}); ${KOMUT}`, `yaz('test/topla.test.mjs', ${JSON.stringify(HILE)});`),
  gecen: sahte('gecen', `yaz('test/topla.test.mjs', ${JSON.stringify(HILE)}); ${KOMUT}`, ''),
  tasan: sahte('tasan', `yaz('test/topla.test.mjs', ${JSON.stringify(TEST)}); yaz('src/topla.mjs', ${JSON.stringify(KOD)}); ${KOMUT}`, ''),
  sessiz: sahte('sessiz', `yaz('test/topla.test.mjs', ${JSON.stringify(TEST)}); console.log('bitti');`, ''),
  // Gercek denemede goruldu: arac baslarken kendi ayar dosyasina (opencode.json) dokunur; bu hazirligi bozmamali.
  ayarci: sahte('ayarci', `yaz('opencode.json', '{"$schema":"x"}'); yaz('test/topla.test.mjs', ${JSON.stringify(TEST)}); ${KOMUT}`, `yaz('src/topla.mjs', ${JSON.stringify(KOD)});`),
  izinsiz: sahte('izinsiz', `yaz('test/topla.test.mjs', ${JSON.stringify(TEST)}); console.log(JSON.stringify({ dogrulama_komutu: 'deno test test/topla.test.mjs' }));`, ''),
};

const IS = { tur: 'ozellik', soru: 'Iki sayiyi toplayan topla islevini yaz', beklenti: 'topla(2, 3) 5 doner', yanlissa: 'baska bir sonuc' };

async function kos(ajan: string, kurulum = false) {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-testonce-'));
  if (kurulum) kur(kok, { araclar: ['opencode'] });
  ayarYaz(kok, { bekci_dongu: false });
  const r = await listeyiYurut({ kok, liste: { ajan, isler: [IS] }, saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: () => {} });
  const s = r.isler[0]!;
  const d = new Defter(kok);
  const rapor = s.is_id ? d.rapor({ is_id: s.is_id }) : null;
  d.kapat();
  return { kok, s, rapor };
}

test('KABUL komutsuz is: once yazilan test is baslamadan kalir, kayit o testin komutuyla acilir, is bitince gecer', { timeout: 120_000 }, async () => {
  const { kok, s, rapor } = await kos('durust');
  assert.equal(s.durum, 'gecti', s.not);
  assert.equal(rapor!.is!.dogrulama_komutu, 'node --test test/topla.test.mjs');
  // Hazirlikta test is yapilmadan kosuldu ve kaldi (cikti dosyasi).
  const cikti = readdirSync(join(kok, '.mihenk', 'ciktilar')).find((d) => /^hazirlik-.*-test\.txt$/.test(d));
  assert.ok(cikti, 'hazirlik testinin ciktisi');
  assert.match(readFileSync(join(kok, '.mihenk', 'ciktilar', cikti!), 'utf8'), /fail 1/);
  assert.deepEqual(rapor!.is!.supheler, []);
  assert.ok((rapor!.kanitlar ?? []).some((k) => (k.icerik ?? '').includes('once test: kabul testi is baslamadan yazildi')));
  assert.ok(existsSync(join(kok, 'src', 'topla.mjs')));
});

test('aracin kendi ayar dosyasina (mihenk kurdu) dokunmasi hazirligi bozmaz; proje dosyasina dokunmasi bozar', { timeout: 120_000 }, async () => {
  const { s } = await kos('ayarci', true);
  assert.equal(s.durum, 'gecti', s.not);
  const t = await kos('ayarci', false); // kurulum yoksa opencode.json projenin kendi dosyasidir
  assert.match(t.s.not, /test disinda dosya degisti \(opencode\.json\)/);
});

test('KABUL ajan isi yaparken testi degistirirse "gecti" supheli isaretlenir', { timeout: 120_000 }, async () => {
  const { s, rapor } = await kos('hileci');
  assert.equal(s.durum, 'gecti');
  assert.match(rapor!.is!.supheler.join(' '), /var olan test dosyasi degisti: test\/topla\.test\.mjs/);
});

test('KABUL hatali hazirlik reddedilir ve is baslamaz: hemen gecen test, test disi dosya, komutsuz, izinsiz komut', { timeout: 180_000 }, async () => {
  const beklenen: Record<string, RegExp> = {
    gecen: /yazilan test is yapilmadan geciyor/,
    tasan: /test disinda dosya degisti \(src\/topla\.mjs\)/,
    sessiz: /testi kosan komutu bildirmedi/,
    izinsiz: /bildirilen komut calistirilamaz \(deno test/,
  };
  for (const [ajan, desen] of Object.entries(beklenen)) {
    const { s, kok } = await kos(ajan);
    assert.equal(s.is_id, 0, `${ajan}: kayit acilmadi`);
    assert.equal(s.durum, 'kaldi', ajan);
    assert.match(s.not, desen, ajan);
    const olaylar = readFileSync(join(kok, '.mihenk', 'surucu.jsonl'), 'utf8');
    assert.match(olaylar, /"olay":"test_once"/, `${ajan}: olay yazildi`);
  }
});

test('kullanici komut yazmak zorunda degil: liste denetimi komutsuz isi uyarisiz kabul eder; komut ayiklama', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-testonce-denetim-'));
  assert.deepEqual(listeDenetimi(kok, [{ ...IS }]), []);
  assert.equal(komutuAyikla('once {"dogrulama_komutu": "x"} sonra {"dogrulama_komutu": "node --test \\"a b.test.js\\""}'), 'node --test "a b.test.js"');
  assert.equal(komutuAyikla('komut yok'), null);
});
