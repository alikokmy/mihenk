// Asama 21 kabul olcutu: geri alinan "gecti" isi oneride basari sayilmiyor, oteki isler etkilenmiyor; rapor "geri alindi" gosteriyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter, type IsOlcumu } from '../src/defter.js';
import { geriAl, geriAlinanIsler } from '../src/geri.js';
import { oneriHesapla } from '../src/oneri.js';
import { raporHtml } from '../src/rapor.js';

test('sentetik: geri alinan gecti isi basari sayilmaz; oteki secenek etkilenmez', () => {
  const is = (ajan: string, n: number, geri: boolean): IsOlcumu => ({ id: n, tur: 't', ajan, model: 'm', durum: 'gecti', sure_sn: 10, deneme_sayisi: 1, maliyet_usd: 0.1, geri_alindi: geri });
  const veri = [...Array.from({ length: 6 }, (_, i) => is('a', i + 1, i < 3)), ...Array.from({ length: 6 }, (_, i) => is('b', i + 10, false))];
  const [t] = oneriHesapla(veri, { enAz: 5 });
  const a = t!.secenekler.find((s) => s.ajan === 'a')!;
  const b = t!.secenekler.find((s) => s.ajan === 'b')!;
  assert.equal(a.gecen, 3, 'uc geri alinan is basari sayilmadi');
  assert.equal(b.gecen, 6);
  assert.equal(t!.oneri?.ajan, 'b');
});

test('KABUL gercek defter: geri alinan is olcumde isaretlenir, oneri ve rapor yansitir; deneme kipi isaretlemez', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-geri-sinyal-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'a.txt'), 'once');
  const d = new Defter(kok);
  const ac = () => d.isAc({ tur: 't', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'kilo', model: 'm' }).id;
  const birinci = ac();
  writeFileSync(join(kok, 'a.txt'), 'birinci');
  await d.hukumVer({ is_id: birinci });
  const ikinci = ac();
  writeFileSync(join(kok, 'b.txt'), 'ikinci');
  await d.hukumVer({ is_id: ikinci });
  geriAl(kok, birinci, { deneme: true });
  assert.equal(geriAlinanIsler(kok).size, 0, 'onizleme isaretlemez');
  geriAl(kok, birinci);
  const olcum = d.olcumler();
  d.kapat();
  assert.equal(olcum.find((o) => o.id === birinci)!.geri_alindi, true);
  assert.equal(olcum.find((o) => o.id === ikinci)!.geri_alindi, false);
  assert.equal(oneriHesapla(olcum, { enAz: 1 })[0]!.secenekler[0]!.gecen, 1);
  const { html } = raporHtml(kok);
  assert.match(html, new RegExp(`data-geri-alindi="${birinci}"`));
  assert.doesNotMatch(html, new RegExp(`data-geri-alindi="${ikinci}"`));
  assert.match(html, /sonradan geri alındı/);
});
