// Oneri: defterdeki olculmus sonuclardan is turu basina ajan / model onerisi (Asama 6).
// Birim kapanmis istir. Basari yalniz dogrulanmis "gecti"dir; "kaldi" ve "belirsiz" basarisiz sayilir (ajanin beyani sayilmaz).
// Secenek, basari oraninin alt guven siniri esigi gecenler arasindan, basari basina beklenen maliyeti en dusuk olandir
// (basarisiz islerin ve yeniden denemelerin maliyeti dahil); esitlikte sure. Az veride oneri verilmez: "veri yetersiz".
// Abonelikli ajanin maliyeti dolar degil kota payidir (Asama 27): pencere degeri verilmisse dolara cevrilir; verilmemisse kota payli
// secenekler kendi aralarinda karsilastirilir, dolarlilarla karsilastirilmaz (birimler karisirsa maliyet yerine basari ve sure).
// Zorluk (Asama 28): turde en az bir iste zorluk yazilmissa her secenegin basarisi, maliyeti ve suresi turun ortak zorluk dagilimina gore
// agirliklandirilir (dogrudan standartlastirma); secenegin az ya da hic isi olmayan katmanda oran turun o katmandaki oranina cekilir.
// Boylece kolay isleri alan ajan, zor iste zayifsa one gecmez. Zorluk yazilmamis defterde hesap eskisiyle aynidir.
// Kullanici her zaman kendi secimini yapar; bu hesap yalniz gosterir.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ayarlariOku } from './ayar.js';
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
  /** Kurulu ajan araclari: verisi az olanlar "kesif onerisi" olarak yazilir (Asama 29). */
  kurulu?: readonly string[];
}

export const VARSAYILAN_ONERI_AYARLARI: OneriAyarlari = { esik: 0.5, enAz: 5, uyumEsigi: 0.8 };

/** Varsayilan uyum raporu yeri (mihenk uyum ciktisi). */
export const uyumRaporuYolu = (kok: string): string => join(kok, 'mihenk-uyum', 'uyum-raporu.json');

/** Arac adina gore uyum testi sonucu; rapor yoksa ya da okunamazsa undefined. */
export function uyumRaporuOku(yol: string): Record<string, UyumOlcumu> | undefined {
  if (!existsSync(yol)) return undefined;
  try {
    const ozet = (JSON.parse(readFileSync(yol, 'utf8')) as { ozet?: Array<{ arac: string; gecen: number; toplam: number }> }).ozet ?? [];
    return Object.fromEntries(ozet.map((u) => [u.arac, { gecen: u.gecen, toplam: u.toplam }]));
  } catch {
    return undefined;
  }
}

/**
 * Projenin oneri ayarlari: esik ve en az is "Ayarlar"dan (oneri_esik, oneri_en_az), uyum raporu varsayilan yerinden. Komut satiri,
 * pencere ve kesif ayni ayarlari kullanir (Asama 30: pencere onceden uyum raporunu okumuyordu).
 */
export function projeOneriAyarlari(kok: string, ek: Partial<OneriAyarlari> & { uyumYolu?: string } = {}): Partial<OneriAyarlari> {
  const a = ayarlariOku(kok);
  const { uyumYolu, ...gerisi } = ek;
  const uyum = uyumRaporuOku(uyumYolu ?? uyumRaporuYolu(kok));
  return {
    esik: typeof a.oneri_esik === 'number' ? a.oneri_esik / 100 : VARSAYILAN_ONERI_AYARLARI.esik,
    enAz: typeof a.oneri_en_az === 'number' ? a.oneri_en_az : VARSAYILAN_ONERI_AYARLARI.enAz,
    ...(uyum ? { uyum } : {}),
    ...gerisi,
  };
}

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
  /** Abonelikli ajan: maliyeti kota payidir (Asama 27). */
  abonelik: boolean;
  /** Basari basina kota birimi (agirlikli token); bir isin bile olcumu yoksa null. */
  basari_basina_kota_birimi: number | null;
  /** Basari basina bir kota penceresinin payi (0-1); kapasite bilinmiyorsa null. */
  basari_basina_kota_payi: number | null;
  kota_kaynagi: 'ayar' | 'tahmin' | null;
  /** Karsilastirmada kullanilan maliyet: dolar (aracin bildirdigi ya da kota payinin dolar karsiligi) ya da kota payi. */
  karsilastirma: { birim: 'usd' | 'kota'; deger: number } | null;
  /** Maliyetin duz metni (komut satiri ve pencere ayni metni gosterir). */
  maliyet_metni: string;
  /** Zorluga gore duzeltilmis basari orani (Asama 28); turde zorluk yazilmamissa null. Aralik ve esik bunu kullanir. */
  duzeltilmis_basari: number | null;
  /** Secenegin islerinin zorluk karisimi (or. { kolay: 7, zor: 1, belirtilmemis: 2 }); turde zorluk yoksa null. */
  zorluk_dagilimi: Record<string, number> | null;
}

/** Turun ortak zorluk dagilimi ve katman basina turun basari orani. */
interface ZorlukReferansi {
  agirlik: Map<string, number>;
  oran: Map<string, number>;
}
/** Bos ya da az isli katmani turun oranina ceken onsel agirligi (is sayisi cinsinden). */
const ONSEL = 2;
const katman = (i: IsOlcumu): string => i.zorluk ?? 'belirtilmemis';
const basarili = (i: IsOlcumu): boolean => i.durum === 'gecti' && !i.geri_alindi;

function zorlukReferansi(isler: IsOlcumu[]): ZorlukReferansi | null {
  if (!isler.some((i) => i.zorluk)) return null;
  const agirlik = new Map<string, number>(), oran = new Map<string, number>();
  for (const k of new Set(isler.map(katman))) {
    const g = isler.filter((i) => katman(i) === k);
    agirlik.set(k, g.length / isler.length);
    oran.set(k, g.filter(basarili).length / g.length);
  }
  return { agirlik, oran };
}

export interface TurOnerisi {
  tur: string;
  is_sayisi: number;
  secenekler: Secenek[];
  oneri: { ajan: string; model: string; gerekce: string } | null;
  /** Oneri yoksa neden; varsa ek notlar. */
  not: string;
  /** Kurulu ama bu turde verisi az (en az is sayisindan az) ajanlar, azdan coga (Asama 29). */
  kesif: Array<{ ajan: string; is_sayisi: number }>;
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

function secenekHesapla(isler: IsOlcumu[], a: OneriAyarlari, ref: ZorlukReferansi | null = null): Secenek {
  const { ajan, model } = isler[0]!;
  const n = isler.length;
  // Sonradan geri alinan "gecti" isi basari sayilmaz: kullanici sonucu begenmemistir (Asama 21; CodeBurn'deki "reverted" sinifi).
  const gecen = isler.filter(basarili).length;
  const bilinmeyen = isler.filter((i) => i.maliyet_usd === null).length;
  const maliyetler = isler.map((i) => i.maliyet_usd).filter((m): m is number => m !== null);
  const sureler = isler.map((i) => i.sure_sn).filter((s): s is number => s !== null);
  const toplamSure = sureler.reduce((t, s) => t + s, 0);
  const u = a.uyum?.[ajan];
  const uyum = u && u.toplam > 0 ? { ...u, oran: u.gecen / u.toplam } : null;
  // Zorluk duzeltmesi: katman basina (basari + ONSEL x turun orani) / (is + ONSEL), turun agirliklariyla toplanir.
  const katmanda = (k: string): IsOlcumu[] => isler.filter((i) => katman(i) === k);
  const duzeltilmis = ref === null ? null : [...ref.agirlik].reduce((t, [k, w]) => {
    const g = katmanda(k);
    return t + w * (g.filter(basarili).length + ONSEL * ref.oran.get(k)!) / (g.length + ONSEL);
  }, 0);
  const aralik = duzeltilmis === null ? wilson(gecen, n) : wilson(duzeltilmis * n, n);
  const durum: SecenekDurumu =
    n < a.enAz ? 'veri_yetersiz' : aralik[0] < a.esik ? 'esik_alti' : uyum && uyum.oran < a.uyumEsigi ? 'uyum_dusuk' : 'aday';
  const abonelik = isler.every((i) => i.abonelik === true);
  // Hepsi biliniyorsa basari basina toplam; biri bile bilinmiyorsa null (kismi toplam yaniltir).
  const basariBasina = (degerler: Array<number | null | undefined>): number | null => {
    if (gecen === 0 || degerler.some((d) => d === null || d === undefined)) return null;
    const v = degerler as number[];
    if (duzeltilmis === null) return v.reduce((t, d) => t + d, 0) / gecen;
    // Is basina beklenen deger turun zorluk dagilimiyla; secenegin o katmanda isi yoksa kendi ortalamasi.
    const ort = (d: number[]): number => d.reduce((t, x) => t + x, 0) / d.length;
    const genel = ort(v);
    const isBasina = [...ref!.agirlik].reduce((t, [k, w]) => {
      const d = v.filter((_, j) => katman(isler[j]!) === k);
      return t + w * (d.length > 0 ? ort(d) : genel);
    }, 0);
    return isBasina / duzeltilmis;
  };
  const dolarHam = abonelik || bilinmeyen > 0 ? null : basariBasina(isler.map((i) => i.maliyet_usd));
  const dolar = dolarHam === null ? null : yuvarla(dolarHam);
  const kotaBirimi = abonelik ? basariBasina(isler.map((i) => i.kota_birimi)) : null;
  const kotaPayi = abonelik ? basariBasina(isler.map((i) => i.kota_payi)) : null;
  const kotaUsd = abonelik ? basariBasina(isler.map((i) => i.kota_usd)) : null;
  const kaynaklar = new Set(isler.map((i) => i.kota_kaynagi ?? null));
  const kota_kaynagi = kotaPayi === null ? null : kaynaklar.has('tahmin') ? 'tahmin' : 'ayar';
  const karsilastirma = dolar !== null ? { birim: 'usd' as const, deger: dolar }
    : kotaUsd !== null ? { birim: 'usd' as const, deger: yuvarla(kotaUsd) }
    : kotaPayi !== null ? { birim: 'kota' as const, deger: yuvarla(kotaPayi) } : null;
  const maliyet_araligi: [number, number] | null = maliyetler.length > 0 && !abonelik ? [Math.min(...maliyetler), Math.max(...maliyetler)] : null;
  let maliyet_metni: string;
  if (dolar !== null) maliyet_metni = ileti('o_maliyet', { usd: dolar }) + (maliyet_araligi ? ileti('o_maliyet_araligi', { alt: maliyet_araligi[0], ust: maliyet_araligi[1] }) : '');
  else if (kotaPayi !== null) {
    maliyet_metni = ileti('o_kota', { yuzde: yuvarla(kotaPayi * 100, 1) })
      + (kotaUsd !== null ? ileti('o_kota_usd', { usd: yuvarla(kotaUsd) }) : '') + (kota_kaynagi === 'tahmin' ? ileti('o_kota_tahmin') : '');
  } else if (kotaBirimi !== null) maliyet_metni = ileti('o_kota_birim', { birim: Math.round(kotaBirimi) });
  else if (gecen === 0) maliyet_metni = ileti('o_maliyet_yok');
  else maliyet_metni = ileti('o_maliyet_bilinmiyor', { sayi: abonelik ? isler.filter((i) => i.kota_birimi === null || i.kota_birimi === undefined).length : bilinmeyen });
  return {
    ajan, model, is_sayisi: n, gecen, basari: yuvarla(gecen / n, 3), aralik: [yuvarla(aralik[0], 3), yuvarla(aralik[1], 3)],
    basari_basina_maliyet: dolar ?? (kotaUsd !== null ? yuvarla(kotaUsd) : null),
    maliyet_araligi,
    maliyeti_bilinmeyen_is: bilinmeyen,
    basari_basina_sure_sn: gecen === 0 || sureler.length === 0 ? null
      : yuvarla(duzeltilmis === null || sureler.length < n ? toplamSure / gecen : basariBasina(isler.map((i) => i.sure_sn))!, 1),
    uyum, durum, abonelik,
    duzeltilmis_basari: duzeltilmis === null ? null : yuvarla(duzeltilmis, 3),
    zorluk_dagilimi: ref === null ? null : Object.fromEntries([...ref.agirlik.keys()].map((k) => [k, katmanda(k).length]).filter(([, s]) => (s as number) > 0)),
    basari_basina_kota_birimi: kotaBirimi === null ? null : Math.round(kotaBirimi),
    basari_basina_kota_payi: kotaPayi === null ? null : yuvarla(kotaPayi), kota_kaynagi, karsilastirma, maliyet_metni,
  };
}

/** Is turu basina secenekleri ve oneriyi hesaplar. Girdi yalniz kapanmis islerdir. */
export function oneriHesapla(olcumler: IsOlcumu[], ayarlar: Partial<OneriAyarlari> = {}): TurOnerisi[] {
  const a: OneriAyarlari = { ...VARSAYILAN_ONERI_AYARLARI, ...ayarlar };
  // Kesif vitesindeki isler (Asama 34) hukum iddiasi tasimaz: dogrulanmis basari sayimina girmez. Sure ve maliyetleri raporda kalir.
  olcumler = olcumler.filter((o) => o.vites !== 'kesif');
  const turler = [...new Set(olcumler.map((o) => o.tur))].sort();
  const kesifListesi = (kendi: IsOlcumu[]): TurOnerisi['kesif'] => (a.kurulu ?? [])
    .map((ajan) => ({ ajan, is_sayisi: kendi.filter((o) => o.ajan === ajan).length }))
    .filter((x) => x.is_sayisi < a.enAz)
    .sort((x, y) => x.is_sayisi - y.is_sayisi || x.ajan.localeCompare(y.ajan));
  return turler.map((tur) => {
    const kendi = olcumler.filter((o) => o.tur === tur);
    const gruplar = new Map<string, IsOlcumu[]>();
    for (const o of kendi) {
      const anahtar = `${o.ajan}\u0000${o.model}`;
      gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), o]);
    }
    const ref = zorlukReferansi(kendi);
    const secenekler = [...gruplar.values()].map((g) => secenekHesapla(g, a, ref)).sort((x, y) => y.aralik[0] - x.aralik[0]);
    const adaylar = secenekler.filter((s) => s.durum === 'aday');
    const ad = (s: Secenek): string => `${s.ajan} / ${s.model}`;

    if (adaylar.length === 0) {
      const enCok = Math.max(...secenekler.map((s) => s.is_sayisi));
      const not = secenekler.every((s) => s.durum === 'veri_yetersiz')
        ? ileti('o_veri_yetersiz', { en_cok: enCok, en_az: a.enAz })
        : ileti('o_esik_yok', { esik: Math.round(a.esik * 100), uyum: secenekler.some((s) => s.durum === 'uyum_dusuk') ? ileti('o_esik_uyum') : '' });
      return { tur, is_sayisi: kendi.length, secenekler, oneri: null, not, kesif: kesifListesi(kendi) };
    }

    const bilinen = adaylar.filter((s) => s.karsilastirma !== null);
    const birimler = new Set(bilinen.map((s) => s.karsilastirma!.birim));
    const sureyeGore = (x: Secenek, y: Secenek): number => (x.basari_basina_sure_sn ?? Infinity) - (y.basari_basina_sure_sn ?? Infinity);
    const ucuz = (liste: Secenek[]): Secenek => [...liste].sort((x, y) => x.karsilastirma!.deger - y.karsilastirma!.deger || sureyeGore(x, y))[0]!;
    let secilen: Secenek;
    let gerekce: string;
    const notlar: string[] = [];
    if (birimler.size === 1) {
      secilen = ucuz(bilinen);
      gerekce = secilen.karsilastirma!.birim === 'usd'
        ? ileti('o_gerekce_maliyet', { usd: secilen.karsilastirma!.deger })
        : ileti('o_gerekce_kota', { yuzde: yuvarla(secilen.karsilastirma!.deger * 100, 1) });
    } else if (birimler.size === 2) {
      // Dolar ve kota payi ortak birime cevrilemiyor: maliyetle secilmez; basarinin alt siniri, sonra sure.
      secilen = [...bilinen].sort((x, y) => y.aralik[0] - x.aralik[0] || sureyeGore(x, y))[0]!;
      gerekce = ileti('o_gerekce_karisik');
      const kotali = bilinen.filter((s) => s.karsilastirma!.birim === 'kota');
      notlar.push(ileti('o_birim_karisik', {
        usd: ad(ucuz(bilinen.filter((s) => s.karsilastirma!.birim === 'usd'))), kota: ad(ucuz(kotali)),
        ajanlar: [...new Set(kotali.map((s) => s.ajan))].join(', '),
      }));
    } else {
      secilen = [...adaylar].sort(sureyeGore)[0]!;
      gerekce = ileti('o_gerekce_sure');
    }
    gerekce += ileti('o_gerekce_ek', { gecen: secilen.gecen, toplam: secilen.is_sayisi, alt: Math.round(secilen.aralik[0] * 100), ust: Math.round(secilen.aralik[1] * 100) });
    const karsilastirilamayan = adaylar.filter((s) => s.karsilastirma === null && s !== secilen).map(ad);
    if (karsilastirilamayan.length > 0 && bilinen.length > 0) notlar.push(ileti('o_karsilastirilamadi', { liste: karsilastirilamayan.join(', ') }));
    const not = notlar.join(' ');
    return { tur, is_sayisi: kendi.length, secenekler, oneri: { ajan: secilen.ajan, model: secilen.model, gerekce }, not, kesif: kesifListesi(kendi) };
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
    if (t.kesif.length > 0) satirlar.push(ileti('o_kesif', { liste: t.kesif.map((k) => `${k.ajan} (${k.is_sayisi})`).join(', ') }));
    for (const s of t.secenekler) {
      const maliyet = s.maliyet_metni;
      const sure = s.basari_basina_sure_sn !== null ? ileti('o_sure', { sn: s.basari_basina_sure_sn }) : ileti('o_sure_yok');
      const uyum = s.uyum ? ileti('o_uyum', { gecen: s.uyum.gecen, toplam: s.uyum.toplam }) : '';
      satirlar.push(ileti('o_secenek', { ajan: s.ajan, model: s.model, gecen: s.gecen, sayi: s.is_sayisi, alt: Math.round(s.aralik[0] * 100), ust: Math.round(s.aralik[1] * 100), maliyet, sure, uyum, durum: ileti(DURUM_ANAHTARI[s.durum]) }));
      if (s.zorluk_dagilimi) {
        satirlar.push(ileti('o_zorluk', {
          dagilim: Object.entries(s.zorluk_dagilimi).map(([k, v]) => `${k} ${v}`).join(', '),
          ham: Math.round(s.basari * 100), duz: Math.round((s.duzeltilmis_basari ?? s.basari) * 100),
        }));
      }
    }
  }
  satirlar.push('', ileti('o_kapanis'));
  return satirlar.join('\n');
}
