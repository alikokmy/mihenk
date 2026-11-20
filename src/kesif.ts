// Kesif (Asama 29): hep ayni ajan kullanilirsa otekiler hakkinda veri birikmez. Surucude "ajan": "oneri" secilince her is icin ajan
// burada secilir: is turu basina onerilen ajan; ama her `adim`. iste (kesif_orani %20 ise her 5. is) bu turde verisi en az olan kurulu
// ajan. Secim belirlenimcidir (ayni defter, ayni sira, ayni sonuc) ve nedeni ise not olarak yazilir.
// Karsi gorus: Thompson orneklemesi gibi rastgele yontemler kuramsal olarak daha iyi; belirlenimci kural tekrarlanabilir ve aciklanabilir.
import type { IsOlcumu } from './defter.js';
import { t } from './dil.js';
import { oneriHesapla, VARSAYILAN_ONERI_AYARLARI, type OneriAyarlari } from './oneri.js';

/** Iste "ajan" yerine yazilan ozel ad: ajani oneri secer. */
export const ONERI_AJANI = 'oneri';
/** Varsayilan kesif orani (yuzde): her 5 isten biri. */
export const VARSAYILAN_KESIF_ORANI = 20;
/** Oneri yokken (soguk baslangic) tercih sirasi: once ucretsiz calisabilenler (cli "sur" ile ayni). */
export const TERCIH_SIRASI = ['codex', 'opencode', 'kilo', 'claude'] as const;

export interface AjanSecimi {
  ajan: string;
  kesif: boolean;
  neden: string;
}

/** Bu turde, kurulu ajanlar arasinda verisi en az olanlar (en az is sayisindan az), azdan coga, esitlikte ada gore. */
export function kesifAdaylari(olcumler: readonly IsOlcumu[], tur: string, kurulu: readonly string[], enAz = VARSAYILAN_ONERI_AYARLARI.enAz): Array<{ ajan: string; is_sayisi: number }> {
  return kurulu
    .map((ajan) => ({ ajan, is_sayisi: olcumler.filter((o) => o.tur === tur && o.ajan === ajan).length }))
    .filter((a) => a.is_sayisi < enAz)
    .sort((x, y) => x.is_sayisi - y.is_sayisi || x.ajan.localeCompare(y.ajan));
}

/**
 * sira: bu kosuda bu turden oneriyle secilen kacinci is (1'den baslar). kesifOrani: yuzde (0 kapatir).
 * varsayilan: oneri yokken kullanilacak ajan (kuruluysa).
 */
export function ajanSec(o: { tur: string; olcumler: readonly IsOlcumu[]; kurulu: readonly string[]; sira: number; kesifOrani: number; varsayilan?: string; oneriAyarlari?: Partial<OneriAyarlari> }): AjanSecimi | null {
  if (o.kurulu.length === 0) return null;
  const enAz = o.oneriAyarlari?.enAz ?? VARSAYILAN_ONERI_AYARLARI.enAz;
  const az = kesifAdaylari(o.olcumler, o.tur, o.kurulu, enAz);
  const adim = o.kesifOrani > 0 ? Math.max(1, Math.round(100 / o.kesifOrani)) : 0;
  if (adim > 0 && az.length > 0 && o.sira % adim === 0) {
    const a = az[0]!;
    return { ajan: a.ajan, kesif: true, neden: t('k_kesif', { ajan: a.ajan, sayi: a.is_sayisi, en_az: enAz, adim }) };
  }
  const tur = oneriHesapla(o.olcumler.filter((x) => x.tur === o.tur), o.oneriAyarlari ?? {})[0];
  if (tur?.oneri && o.kurulu.includes(tur.oneri.ajan)) {
    return { ajan: tur.oneri.ajan, kesif: false, neden: t('k_oneri', { ajan: tur.oneri.ajan, gerekce: tur.oneri.gerekce }) };
  }
  const yedek = (o.varsayilan && o.kurulu.includes(o.varsayilan) ? o.varsayilan : undefined)
    ?? TERCIH_SIRASI.find((a) => o.kurulu.includes(a)) ?? [...o.kurulu].sort()[0]!;
  return { ajan: yedek, kesif: false, neden: t('k_oneri_yok', { ajan: yedek, not: tur?.not || t('k_veri_yok') }) };
}
