// Komutsuz is (Asama 32): kodlama bilmeyen kullanici "isin bittigini gosteren komut" yazamaz. Bu durumda is iki adimda yurur:
// 1. HAZIRLIK: ajan isi yapmadan yalniz kabul testini yazar ve testi kosan komutu bildirir. Surucu denetler: yalniz test dosyalari
//    degismis olmali, komut izin listesinde olmali ve test simdi KALMALI (is yapilmadan gecen test isi olcmuyor demektir).
// 2. Is kaydi bu komutla acilir. Kayit acilirken test dosyalarinin ozeti alinir; ajan isi yaparken testi degistirirse "gecti" hukmu
//    supheli notu tasir (test kurcalama bekcisi, Asama 10).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AjanTanimi } from './ajanlar.js';
import { projeDosyalari, TEST_DOSYASI } from './bekci.js';
import { t } from './dil.js';
import { gectiMi, komutuCalistir, komutuCoz } from './dogrulama.js';
import { kayitOku } from './kaldir.js';

export interface HazirlikKosusu {
  son_metin: string;
  baslatma_hatasi?: string;
  sure_ms: number;
  kullanim: { girdi: number; onbellek_okuma: number; onbellek_yazma: number; cikti: number; maliyet_usd: number | null; model: string | null };
}

export interface TestOnceSonucu {
  tamam: boolean;
  /** Ajanin yazdigi ve simdi kalan testi kosan komut. */
  komut?: string;
  /** Basarisizsa duz dille neden. */
  neden?: string;
  test_dosyalari: string[];
  kosu?: HazirlikKosusu;
}

/**
 * Hazirlikta sayilmayan dosyalar: mihenk'in kurdugu araç ayarlari ve araçlarin kendi klasorleri. Araçlar baslarken bunlara kendiliginden
 * dokunabilir (gercek denemede Kilo CLI opencode.json'a kendi "$schema" satirini ekledi, 2026-11-20); bu ajanin isi degildir.
 */
const ARAC_KLASORU = /^(\.mihenk|node_modules|\.git|\.claude|\.agents|\.codex|\.qwen|\.gemini|\.cline|\.kilocode|\.opencode)\//;

function fotograf(kok: string): Map<string, string> {
  const m = new Map<string, string>();
  const kurulan = new Set(Object.keys(kayitOku(kok).dosyalar ?? {}));
  for (const y of projeDosyalari(kok)) {
    if (ARAC_KLASORU.test(y) || kurulan.has(y)) continue;
    try {
      m.set(y, createHash('sha256').update(readFileSync(join(kok, y))).digest('hex'));
    } catch {
      // okunamayan dosya atlanir
    }
  }
  return m;
}

/** Ajanin son iletisindeki {"dogrulama_komutu": "..."}; yoksa null. */
export function komutuAyikla(metin: string): string | null {
  const eslesmeler = [...metin.matchAll(/"dogrulama_komutu"\s*:\s*("(?:[^"\\]|\\.)*")/g)];
  const son = eslesmeler.at(-1);
  if (!son) return null;
  try {
    const k = JSON.parse(son[1]!) as string;
    return k.trim() || null;
  } catch {
    return null;
  }
}

export function hazirlikIstemi(is: { tur: string; soru: string; beklenti: string; yanlissa: string }, izinli: readonly string[]): string {
  return [
    'Bu bir mihenk HAZIRLIK adimidir. Isi YAPMA; yalniz isin kabul testini yaz.',
    `Is turu: ${is.tur}`,
    `Yapilacak is: ${is.soru}`,
    `Is dogru yapilinca ne gorulur: ${is.beklenti}`,
    `Yanlissa ne gorulur: ${is.yanlissa}`,
    'Kurallar:',
    '- Projenin kendi test aracini kullan; proje bossa ya da test araci yoksa Node.js\'in yerlesik test kosucusunu (node:test) kullan.',
    '- Testi test/ klasorune ya da adi .test. iceren bir dosyaya yaz. Uygulama kodunu yazma ya da degistirme; yalniz test dosyasi.',
    '- Test, beklentiyi gercekten olcmeli ve su an KALMALI (is henuz yapilmadi). Test sonradan degistirilmeyecek; iyi dusun.',
    `- Testi kosan tek komutu son iletinde tam olarak su bicimde yaz: {"dogrulama_komutu": "node --test test/ornek.test.js"}`,
    `- Komut kabuk karakteri (&&, |, >, $) icermez; yalniz su programlardan biriyle baslar: ${izinli.join(', ')}.`,
    '- Soru sorma; karar gereken yerde onerdigin secenegi uygula. Commit ya da push yapma.',
  ].join('\n');
}

/**
 * Hazirlik adimi. kosucu: ajani bassiz kipte calistiran islev (surucunun ajaniKostur'u; testler sahtesini verir).
 */
export async function testOnceYazdir(o: {
  kok: string;
  tanim: AjanTanimi;
  is: { tur: string; soru: string; beklenti: string; yanlissa: string; zaman_asimi_sn?: number };
  izinli: readonly string[];
  ciktiDosyasi: string;
  dogrulamaCiktisi: string;
  kosucu: (tanim: AjanTanimi, istem: string) => Promise<HazirlikKosusu>;
}): Promise<TestOnceSonucu> {
  const once = fotograf(o.kok);
  const kosu = await o.kosucu(o.tanim, hazirlikIstemi(o.is, o.izinli));
  if (kosu.baslatma_hatasi) return { tamam: false, neden: t('to_baslamadi', { hata: kosu.baslatma_hatasi }), test_dosyalari: [], kosu };
  const sonra = fotograf(o.kok);
  const degisen = [...new Set([...once.keys(), ...sonra.keys()])].filter((y) => once.get(y) !== sonra.get(y)).sort();
  const testDisi = degisen.filter((y) => !TEST_DOSYASI.test(y));
  const testler = degisen.filter((y) => TEST_DOSYASI.test(y));
  if (testDisi.length > 0) return { tamam: false, neden: t('to_test_disi', { dosyalar: testDisi.slice(0, 5).join(', ') }), test_dosyalari: testler, kosu };
  if (testler.length === 0) return { tamam: false, neden: t('to_test_yok'), test_dosyalari: [], kosu };
  const komut = komutuAyikla(kosu.son_metin);
  if (!komut) return { tamam: false, neden: t('to_komut_yok'), test_dosyalari: testler, kosu };
  let cozulmus;
  try {
    cozulmus = komutuCoz(komut, o.izinli);
  } catch (e) {
    return { tamam: false, neden: t('to_komut_red', { komut, neden: e instanceof Error ? e.message.split('\n')[0]! : String(e) }), test_dosyalari: testler, kosu };
  }
  const k = await komutuCalistir(cozulmus, { cwd: o.kok, zamanAsimiMs: (o.is.zaman_asimi_sn ?? 120) * 1000, ciktiDosyasi: o.dogrulamaCiktisi });
  if (gectiMi(k)) return { tamam: false, neden: t('to_test_geciyor', { komut }), test_dosyalari: testler, kosu };
  return { tamam: true, komut, test_dosyalari: testler, kosu };
}
