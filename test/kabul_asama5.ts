// Asama 5 kabul denemesi: "kapanan her iste sure ve maliyet dolu; elle hesapla orneklemde uyusuyor".
// Defterdeki sayilari, ajanlarin ham ciktisindan BAGIMSIZ bir yolla yeniden hesaplar: src/ajanlar.ts kullanilmaz;
// her aracin satiri gercek ciktida goruldugu bicimiyle duz metin olarak (duzenli ifadeyle) okunur.
// Kullanim: node dist/test/kabul_asama5.js --proje <surucunun kostugu proje klasoru>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Defter } from '../src/defter.js';

const i = process.argv.indexOf('--proje');
const proje = i >= 0 ? process.argv[i + 1] : undefined;
if (!proje || !existsSync(join(proje, '.mihenk', 'defter.db'))) {
  console.error('kullanim: node dist/test/kabul_asama5.js --proje <klasor> (klasorde .mihenk/defter.db olmali)');
  process.exit(2);
}

interface Elle { girdi: number; onbellek_okuma: number; onbellek_yazma: number; cikti: number; maliyet_usd: number | null }
const n = (x: string | undefined): number => Number(x ?? 0);

/** Tek oturum dosyasindan, aracin cikti bicimine gore duz metin okumayla. */
function elleHesapla(ajan: string, metin: string): Elle {
  const e: Elle = { girdi: 0, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 0, maliyet_usd: null };
  if (ajan === 'claude') {
    const sonuc = metin.split('\n').filter((s) => s.includes('"type":"result"')).pop() ?? '';
    const u = /"usage":\{"input_tokens":(\d+),"cache_creation_input_tokens":(\d+),"cache_read_input_tokens":(\d+),"output_tokens":(\d+)/.exec(sonuc);
    const m = /"total_cost_usd":([0-9.eE-]+)/.exec(sonuc);
    if (u) Object.assign(e, { girdi: n(u[1]), onbellek_yazma: n(u[2]), onbellek_okuma: n(u[3]), cikti: n(u[4]) });
    if (m) e.maliyet_usd = n(m[1]);
  } else if (ajan === 'codex') {
    for (const u of metin.matchAll(/"turn\.completed","usage":\{"input_tokens":(\d+),"cached_input_tokens":(\d+),"cache_write_input_tokens":(\d+),"output_tokens":(\d+)/g)) {
      e.girdi += n(u[1]) - n(u[2]);
      e.onbellek_okuma += n(u[2]);
      e.onbellek_yazma += n(u[3]);
      e.cikti += n(u[4]);
    }
  } else if (ajan === 'opencode' || ajan === 'kilo') {
    // Kilo 7.8.27: tokens alani "total" ile baslar; geri kalani OpenCode'la ayni.
    for (const u of metin.matchAll(/"cost":([0-9.eE-]+),"tokens":\{(?:"total":\d+,)?"input":(\d+),"output":(\d+),"reasoning":(\d+),"cache":\{"read":(\d+),"write":(\d+)\}/g)) {
      e.maliyet_usd = (e.maliyet_usd ?? 0) + n(u[1]);
      e.girdi += n(u[2]);
      e.cikti += n(u[3]) + n(u[4]);
      e.onbellek_okuma += n(u[5]);
      e.onbellek_yazma += n(u[6]);
    }
  }
  return e;
}

const defter = new Defter(proje);
const isler = (defter.rapor({ sinir: 100 }).isler ?? []).reverse().map((x) => defter.rapor({ is_id: x.id }));
defter.kapat();
const ciktilar = readdirSync(join(proje, '.mihenk', 'ciktilar'));

let tamam = true;
const yaz = (ok: boolean, metin: string): void => {
  if (!ok) tamam = false;
  console.log(`  ${ok ? 'tamam' : 'UYUSMADI'}: ${metin}`);
};

for (const r of isler) {
  const is = r.is!;
  const t = is.kullanim_toplami;
  console.log(`is ${is.id} (${is.ajan}, ${is.durum}):`);
  yaz(is.durum !== 'acik', 'is kapali');
  // Sure: baslangic ve bitisten elle.
  const elleSure = is.bitis ? Math.round((Date.parse(is.bitis) - Date.parse(is.baslangic)) / 100) / 10 : null;
  yaz(is.sure_sn !== null && is.sure_sn === elleSure, `sure dolu: defter ${is.sure_sn} sn, elle ${elleSure} sn`);
  yaz(t.oturum >= 1, `kullanim kaydi var (${t.oturum} oturum, ajan ${t.ajan_sure_sn} sn)`);
  // Maliyet: ya bir deger ya da acik bir "bilinmiyor".
  yaz(t.maliyet_usd !== null || t.maliyeti_bilinmeyen_oturum > 0,
    `maliyet dolu: ${t.maliyet_usd === null ? `bilinmiyor (${t.maliyeti_bilinmeyen_oturum} oturumda arac bildirmedi)` : `${t.maliyet_usd} USD`}`);

  // Ham ciktidan elle yeniden hesap.
  const elle: Elle = { girdi: 0, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 0, maliyet_usd: null };
  for (const d of ciktilar.filter((d) => d.startsWith(`ajan-is-${is.id}-oturum-`))) {
    const e = elleHesapla(is.ajan, readFileSync(join(proje, '.mihenk', 'ciktilar', d), 'utf8'));
    elle.girdi += e.girdi; elle.onbellek_okuma += e.onbellek_okuma; elle.onbellek_yazma += e.onbellek_yazma; elle.cikti += e.cikti;
    if (e.maliyet_usd !== null) elle.maliyet_usd = (elle.maliyet_usd ?? 0) + e.maliyet_usd;
  }
  for (const alan of ['girdi', 'onbellek_okuma', 'onbellek_yazma', 'cikti'] as const) {
    yaz(t[alan] === elle[alan], `${alan}: defter ${t[alan]}, elle ${elle[alan]}`);
  }
  const maliyetAyni = t.maliyet_usd === null ? elle.maliyet_usd === null : elle.maliyet_usd !== null && Math.abs(t.maliyet_usd - elle.maliyet_usd) < 1e-6;
  yaz(maliyetAyni, `maliyet: defter ${t.maliyet_usd}, elle ${elle.maliyet_usd === null ? null : Math.round(elle.maliyet_usd * 1e6) / 1e6}`);
}
console.log(tamam && isler.length > 0 ? `GECTI: ${isler.length} iste sure ve maliyet dolu, elle hesapla uyusuyor.` : 'KALDI: uyusmayan alan var.');
process.exit(tamam && isler.length > 0 ? 0 : 1);
