// Oneri: defterdeki olculmus sonuclardan is turu basina ajan / model onerisi (Asama 6).
// Birim kapanmis istir. Basari yalniz dogrulanmis "gecti"dir; "kaldi" ve "belirsiz" basarisiz sayilir (ajanin beyani sayilmaz).
// Secenek, basari oraninin alt guven siniri esigi gecenler arasindan, basari basina beklenen maliyeti en dusuk olandir
// (basarisiz islerin ve yeniden denemelerin maliyeti dahil); esitlikte sure. Az veride oneri verilmez: "veri yetersiz".
// Kullanici her zaman kendi secimini yapar; bu hesap yalniz gosterir.
import type { IsOlcumu } from './defter.js';
import { t as ileti } from './dil.js';

export interface UyumOlcumu {
  gecen: number;
  toplam: number;
}

export interface OneriAyarlari {
  /** Basari oraninin alt guven sinirinin gecmesi gereken deger (0-1). */
  esik: number;
  /** Bir secenegin degerlendirilmesi icin gereken en az kapanmis is. */
  enAz: number;
  /** Uyum orani bunun altindaki secenek onerilmez (uyum olculmusse). */
  uyumEsigi: number;
  /** Arac adina gore uyum testi sonucu (mihenk uyum). */
  uyum?: Record<string, UyumOlcumu>;
}

export const VARSAYILAN_ONERI_AYARLARI: OneriAyarlari = { esik: 0.5, enAz: 5, uyumEsigi: 0.8 };

export type SecenekDurumu = 'aday' | 'veri_yetersiz' | 'esik_alti' | 'uyum_dusuk';

export interface Secenek {
  ajan: string;
  model: string;
  is_sayisi: number;
  gecen: number;
  basari: number;
  /** Basari oraninin %95 Wilson araligi. */
  aralik: [number, number];
  /** Basari basina beklenen maliyet: butun islerin maliyeti / gecen. Bir isin bile maliyeti bilinmiyorsa null. */
  basari_basina_maliyet: number | null;
  /** Is basina maliyetin en kucugu ve en buyugu (belirsizligi gostermek icin). */
  maliyet_araligi: [number, number] | null;
  maliyeti_bilinmeyen_is: number;
  /** Basari basina beklenen sure: butun islerin suresi / gecen. */
  basari_basina_sure_sn: number | null;
  uyum: (UyumOlcumu & { oran: number }) | null;
  durum: SecenekDurumu;
}

export interface TurOnerisi {
  tur: string;
  is_sayisi: number;
  secenekler: Secenek[];
  oneri: { ajan: string; model: string; gerekce: string } | null;
  /** Oneri yoksa neden; varsa ek notlar. */
  not: string;
}

/** Basari oraninin %95 Wilson araligi. Hic veri yoksa [0, 1]. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const merkez = p + z2 / (2 * n);
  const pay = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const bolen = 1 + z2 / n;
  return [Math.max(0, (merkez - pay) / bolen), Math.min(1, (merkez + pay) / bolen)];
}

const yuvarla = (x: number, b = 6): number => Math.round(x * 10 ** b) / 10 ** b;

function secenekHesapla(isler: IsOlcumu[], a: OneriAyarlari): Secenek {
  const { ajan, model } = isler[0]!;
  const n = isler.length;
  const gecen = isler.filter((i) => i.durum === 'gecti').length;
  const bilinmeyen = isler.filter((i) => i.maliyet_usd === null).length;
  const maliyetler = isler.map((i) => i.maliyet_usd).filter((m): m is number => m !== null);
  const toplamMaliyet = maliyetler.reduce((t, m) => t + m, 0);
  const sureler = isler.map((i) => i.sure_sn).filter((s): s is number => s !== null);
  const toplamSure = sureler.reduce((t, s) => t + s, 0);
  const u = a.uyum?.[ajan];
  const uyum = u && u.toplam > 0 ? { ...u, oran: u.gecen / u.toplam } : null;
  const aralik = wilson(gecen, n);
  const durum: SecenekDurumu =
    n < a.enAz ? 'veri_yetersiz' : aralik[0] < a.esik ? 'esik_alti' : uyum && uyum.oran < a.uyumEsigi ? 'uyum_dusuk' : 'aday';
  return {
    ajan, model, is_sayisi: n, gecen, basari: yuvarla(gecen / n, 3), aralik: [yuvarla(aralik[0], 3), yuvarla(aralik[1], 3)],
    basari_basina_maliyet: bilinmeyen > 0 || gecen === 0 ? null : yuvarla(toplamMaliyet / gecen),
    maliyet_araligi: maliyetler.length > 0 ? [Math.min(...maliyetler), Math.max(...maliyetler)] : null,
    maliyeti_bilinmeyen_is: bilinmeyen,
    basari_basina_sure_sn: gecen === 0 || sureler.length === 0 ? null : yuvarla(toplamSure / gecen, 1),
    uyum, durum,
  };
}

/** Is turu basina secenekleri ve oneriyi hesaplar. Girdi yalniz kapanmis islerdir. */
export function oneriHesapla(olcumler: IsOlcumu[], ayarlar: Partial<OneriAyarlari> = {}): TurOnerisi[] {
  const a: OneriAyarlari = { ...VARSAYILAN_ONERI_AYARLARI, ...ayarlar };
  const turler = [...new Set(olcumler.map((o) => o.tur))].sort();
  return turler.map((tur) => {
    const kendi = olcumler.filter((o) => o.tur === tur);
    const gruplar = new Map<string, IsOlcumu[]>();
    for (const o of kendi) {
      const anahtar = `${o.ajan}\u0000${o.model}`;
      gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), o]);
    }
    const secenekler = [...gruplar.values()].map((g) => secenekHesapla(g, a)).sort((x, y) => y.aralik[0] - x.aralik[0]);
    const adaylar = secenekler.filter((s) => s.durum === 'aday');
    const ad = (s: Secenek): string => `${s.ajan} / ${s.model}`;

    if (adaylar.length === 0) {
      const enCok = Math.max(...secenekler.map((s) => s.is_sayisi));
      const not = secenekler.every((s) => s.durum === 'veri_yetersiz')
        ? ileti('o_veri_yetersiz', { en_cok: enCok, en_az: a.enAz })
        : ileti('o_esik_yok', { esik: Math.round(a.esik * 100), uyum: secenekler.some((s) => s.durum === 'uyum_dusuk') ? ileti('o_esik_uyum') : '' });
      return { tur, is_sayisi: kendi.length, secenekler, oneri: null, not };
    }

    const bilinen = adaylar.filter((s) => s.basari_basina_maliyet !== null);
    const sureyeGore = (x: Secenek, y: Secenek): number => (x.basari_basina_sure_sn ?? Infinity) - (y.basari_basina_sure_sn ?? Infinity);
    let secilen: Secenek;
    let gerekce: string;
    if (bilinen.length > 0) {
      secilen = [...bilinen].sort((x, y) => x.basari_basina_maliyet! - y.basari_basina_maliyet! || sureyeGore(x, y))[0]!;
      gerekce = ileti('o_gerekce_maliyet', { usd: secilen.basari_basina_maliyet! });
    } else {
      secilen = [...adaylar].sort(sureyeGore)[0]!;
      gerekce = ileti('o_gerekce_sure');
    }
    gerekce += ileti('o_gerekce_ek', { gecen: secilen.gecen, toplam: secilen.is_sayisi, alt: Math.round(secilen.aralik[0] * 100), ust: Math.round(secilen.aralik[1] * 100) });
    const karsilastirilamayan = adaylar.filter((s) => s.basari_basina_maliyet === null && s !== secilen).map(ad);
    const not = karsilastirilamayan.length > 0 && bilinen.length > 0
      ? ileti('o_karsilastirilamadi', { liste: karsilastirilamayan.join(', ') })
      : '';
    return { tur, is_sayisi: kendi.length, secenekler, oneri: { ajan: secilen.ajan, model: secilen.model, gerekce }, not };
  });
}

const DURUM_ANAHTARI = { aday: 'o_durum_aday', veri_yetersiz: 'o_durum_veri_yetersiz', esik_alti: 'o_durum_esik_alti', uyum_dusuk: 'o_durum_uyum_dusuk' } as const;

/** Konsol icin duz metin (Turkce'ye ozgu harf yok). */
export function oneriMetni(turler: TurOnerisi[], ayarlar: Partial<OneriAyarlari> = {}): string {
  const a: OneriAyarlari = { ...VARSAYILAN_ONERI_AYARLARI, ...ayarlar };
  if (turler.length === 0) {
    return ileti('o_bos');
  }
  const satirlar = [
    ileti('o_esik', { esik: Math.round(a.esik * 100), en_az: a.enAz }),
    ileti('o_basari'),
  ];
  for (const t of turler) {
    satirlar.push('', ileti('o_tur', { tur: t.tur, sayi: t.is_sayisi }));
    satirlar.push(t.oneri ? ileti('o_oneri', { ajan: t.oneri.ajan, model: t.oneri.model, gerekce: t.oneri.gerekce }) : ileti('o_oneri_yok', { not: t.not }));
    if (t.oneri && t.not) satirlar.push(ileti('o_not', { not: t.not }));
    for (const s of t.secenekler) {
      const maliyet = s.basari_basina_maliyet !== null
        ? ileti('o_maliyet', { usd: s.basari_basina_maliyet }) + (s.maliyet_araligi ? ileti('o_maliyet_araligi', { alt: s.maliyet_araligi[0], ust: s.maliyet_araligi[1] }) : '')
        : s.maliyeti_bilinmeyen_is > 0 ? ileti('o_maliyet_bilinmiyor', { sayi: s.maliyeti_bilinmeyen_is }) : ileti('o_maliyet_yok');
      const sure = s.basari_basina_sure_sn !== null ? ileti('o_sure', { sn: s.basari_basina_sure_sn }) : ileti('o_sure_yok');
      const uyum = s.uyum ? ileti('o_uyum', { gecen: s.uyum.gecen, toplam: s.uyum.toplam }) : '';
      satirlar.push(ileti('o_secenek', { ajan: s.ajan, model: s.model, gecen: s.gecen, sayi: s.is_sayisi, alt: Math.round(s.aralik[0] * 100), ust: Math.round(s.aralik[1] * 100), maliyet, sure, uyum, durum: ileti(DURUM_ANAHTARI[s.durum]) }));
    }
  }
  satirlar.push('', ileti('o_kapanis'));
  return satirlar.join('\n');
}
