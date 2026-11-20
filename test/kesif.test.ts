// Asama 29 kabul olcutu: sahte ajanlarla 10 islik listede (ajan: "oneri", kesif %20) 2 is verisi en az ajana gider; kesif_orani 0 iken
// hicbiri; secim belirlenimci (ayni defter, ayni sira, ayni sonuc) ve her isin neden o ajana gittigi deftere yazilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { Defter, type IsOlcumu } from '../src/defter.js';
import { ajanSec } from '../src/kesif.js';
import { oneriHesapla, oneriMetni } from '../src/oneri.js';
import { listeyiYurut } from '../src/surucu.js';

const BETIKLER = mkdtempSync(join(tmpdir(), 'mihenk-kesif-ajan-'));
// Istemdeki "dosya-N" adli dosyayi yazar: isi yapan ajan taklidi.
const BETIK = join(BETIKLER, 'yapar.mjs');
writeFileSync(BETIK, `import { writeFileSync } from 'node:fs';\nconst m = /dosya-\\d+/.exec(process.argv[2] ?? '');\nif (m) writeFileSync(m[0] + '.txt', 'x');\n`);
const sahte = (ad: string): AjanTanimi => ({
  ad, istemci: new RegExp(`^${ad}$`), komutBul: () => ({ program: process.execPath, onEk: [BETIK] }), argumanlar: (i) => [i],
  kullanimOku: () => undefined, metinOku: () => undefined,
});
const AJANLAR = { a_usta: sahte('a_usta'), b_yeni: sahte('b_yeni') };

async function kos(kesifOrani: number | null): Promise<{ ajanlar: string[]; notlar: string[] }> {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kesif-'));
  writeFileSync(join(kok, 'var.js'), "process.exit(require('node:fs').existsSync(process.argv[2] + '.txt') ? 0 : 1);");
  ayarYaz(kok, { bekci_dongu: false, ...(kesifOrani === null ? {} : { kesif_orani: kesifOrani }) });
  const isler = Array.from({ length: 10 }, (_, i) => ({
    tur: 'ozellik', soru: `dosya-${i + 1} adli dosyayi yaz`, beklenti: 'dosya var', yanlissa: 'yok', dogrulama_komutu: `node var.js dosya-${i + 1}`,
  }));
  const r = await listeyiYurut({ kok, liste: { ajan: 'oneri', isler }, saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: () => {} });
  assert.ok(r.isler.every((x) => x.durum === 'gecti'), JSON.stringify(r.isler.map((x) => x.not)));
  const defter = new Defter(kok);
  const raporlar = r.isler.map((x) => defter.rapor({ is_id: x.is_id }));
  defter.kapat();
  return {
    ajanlar: raporlar.map((x) => x.is!.ajan),
    notlar: raporlar.map((x) => (x.kanitlar ?? []).map((k) => k.icerik ?? '').find((c) => c.includes('ajan secimi')) ?? ''),
  };
}

test('KABUL kesif %20: 10 isten 2si (5. ve 10.) verisi en az ajana gider; nedenleri deftere yazilir; secim belirlenimci', { timeout: 180_000 }, async () => {
  const bir = await kos(null); // varsayilan %20
  assert.deepEqual(bir.ajanlar, ['a_usta', 'a_usta', 'a_usta', 'a_usta', 'b_yeni', 'a_usta', 'a_usta', 'a_usta', 'a_usta', 'b_yeni']);
  assert.match(bir.notlar[4]!, /KESIF - b_yeni bu turde yalniz 0 iste denendi/);
  assert.match(bir.notlar[9]!, /KESIF - b_yeni bu turde yalniz 1 iste denendi/);
  assert.match(bir.notlar[0]!, /oneri yok \(bu turde kapanmis is yok\); a_usta kullanildi/);
  // 6. iste a_usta 4 is, b_yeni 1 is: oneri icin veri yetersiz. 7. iste a_usta 5/5 gecti: oneri a_usta.
  assert.match(bir.notlar[6]!, /ONERI - a_usta/);
  assert.ok(bir.notlar.every((n) => n !== ''), 'her isin secim nedeni var');
  const iki = await kos(null);
  assert.deepEqual(iki.ajanlar, bir.ajanlar, 'ayni defter ve sira ayni secimi verir');
});

test('KABUL kesif_orani 0: hicbir is verisi az ajana gitmez', { timeout: 180_000 }, async () => {
  const s = await kos(0);
  assert.deepEqual(s.ajanlar, Array(10).fill('a_usta'));
});

let sayac = 0;
const isler = (ajan: string, n: number): IsOlcumu[] => Array.from({ length: n }, () => ({
  id: ++sayac, tur: 'belge', ajan, model: 'm', durum: 'gecti' as const, sure_sn: 60, deneme_sayisi: 1, maliyet_usd: 0.1,
}));

test('ajanSec: onerilen ajan kurulu degilse yedege duser; oneri metni kesif satiri yazar', () => {
  const olcum = isler('claude', 10);
  assert.equal(ajanSec({ tur: 'belge', olcumler: olcum, kurulu: ['claude', 'codex'], sira: 1, kesifOrani: 20 })!.ajan, 'claude');
  const yedek = ajanSec({ tur: 'belge', olcumler: olcum, kurulu: ['kilo', 'opencode'], sira: 1, kesifOrani: 20 })!;
  assert.equal(yedek.ajan, 'opencode', 'tercih sirasi: codex, opencode, kilo, claude');
  assert.equal(ajanSec({ tur: 'belge', olcumler: olcum, kurulu: [], sira: 1, kesifOrani: 20 }), null);
  const [t] = oneriHesapla(olcum, { kurulu: ['claude', 'codex', 'kilo'] });
  assert.deepEqual(t!.kesif, [{ ajan: 'codex', is_sayisi: 0 }, { ajan: 'kilo', is_sayisi: 0 }]);
  assert.match(oneriMetni([t!]), /Kesif onerisi: codex \(0\), kilo \(0\) bu turde az denendi/);
});
