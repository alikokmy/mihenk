// Asama 20 kabul olcutu: tanimsiz betik ve izinsiz program iceren liste baslamadan is basina anlasilir uyari veriyor; temiz liste uyarisiz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { listeDenetimi, listeDenetimMetni } from '../src/liste-denetim.js';
import { pencereAc } from '../src/pencere.js';
import { request } from 'node:http';

const VAR: AjanTanimi = { ad: 'var', istemci: /x/, komutBul: () => ({ program: 'x', onEk: [] }), argumanlar: () => [], kullanimOku: () => undefined, metinOku: () => undefined };
const YOK: AjanTanimi = { ...VAR, ad: 'hayalet', komutBul: () => null };
const ajanlar = { var: VAR, hayalet: YOK };
const is = (komut: string, ek: Record<string, string> = {}) => ({ soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: komut, ...ek });

function proje(paket?: object): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-liste-denetim-'));
  if (paket) writeFileSync(join(kok, 'package.json'), JSON.stringify(paket));
  writeFileSync(join(kok, 'kontrol.js'), 'process.exit(0);');
  return kok;
}

test('KABUL temiz liste uyarisiz', () => {
  const kok = proje({ scripts: { test: 'node --test', lint: 'x' } });
  assert.deepEqual(listeDenetimi(kok, [is('npm test'), is('npm run lint'), is('node kontrol.js'), is('git status')], { ajan: 'var', ajanlar }), []);
});

test('KABUL sorunlu liste: her sorun dogru is numarasiyla ve anlasilir metinle', () => {
  const kok = proje({ scripts: { build: 'tsc' } });
  const u = listeDenetimi(kok, [
    is('npm test'),
    is('curl http://ornek.test'),
    is('node yok.js'),
    is('node kontrol.js', { soru: '' }),
    is('npm run lint'),
    is('node kontrol.js', { ajan: 'hayalet' }),
    is('node kontrol.js && npm test'),
  ], { ajan: 'var', ajanlar });
  const bul = (n: number) => u.filter((x) => x.is === n).map((x) => x.uyari).join(' | ');
  assert.match(bul(1), /"npm test" calistirilamaz: package\.json icinde "test" betigi yok/);
  assert.match(bul(2), /"curl" programını kullanıyor; bu program henüz izinli değil/);
  assert.equal(u.find((x) => x.is === 2)?.program, 'curl', 'pencere izin ver dugmesi icin program adi');
  assert.match(bul(3), /"node yok\.js" calistirilamaz: yok\.js dosyasi yok/);
  assert.match(bul(4), /"soru" bos/);
  assert.match(bul(5), /"lint" betigi yok/);
  assert.match(bul(6), /"hayalet" araci bu bilgisayarda bulunamadi/);
  assert.match(bul(7), /kabuk karakteri/);
  assert.match(listeDenetimMetni(u), /^Baslamadan once dikkat \(7 uyari\):\n  1\. is: /);
});

test('package.json yokken npm betigi uyarisi; yarn ve pnpm de taninir', () => {
  const kok = proje();
  assert.match(listeDenetimi(kok, [is('npm test')], { ajanlar })[0]!.uyari, /package\.json yok/);
  const kok2 = proje({ scripts: {} });
  assert.equal(listeDenetimi(kok2, [is('yarn test'), is('pnpm run e2e')], { ajanlar }).length, 2);
});

test('pencere: liste kaydedilince ve acilinca uyarilar doner', async () => {
  const kok = proje({ scripts: {} });
  const p = await pencereAc(kok);
  const api = (yol: string, govde?: unknown): Promise<any> => new Promise((ok, red) => {
    const r = request({ host: '127.0.0.1', port: p.port, path: yol, method: govde === undefined ? 'GET' : 'POST', headers: { host: `127.0.0.1:${p.port}`, 'x-mihenk-anahtar': p.anahtar, 'content-type': 'application/json' } }, (res) => {
      let s = ''; res.on('data', (d: Buffer) => { s += d; }); res.on('end', () => ok(JSON.parse(s)));
    });
    r.on('error', red);
    if (govde !== undefined) r.write(JSON.stringify(govde));
    r.end();
  });
  try {
    const kayit = await api('/api/liste', { isler: [{ tur: 't', ...is('npm test') }] });
    assert.match(kayit.uyarilar[0].uyari, /"test" betigi yok/);
    const ac = await api('/api/liste');
    assert.equal(ac.uyarilar.length, 1);
  } finally {
    await p.kapat();
  }
});
