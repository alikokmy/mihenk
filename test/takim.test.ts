// Asama 37 kabul olcutu (metamorfik karari 5, 2026-11-20): bilgi komutu kalan is "gecti" + not; bilgi komutu gecerse not yok; iki takim
// betigi birlikte butun test dosyalarini tam bir kez kapsiyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter } from '../src/defter.js';
import { raporHtml } from '../src/rapor.js';
import { takimlar } from './takim.js';

const KAYNAK = join(import.meta.dirname, '..', '..', 'test');

test('KABUL bilgi denetimi kalirsa is yine gecer ve kayda not duser; gecerse not yok; komutu yoksa eskisi gibi', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-takim-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(3);');
  const d = new Defter(kok);
  const G = { tur: 'belge', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'claude', model: 'm' };
  try {
    const a = d.isAc({ ...G, bilgi_komutu: 'node kalir.js' }).id;
    const ra = await d.hukumVer({ is_id: a });
    assert.equal(ra.durum, 'gecti', 'bilgi takimi isi durdurmaz');
    const ka = d.rapor({ is_id: a }).is!;
    assert.match(ka.bilgi_notu ?? '', /bilgi denetimi kaldi \(node kalir\.js; cikis kodu 3\)/);
    const b = d.isAc({ ...G, bilgi_komutu: 'node gecer.js' }).id;
    await d.hukumVer({ is_id: b });
    assert.equal(d.rapor({ is_id: b }).is!.bilgi_notu, null);
    const c = d.isAc(G).id;
    await d.hukumVer({ is_id: c });
    assert.equal(d.rapor({ is_id: c }).is!.bilgi_notu, null);
    assert.throws(() => d.isAc({ ...G, bilgi_komutu: 'curl x' }), /izin listesinde degil/);
  } finally {
    d.kapat();
  }
  assert.match(raporHtml(kok).html, /data-bilgi-notu=/);
});

test('KABUL iki takim butun test dosyalarini tam bir kez kapsar; bilgi takimi listesindeki dosyalar var', () => {
  const hepsi = readdirSync(KAYNAK).filter((d) => d.endsWith('.test.ts')).sort();
  const { bilgi, engel } = takimlar();
  assert.deepEqual([...bilgi, ...engel].sort(), hepsi);
  assert.equal(bilgi.filter((x) => engel.includes(x)).length, 0);
  assert.ok(bilgi.length >= 2);
  for (const d of bilgi) assert.ok(existsSync(join(KAYNAK, d)), d);
});
