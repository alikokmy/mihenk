// Asama 23 kabul olcutu: elle acilan oturumun is araligina dusen kullanimi elle hesapla uyusuyor; fiyat yoksa maliyet "bilinmiyor";
// surucu isi ve zaten olculmus is atlanir; tekrar calistirmak bir sey degistirmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter, SURUCU_ISTEMCISI } from '../src/defter.js';
import { claudeKlasorAdi, claudeYanitlari, elOturumlariniTopla } from '../src/el-oturumu.js';

// Gercek Claude Code kayit bicimi (alan adlari bu bilgisayardaki kayitlardan; degerler uydurma).
const yanit = (id: string, zaman: string, u: [number, number, number, number]) => JSON.stringify({
  parentUuid: 'p', type: 'assistant', timestamp: zaman, cwd: 'x', sessionId: 's',
  message: { model: 'claude-opus-5-5', id, type: 'message', role: 'assistant', content: [],
    usage: { input_tokens: u[0], cache_creation_input_tokens: u[1], cache_read_input_tokens: u[2], output_tokens: u[3], service_tier: 'standard' } },
});

test('claude klasor adi bu bilgisayarda gorulen bicimle ayni', { skip: process.platform !== 'win32' }, () => {
  assert.equal(claudeKlasorAdi('C:\\projeler\\mihenk'), 'C--projeler-mihenk');
  assert.equal(claudeKlasorAdi('C:\\projeler\\mihenk\\deneme\\asama3-claude'), 'C--projeler-mihenk-deneme-asama3-claude');
});

test('KABUL: is araligina dusen kullanim elle hesapla uyusuyor; fiyat yoksa bilinmiyor, varsa hesaplaniyor; tekrar calistirmak degistirmez', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-el-oturumu-'));
  const ev = mkdtempSync(join(tmpdir(), 'mihenk-ev-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  const d = new Defter(kok);
  const elle = d.isAc({ tur: 't', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'claude', model: 'm', istemci: 'claude-code 2.1' });
  await new Promise((r) => setTimeout(r, 30));
  const ortaZaman = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 30));
  await d.hukumVer({ is_id: elle.id });
  const surucu = d.isAc({ tur: 't', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'claude', model: 'm', istemci: SURUCU_ISTEMCISI });
  await d.hukumVer({ is_id: surucu.id, surucu: true });
  d.kapat();

  const dizin = join(ev, '.claude', 'projects', claudeKlasorAdi(kok));
  mkdirSync(dizin, { recursive: true });
  writeFileSync(join(dizin, 'oturum.jsonl'), [
    JSON.stringify({ type: 'user', timestamp: ortaZaman, message: { role: 'user', content: 'x' } }),
    yanit('msg_1', ortaZaman, [10, 100, 1000, 5]),
    yanit('msg_1', ortaZaman, [10, 100, 1000, 5]), // ayni yanitin ikinci satiri: bir kez sayilir
    yanit('msg_2', ortaZaman, [20, 0, 2000, 7]),
    yanit('msg_3', '2020-01-01T00:00:00.000Z', [999, 999, 999, 999]), // is araligi disinda
  ].join('\n'));

  assert.equal(claudeYanitlari(kok, ev).length, 3);
  const s = elOturumlariniTopla(kok, { ev });
  assert.deepEqual(s, { eklenen: 1, bos: 0, zaten: 0 }, 'surucu isi sayilmaz');
  const d2 = new Defter(kok);
  const t = d2.rapor({ is_id: elle.id }).is!.kullanim_toplami;
  assert.deepEqual([t.girdi, t.onbellek_yazma, t.onbellek_okuma, t.cikti], [30, 100, 3000, 12], 'elle: 10+20, 100+0, 1000+2000, 5+7');
  assert.equal(t.maliyet_usd, null, 'fiyat tablosu yokken uydurulmaz');
  assert.equal(d2.rapor({ is_id: surucu.id }).kullanimlar!.length, 0);
  d2.kapat();
  assert.deepEqual(elOturumlariniTopla(kok, { ev }), { eklenen: 0, bos: 0, zaten: 1 }, 'ikinci calistirma degistirmez');

  // Fiyat tablosu varsa maliyet hesaplanir (milyon token basina USD; elle hesap).
  const kok2 = mkdtempSync(join(tmpdir(), 'mihenk-el-oturumu-fiyat-'));
  writeFileSync(join(kok2, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok2, 'mihenk.json'), JSON.stringify({ fiyatlar: { 'claude-opus-5-5': { girdi: 5, cikti: 25, onbellek_okuma: 0.5, onbellek_yazma: 6.25 } } }));
  const d3 = new Defter(kok2);
  const is3 = d3.isAc({ tur: 't', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'claude', model: 'm' });
  const z = new Date(Date.now() + 5).toISOString();
  await new Promise((r) => setTimeout(r, 20));
  await d3.hukumVer({ is_id: is3.id });
  d3.kapat();
  const dizin2 = join(ev, '.claude', 'projects', claudeKlasorAdi(kok2));
  mkdirSync(dizin2, { recursive: true });
  writeFileSync(join(dizin2, 'o.jsonl'), yanit('m1', z, [1000, 2000, 10000, 400]));
  elOturumlariniTopla(kok2, { ev });
  const d4 = new Defter(kok2);
  const m = d4.rapor({ is_id: is3.id }).is!.kullanim_toplami.maliyet_usd;
  d4.kapat();
  const elleUsd = (1000 * 5 + 400 * 25 + 10000 * 0.5 + 2000 * 6.25) / 1_000_000;
  assert.ok(Math.abs(m! - elleUsd) < 1e-9, `${m} != ${elleUsd}`);
  assert.ok(readFileSync(join(kok2, 'mihenk.json'), 'utf8').includes('fiyatlar'));
});

test('README "Sorular": her soru gercek bir komuta ya da pencere sekmesine bagli', async () => {
  const { dirname: dn, join: jn } = await import('node:path');
  const { fileURLToPath: fu } = await import('node:url');
  const kok = jn(dn(fu(import.meta.url)), '..', '..');
  const readme = readFileSync(jn(kok, 'README.md'), 'utf8');
  const bolum = readme.slice(readme.indexOf('## Sorular'), readme.indexOf('## ', readme.indexOf('## Sorular') + 5));
  const sorular = bolum.split('\n- ').slice(1);
  assert.ok(sorular.length >= 8);
  const cli = readFileSync(jn(kok, 'src', 'cli.ts'), 'utf8');
  const komutlar = new Set([...cli.matchAll(/komut === '([a-z][a-z-]*)'/g)].map((m) => m[1]!));
  const sayfa = readFileSync(jn(kok, 'src', 'pencere-sayfa.ts'), 'utf8');
  const sekmeler = ['Proje', 'İş listesi', 'Defter', 'Ayarlar', 'Öneri ve maliyet'];
  for (const s of sorular) {
    const anilanKomutlar = [...s.matchAll(/`mihenk ([a-z-]+)/g)].map((m) => m[1]!);
    for (const k of anilanKomutlar) assert.ok(komutlar.has(k), `README'deki "mihenk ${k}" komutu yok`);
    const anilanSekme = sekmeler.filter((x) => s.includes(`**${x}**`));
    assert.ok(anilanKomutlar.length > 0 || anilanSekme.length > 0 || s.includes('.cmd'), `baglantisiz soru: ${s.slice(0, 60)}`);
  }
  assert.ok(sayfa.includes("'p_sekme_oneri'"));
});
