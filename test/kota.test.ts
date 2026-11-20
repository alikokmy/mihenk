// Asama 27 kabul olcutu: abonelikli ajanin isi "maliyet bilinmiyor" yerine kota payi gosterir; pencere degeri verilince dolarli ajanla
// karsilastirilir ve ucuz olan secilir; verilmeyince "karsilastirilamadi" notu ve basariya gore secim; kota hatasi anindaki pencere
// tuketiminden kapasite tahmini elle hesapla ayni.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { Defter, kotaBirimi, type IsOlcumu } from '../src/defter.js';
import { oneriHesapla } from '../src/oneri.js';
import { listeyiYurut } from '../src/surucu.js';

test('kota birimi: girdi 1, cikti 5, onbellekten okuma 0,1, onbellege yazma 1,25 (elle hesap)', () => {
  // 1000 + 100*5 + 10000*0,1 + 400*1,25 = 1000 + 500 + 1000 + 500
  assert.equal(kotaBirimi({ girdi: 1000, cikti: 100, onbellek_okuma: 10_000, onbellek_yazma: 400 }), 3000);
});

let sayac = 0;
/** n is, ilk `gecen` tanesi gecti; her is ya dolar ya kota payi (ve istenirse dolar karsiligi) tasir. */
function isler(ajan: string, n: number, gecen: number, o: { usd?: number; pay?: number; payUsd?: number }): IsOlcumu[] {
  return Array.from({ length: n }, (_, i) => ({
    id: ++sayac, tur: 'ozellik', ajan, model: 'm', durum: i < gecen ? 'gecti' as const : 'kaldi' as const, sure_sn: 60, deneme_sayisi: 1,
    maliyet_usd: o.usd ?? null,
    ...(o.pay !== undefined ? { abonelik: true, kota_birimi: Math.round(o.pay * 1e6), kota_payi: o.pay, kota_kaynagi: 'ayar' as const, kota_usd: o.payUsd ?? null } : {}),
  }));
}

test('KABUL abonelikli ajan "maliyet bilinmiyor" yerine kota payi gosterir', () => {
  const [t] = oneriHesapla(isler('claude', 10, 10, { pay: 0.02 }));
  const s = t!.secenekler[0]!;
  assert.equal(s.abonelik, true);
  assert.equal(s.basari_basina_kota_payi, 0.02);
  assert.match(s.maliyet_metni, /kota penceresinin %2'i\/basari/);
  assert.doesNotMatch(s.maliyet_metni, /bilinmiyor/);
});

test('KABUL pencere degeri verilince dolarli ajanla karsilastirilir, ucuz olan secilir', () => {
  // Abonelik: is basina pencerenin %2'si, pencere 5 USD -> 0,10 USD/basari.
  const abone = isler('claude', 10, 10, { pay: 0.02, payUsd: 0.1 });
  const [ucuzAbone] = oneriHesapla([...abone, ...isler('api', 10, 10, { usd: 0.3 })]);
  assert.equal(ucuzAbone!.oneri!.ajan, 'claude');
  assert.match(ucuzAbone!.oneri!.gerekce, /maliyeti en dusuk \(0\.1 USD\)/);
  const [ucuzApi] = oneriHesapla([...abone, ...isler('api', 10, 10, { usd: 0.05 })]);
  assert.equal(ucuzApi!.oneri!.ajan, 'api');
});

test('KABUL pencere degeri yokken dolar ve kota karsilastirilmaz: basariya gore secim ve ne yapilacagini soyleyen not', () => {
  // Dolarli ajan cok ucuz ama 18/20; abonelikli 20/20. Maliyetle secilseydi dolarli kazanirdi.
  const [t] = oneriHesapla([...isler('claude', 20, 20, { pay: 0.05 }), ...isler('api', 20, 18, { usd: 0.001 })]);
  assert.equal(t!.oneri!.ajan, 'claude');
  assert.match(t!.oneri!.gerekce, /maliyetle degil, basari oraninin alt siniriyla/);
  assert.match(t!.not, /en ucuz dolarli secenek: api \/ m; en az kota yiyen: claude \/ m/);
  assert.match(t!.not, /"pencere_usd"/);
});

test('iki abonelikli secenek kota payiyla karsilastirilir', () => {
  const [t] = oneriHesapla([...isler('claude', 10, 10, { pay: 0.04 }), ...isler('codex', 10, 10, { pay: 0.01 })]);
  assert.equal(t!.oneri!.ajan, 'codex');
  assert.match(t!.oneri!.gerekce, /kota payi en dusuk \(pencerenin %1'i\)/);
});

test('KABUL gercek defter: kota ayari olan ajan abonelik sayilir; kapasite ayardan ya da kota hatasindan (alt sinir) gelir', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kota-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'mihenk.json'), JSON.stringify({ kota: { claude: { pencere_saat: 5, kapasite: 1_000_000, pencere_usd: 5 } } }));
  const defter = new Defter(kok);
  const ac = (ajan: string): number => defter.isAc({ tur: 'ozellik', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node gecer.js', ajan, model: 'm' }).id;
  const k = { sure_ms: 1000, girdi: 1000, cikti: 100, onbellek_okuma: 10_000, onbellek_yazma: 400, oturum: 1 }; // 3000 birim
  const c = ac('claude');
  defter.kullanimEkle({ ...k, is_id: c, ajan: 'claude', maliyet_usd: 0.2 }); // aracin bildirdigi dolar: API karsiligi
  await defter.hukumVer({ is_id: c });
  const x = ac('codex');
  defter.kullanimEkle({ ...k, is_id: x, ajan: 'codex', maliyet_usd: null });
  defter.kullanimEkle({ ...k, is_id: x, ajan: 'codex', maliyet_usd: null, oturum: 2 });
  await defter.hukumVer({ is_id: x });

  let o = defter.olcumler();
  const cl = o.find((i) => i.id === c)!;
  assert.deepEqual([cl.abonelik, cl.kota_birimi, cl.kota_payi, cl.kota_kaynagi, cl.kota_usd], [true, 3000, 0.003, 'ayar', 0.015]);
  const cx = o.find((i) => i.id === x)!;
  assert.deepEqual([cx.abonelik, cx.kota_birimi, cx.kota_payi], [true, 6000, null], 'kapasite bilinmiyor');

  // Pencerenin disinda kalan gozlem (6 saat sonra): tuketim 0, tahmin olusmaz.
  assert.equal(defter.kotaSiniriEkle('codex', new Date(Date.now() + 6 * 3_600_000)).tuketim, 0);
  assert.equal(defter.kotaKapasitesi('codex'), null);
  // Simdi: pencere icindeki iki oturum = 6000 birim; kapasite en az bu kadar.
  assert.equal(defter.kotaSiniriEkle('codex', new Date(Date.now() + 60_000)).tuketim, 6000);
  assert.deepEqual(defter.kotaKapasitesi('codex'), { deger: 6000, kaynak: 'tahmin', gozlem: 2 });
  o = defter.olcumler();
  const cx2 = o.find((i) => i.id === x)!;
  assert.deepEqual([cx2.kota_payi, cx2.kota_kaynagi], [1, 'tahmin']);
  defter.kapat();
  const s = oneriHesapla(o).flatMap((t) => t.secenekler).find((y) => y.ajan === 'codex')!;
  assert.match(s.maliyet_metni, /alt sinir/);
});

test('KABUL surucu: saglayici kota hatasinda pencere tuketimini kaydeder', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kota-surucu-'));
  writeFileSync(join(kok, 'hedef-var.js'), "process.exit(require('node:fs').existsSync('hedef.txt') ? 0 : 1);");
  ayarYaz(kok, { bekci_dongu: false });
  const betik = join(kok, '..', `kotali-${process.pid}-${Date.now()}.mjs`);
  // Ilk oturum 3000 birim harcar ve 429 alir; ikincisi isi yapar.
  writeFileSync(betik, `import { existsSync, writeFileSync } from 'node:fs';
console.log(JSON.stringify({ kullanim: { girdi: 1000, cikti: 100, onbellek_okuma: 10000, onbellek_yazma: 400, maliyet_usd: null } }));
if (!existsSync('kota-gecti.txt')) { writeFileSync('kota-gecti.txt', '1'); console.log(JSON.stringify({ type: 'error', error: { data: { message: 'usage limit reached', statusCode: 429 } } })); }
else writeFileSync('hedef.txt', 'x');
`);
  const ajan: AjanTanimi = {
    ad: 'kotali', istemci: /^kotali$/, komutBul: () => ({ program: process.execPath, onEk: [betik] }), argumanlar: (i) => [i],
    kullanimOku: () => undefined, metinOku: () => undefined,
    kullanimKatkisi: (s) => (s && typeof s === 'object' && 'kullanim' in s ? { tur: 'artis' as const, ...(s as { kullanim: object }).kullanim } as never : undefined),
  };
  const r = await listeyiYurut({ kok, liste: { ajan: 'kotali', isler: [{ tur: 'ozellik', soru: 'k', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node hedef-var.js' }] },
    saklama: 'yok', ajanlar: { kotali: ajan }, korunanDizinler: [], yaz: () => {}, kotaBeklemeMs: 10 });
  assert.equal(r.isler[0]!.durum, 'gecti');
  const defter = new Defter(kok);
  assert.deepEqual(defter.kotaKapasitesi('kotali'), { deger: 3000, kaynak: 'tahmin', gozlem: 1 });
  defter.kapat();
});
