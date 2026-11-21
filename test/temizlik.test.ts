// Asama 39 kabul olcutu (metamorfik karari 8, 2026-11-20): sentetik projede yalniz kullanilmayan ciktilar siliniyor; kaldi isinin ciktisi
// duruyor; giderilmis kusurun ciktisi siliniyor; atif defterde kaliyor ve "silindi" isaretli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter } from '../src/defter.js';
import { ciktilariTemizle } from '../src/temizlik.js';

test('KABUL yalniz kullanilmayan ciktilar silinir: gecti ve giderilmis kusur silinir; kaldi, acik ve basarisiz hazirlik durur', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-temizlik-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  const d = new Defter(kok);
  const G = { tur: 'ozellik', soru: 's', beklenti: 'b', yanlissa: 'y', ajan: 'claude', model: 'm' };
  const gecen = d.isAc({ ...G, dogrulama_komutu: 'node gecer.js', etiket: 'a' }).id;
  await d.hukumVer({ is_id: gecen });
  const kalan = d.isAc({ ...G, dogrulama_komutu: 'node kalir.js', etiket: 'b' }).id;
  await d.hukumVer({ is_id: kalan, hukum: 'kaldi', gerekce: 'olmadi' });
  const giderilen = d.isAc({ ...G, dogrulama_komutu: 'node kalir.js', etiket: 'c' }).id;
  await d.hukumVer({ is_id: giderilen, hukum: 'kaldi', gerekce: 'olmadi' });
  const duzelten = d.isAc({ ...G, dogrulama_komutu: 'node gecer.js', etiket: 'c' }).id;
  await d.hukumVer({ is_id: duzelten });
  const acik = d.isAc({ ...G, dogrulama_komutu: 'node gecer.js', etiket: 'd' }).id;
  d.kapat();
  const dz = join(kok, '.mihenk', 'ciktilar');
  const h = (e: string) => createHash('sha1').update(e).digest('hex').slice(0, 8);
  for (const ad of [`ajan-is-${gecen}-oturum-1.txt`, `ajan-is-${kalan}-oturum-1.txt`, `ajan-is-${giderilen}-oturum-1.txt`, `ajan-is-${acik}-oturum-1.txt`,
    `hazirlik-${h('a')}.txt`, `hazirlik-${h('zzz-kaydi-yok')}.txt`, 'planlama.txt', 'baska.txt']) writeFileSync(join(dz, ad), 'x');
  const r = ciktilariTemizle(kok);
  const kalanlar = readdirSync(dz);
  // Silinenler
  for (const ad of [`ajan-is-${gecen}-oturum-1.txt`, `ajan-is-${giderilen}-oturum-1.txt`, `ajan-is-${duzelten}-`, `hazirlik-${h('a')}.txt`, 'planlama.txt']) {
    assert.ok(!kalanlar.some((k) => k.startsWith(ad)), `silinmeliydi: ${ad}`);
  }
  // Duranlar
  for (const ad of [`ajan-is-${kalan}-oturum-1.txt`, `ajan-is-${acik}-oturum-1.txt`, `hazirlik-${h('zzz-kaydi-yok')}.txt`, 'baska.txt']) {
    assert.ok(kalanlar.includes(ad), `durmaliydi: ${ad}`);
  }
  assert.ok(kalanlar.some((k) => k.startsWith(`is-${kalan}-deneme-`)), 'kaldi isinin dogrulama ciktisi duruyor');
  assert.ok(r.silinen.length >= 5);
  // Atif kalir, silindi isaretli; durani isaretsiz.
  const d2 = new Defter(kok);
  const kg = d2.rapor({ is_id: gecen }).kanitlar!.find((k) => k.kaynak === 'sunucu')!;
  assert.ok(kg.cikti_dosyasi && kg.cikti_silindi === true);
  assert.equal(d2.rapor({ is_id: kalan }).kanitlar!.find((k) => k.kaynak === 'sunucu')!.cikti_silindi, undefined);
  d2.kapat();
  assert.ok(existsSync(join(kok, '.mihenk', 'defter.db')), 'defter silinmez');
});
