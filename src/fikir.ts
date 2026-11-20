// Fikirden is listesine (Asama 32): kullanici fikrini duz dille yazar; kurulu bir ajan onu kucuk, tek tek denetlenebilir islere boler.
// Isler komutsuz uretilir: her isin kabul testini is baslamadan ajan yazar (test-once.ts). Kullanici onerilen isleri pencerede gorur,
// duzeltir ya da siler; kaydedip baslatir.
// Planlama proje klasorunde degil bos gecici bir klasorde calisir: ajan bolme sirasinda projeye dokunamaz. Projenin dosya adlari istemde
// verilir. Karsi gorus: proje klasorunde calisan ajan kodu okuyup daha iyi bolerdi; ama bu adimda degisiklik yapmasi engellenemezdi.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from './ajanlar.js';
import { projeDosyalari } from './bekci.js';
import { t } from './dil.js';
import type { HazirlikKosusu } from './test-once.js';

export interface OnerilenIs {
  tur: string;
  soru: string;
  beklenti: string;
  yanlissa: string;
  zorluk?: 'kolay' | 'orta' | 'zor';
}

const EN_COK_IS = 12;
const TUR = /^[a-z0-9_-]{1,40}$/;

export function fikirIstemi(fikir: string, dosyalar: readonly string[]): string {
  return [
    'Bu bir mihenk PLANLAMA adimidir. Hicbir dosya yazma ya da degistirme; yalniz plan cikar.',
    'Asagidaki fikri, bir yapay zeka kodlama aracinin tek tek yapabilecegi kucuk islere bol. Fikri yazan kisi kodlama bilmiyor.',
    `FIKIR: ${fikir}`,
    dosyalar.length ? `Projede su dosyalar var (ilk ${dosyalar.length}): ${dosyalar.join(', ')}` : 'Proje klasoru bos: is sifirdan baslar.',
    'Kurallar:',
    `- En cok ${EN_COK_IS} is; sirayla yapilacak; her is tek basina bitirilip denetlenebilir olmali.`,
    '- Her isin bittigi bir testle gosterilebilmeli (beklenti somut ve olculebilir olmali: "x yapilinca y gorulur").',
    '- Metinleri fikrin yazildigi dilde, kodlama terimi kullanmadan, kisa yaz.',
    '- tur su degerlerden biri: ozellik, hata_duzeltme, belge, diger. zorluk: kolay, orta ya da zor (durust tahmin).',
    'Son iletinde yalniz su JSON\'u yaz:',
    '{"isler": [{"tur": "ozellik", "soru": "ne yapilacak", "beklenti": "bitince ne gorulur", "yanlissa": "yanlissa ne gorulur", "zorluk": "orta"}]}',
  ].join('\n');
}

/** Metindeki son {"isler": [...]} nesnesini ayiklar ve dogrular; gecerli is yoksa null. */
export function isleriAyikla(metin: string): OnerilenIs[] | null {
  // Not: lastIndexOf(x, -1) yine 0'a bakar; bas 0 iken dongu biter (yoksa metnin basindaki gecersiz nesnede sonsuz donerdi).
  for (let bas = metin.lastIndexOf('{"isler"'); bas >= 0; bas = bas === 0 ? -1 : metin.lastIndexOf('{"isler"', bas - 1)) {
    // Dengeli suslu parantezle nesnenin sonunu bul (metinde baska JSON da olabilir).
    let derinlik = 0, tirnak = false, kac = false, son = -1;
    for (let i = bas; i < metin.length; i++) {
      const c = metin[i]!;
      if (tirnak) { if (kac) kac = false; else if (c === '\\') kac = true; else if (c === '"') tirnak = false; continue; }
      if (c === '"') tirnak = true;
      else if (c === '{') derinlik++;
      else if (c === '}' && --derinlik === 0) { son = i; break; }
    }
    if (son < 0) continue;
    try {
      const d = JSON.parse(metin.slice(bas, son + 1)) as { isler?: unknown };
      if (!Array.isArray(d.isler)) continue;
      const metinMi = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
      const isler = d.isler.slice(0, EN_COK_IS).flatMap((x: Record<string, unknown>): OnerilenIs[] => {
        if (!x || !metinMi(x.soru) || !metinMi(x.beklenti) || !metinMi(x.yanlissa)) return [];
        const tur = typeof x.tur === 'string' && TUR.test(x.tur) ? x.tur : 'ozellik';
        const zorluk = x.zorluk === 'kolay' || x.zorluk === 'orta' || x.zorluk === 'zor' ? x.zorluk : undefined;
        return [{ tur, soru: x.soru.trim(), beklenti: x.beklenti.trim(), yanlissa: x.yanlissa.trim(), ...(zorluk ? { zorluk } : {}) }];
      });
      if (isler.length) return isler;
    } catch {
      // gecersiz JSON: bir oncekine bakilir
    }
  }
  return null;
}

/** Fikri islere boler. kosucu: ajani verilen klasorde bassiz calistiran islev (testler sahtesini verir). */
export async function fikriBol(o: {
  kok: string;
  fikir: string;
  tanim: AjanTanimi;
  kosucu: (tanim: AjanTanimi, istem: string, cwd: string) => Promise<HazirlikKosusu>;
}): Promise<{ tamam: true; isler: OnerilenIs[] } | { tamam: false; neden: string }> {
  const fikir = o.fikir.trim();
  if (fikir.length < 10) return { tamam: false, neden: t('fk_kisa') };
  let dosyalar: string[] = [];
  try {
    dosyalar = projeDosyalari(o.kok).filter((y) => !/^(\.mihenk|\.claude|\.agents|\.codex|\.qwen|\.gemini|\.cline|node_modules)\//.test(y)).slice(0, 200);
  } catch {
    dosyalar = [];
  }
  const bos = mkdtempSync(join(tmpdir(), 'mihenk-planlama-'));
  const kosu = await o.kosucu(o.tanim, fikirIstemi(fikir.slice(0, 4000), dosyalar), bos);
  if (kosu.baslatma_hatasi) return { tamam: false, neden: t('to_baslamadi', { hata: kosu.baslatma_hatasi }) };
  const isler = isleriAyikla(kosu.son_metin);
  return isler ? { tamam: true, isler } : { tamam: false, neden: t('fk_ayiklanamadi') };
}
