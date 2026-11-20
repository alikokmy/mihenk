// Asama 28 kabul olcutu: kolay isleri alan ama zor iste zayif ajan ham oranda onde iken zorluga gore duzeltilmis oranda geride kalir;
// zorluk yazilmamis defterde sonuc eskisiyle ayni. Zorluk is listesinden ve is_ac'tan deftere yazilir, gecersiz deger reddedilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter, type IsOlcumu, type Zorluk } from '../src/defter.js';
import { listeDenetimi } from '../src/liste-denetim.js';
import { oneriHesapla, oneriMetni } from '../src/oneri.js';

let sayac = 0;
function isler(ajan: string, zorluk: Zorluk | null, n: number, gecen: number, maliyet = 0.1): IsOlcumu[] {
  return Array.from({ length: n }, (_, i) => ({
    id: ++sayac, tur: 'hata_duzeltme', ajan, model: 'm', durum: i < gecen ? 'gecti' as const : 'kaldi' as const, sure_sn: 60,
    deneme_sayisi: 1, maliyet_usd: maliyet, zorluk,
  }));
}

test('KABUL kolay isleri alan ajan ham oranda onde, zorluga gore duzeltilmis oranda geride', () => {
  // kolaycı: 18 kolay (hepsi gecti) + 2 zor (hicbiri): ham 18/20 = %90.
  // ustasi:   5 kolay (hepsi gecti) + 15 zor (12'si): ham 17/20 = %85.
  const veri = [...isler('kolayci', 'kolay', 18, 18), ...isler('kolayci', 'zor', 2, 0), ...isler('ustasi', 'kolay', 5, 5), ...isler('ustasi', 'zor', 15, 12)];
  const [t] = oneriHesapla(veri);
  const s = Object.fromEntries(t!.secenekler.map((x) => [x.ajan, x]));
  assert.ok(s.kolayci!.basari > s.ustasi!.basari, 'ham oranda kolayci onde');
  // Elle hesap. Tur agirligi: kolay 23/40, zor 17/40; turun orani: kolay 1, zor 12/17.
  // kolayci: kolay (18 + 2x1)/(18+2) = 1; zor (0 + 2x12/17)/(2+2) = 0.3529 -> 0.575 + 0.425 x 0.3529 = 0.725
  // ustasi:  kolay (5 + 2)/(5+2) = 1;     zor (12 + 2x12/17)/(15+2) = 0.7889 -> 0.575 + 0.425 x 0.7889 = 0.910
  assert.equal(s.kolayci!.duzeltilmis_basari, 0.725);
  assert.equal(s.ustasi!.duzeltilmis_basari, 0.91);
  assert.ok(s.ustasi!.aralik[0] > s.kolayci!.aralik[0], 'duzeltilmis alt sinirda ustasi onde');
  // Is basina maliyet ayni; duzeltmesiz kolayci basari basina daha ucuz gorunurdu, duzeltilmiste ustasi.
  assert.equal(t!.oneri!.ajan, 'ustasi');
  assert.deepEqual(s.kolayci!.zorluk_dagilimi, { kolay: 18, zor: 2 });
  assert.match(oneriMetni([t!]), /zorluk: kolay 18, zor 2; basari ham %90, zorluga gore duzeltilmis %73/);
});

test('KABUL zorluk yazilmamis defterde sonuc eskisiyle ayni', () => {
  const veri = [...isler('a', null, 10, 9, 0.1), ...isler('b', null, 10, 10, 0.5)];
  const [t] = oneriHesapla(veri);
  for (const s of t!.secenekler) {
    assert.equal(s.duzeltilmis_basari, null);
    assert.equal(s.zorluk_dagilimi, null);
  }
  assert.equal(t!.secenekler.find((s) => s.ajan === 'a')!.basari_basina_maliyet, 0.111111);
  assert.equal(t!.oneri!.ajan, 'a');
  assert.doesNotMatch(oneriMetni([t!]), /zorluk:/);
});

test('zorluk deftere yazilir, olcume gecer; gecersiz deger reddedilir; liste denetimi uyarir', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-zorluk-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  const defter = new Defter(kok);
  const g = { tur: 'ozellik', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan: 'claude', model: 'm' };
  const id = defter.isAc({ ...g, zorluk: 'zor' }).id;
  await defter.hukumVer({ is_id: id });
  assert.equal(defter.isAc(g).zorluk, null);
  assert.throws(() => defter.isAc({ ...g, zorluk: 'cok_zor' as Zorluk }), /zorluk kolay, orta ya da zor/);
  assert.equal(defter.olcumler().find((o) => o.id === id)!.zorluk, 'zor');
  defter.kapat();
  const u = listeDenetimi(kok, [{ ...g, zorluk: 'zorr' }, { ...g, zorluk: 'kolay' }]);
  assert.deepEqual(u.map((x) => x.is), [1]);
  assert.match(u[0]!.uyari, /zorluk/);
});
