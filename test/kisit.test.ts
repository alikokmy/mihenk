// Asama 36 kabul olcutu (metamorfik karari 7, 2026-11-20): isaretli karar raporda ayri bolumde ve sayida; eski defter aciliyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Defter } from '../src/defter.js';
import { raporHtml } from '../src/rapor.js';

const G = { tur: 'ozellik', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node -v', ajan: 'claude', model: 'm' };
const K = { konu: 'Veritabani gocu', secenekler: ['simdi', 'sonra'], secilen: 'once goc betigi, sonra ozellik', karsi_gorus: 'gecikir' };

test('KABUL kisit ekleyen karar raporda ayri bolumde ve sayida; isaretsiz karar o bolume girmez', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kisit-'));
  const d = new Defter(kok);
  const id = d.isAc(G).id;
  d.kararYaz({ is_id: id, ...K, kisit_ekler: true });
  d.kararYaz({ is_id: id, ...K, konu: 'Degisken adi', kisit_ekler: false });
  d.kararYaz({ is_id: id, ...K, konu: 'Bicim' });
  assert.deepEqual(d.kisitKararlari().map((x) => x.konu), ['Veritabani gocu']);
  assert.deepEqual(d.rapor({ is_id: id }).kararlar!.map((k) => k.kisit_ekler), [true, false, false]);
  d.kapat();
  const html = raporHtml(kok).html;
  assert.match(html, /data-kisit-sayisi="1"/);
  assert.match(html, /Veritabani gocu/);
  assert.doesNotMatch(html.slice(html.indexOf('id="kisitlar"'), html.indexOf('</section>', html.indexOf('id="kisitlar"'))), /Degisken adi|Bicim/);
});

test('isaretsiz defterde rapor kisit bolumu cizmez; eski defter (kisit_ekler sutunu yok) acilir', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kisit-eski-'));
  const d1 = new Defter(kok);
  const id = d1.isAc(G).id;
  d1.kararYaz({ is_id: id, ...K });
  d1.kapat();
  assert.doesNotMatch(raporHtml(kok).html, /id="kisitlar"/);
  const db = new DatabaseSync(join(kok, '.mihenk', 'defter.db'));
  db.exec('ALTER TABLE kararlar DROP COLUMN kisit_ekler;');
  db.close();
  const d2 = new Defter(kok);
  try {
    assert.equal(d2.rapor({ is_id: id }).kararlar![0]!.kisit_ekler, false);
    d2.kararYaz({ is_id: id, ...K, kisit_ekler: true });
    assert.equal(d2.kisitKararlari().length, 1);
  } finally {
    d2.kapat();
  }
});
