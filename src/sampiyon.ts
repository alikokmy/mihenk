// Sampiyon duzeni (Asama 35; metamorfik karari 3, 2026-11-21): kabul goreli. Is turu basina bugunku en iyi secenek (sampiyon) defterde
// tutulur. Yeni hesaplanan en iyi secenek sampiyonun yerine ancak (a) basari araligi sampiyonunkinden ayrisinca (adayin %95 alt siniri
// sampiyonun ust sinirini asinca) ya da (b) sampiyon artik aday degilse gecer. Aksi halde oneri sampiyonda kalir. Degisim gerekcesiyle yazilir;
// eski sampiyon satiri silinmez.
// Karsi gorus: aralik ayrismasi tutucu bir olcuttur; daha ucuz ama esit basarili aday sampiyonu deviremez. Maliyetle devirme "net katki"
// kararina (karar 4) bagli; kullanici birimi secene dek uygulanmaz.
import { t } from './dil.js';
import type { Secenek, TurOnerisi } from './oneri.js';

export interface SampiyonKaydi {
  tur: string;
  ajan: string;
  model: string;
  zaman: string;
  gerekce: string;
}

export interface SampiyonDegisimi {
  tur: string;
  ajan: string;
  model: string;
  gerekce: string;
}

const ayni = (s: { ajan: string; model: string }, x: { ajan: string; model: string }): boolean => s.ajan === x.ajan && s.model === x.model;

/** Oneriyi sampiyona gore duzeltir; yapilacak sampiyon degisimlerini dondurur (yazmak cagiranin isi). Girdi degismez. */
export function sampiyonUygula(turler: readonly TurOnerisi[], mevcut: ReadonlyMap<string, SampiyonKaydi>): { turler: TurOnerisi[]; degisimler: SampiyonDegisimi[] } {
  const degisimler: SampiyonDegisimi[] = [];
  const sonuc = turler.map((t0): TurOnerisi => {
    const tt: TurOnerisi = { ...t0 };
    const m = mevcut.get(tt.tur);
    const hesap = tt.oneri;
    const bul = (x: { ajan: string; model: string }): Secenek | undefined => tt.secenekler.find((s) => ayni(s, x));
    if (!hesap) {
      if (m) tt.sampiyon = { ajan: m.ajan, model: m.model, zaman: m.zaman };
      return tt;
    }
    if (!m) {
      const gerekce = t('sp_ilk');
      degisimler.push({ tur: tt.tur, ajan: hesap.ajan, model: hesap.model, gerekce });
      tt.sampiyon = { ajan: hesap.ajan, model: hesap.model, zaman: '' };
      return tt;
    }
    if (ayni(m, hesap)) {
      tt.sampiyon = { ajan: m.ajan, model: m.model, zaman: m.zaman };
      return tt;
    }
    const ms = bul(m);
    const hs = bul(hesap)!;
    if (!ms || ms.durum !== 'aday') {
      const gerekce = t('sp_aday_degil', { eski: `${m.ajan} / ${m.model}` });
      degisimler.push({ tur: tt.tur, ajan: hesap.ajan, model: hesap.model, gerekce });
      tt.sampiyon = { ajan: hesap.ajan, model: hesap.model, zaman: '' };
      return tt;
    }
    if (hs.aralik[0] > ms.aralik[1]) {
      const gerekce = t('sp_ayristi', { aday: `${hesap.ajan} / ${hesap.model}`, alt: Math.round(hs.aralik[0] * 100), eski: `${m.ajan} / ${m.model}`, ust: Math.round(ms.aralik[1] * 100) });
      degisimler.push({ tur: tt.tur, ajan: hesap.ajan, model: hesap.model, gerekce });
      tt.sampiyon = { ajan: hesap.ajan, model: hesap.model, zaman: '' };
      return tt;
    }
    // Aralik ayrismadi: oneri sampiyonda kalir; hesaplanan aday not olarak yazilir.
    tt.oneri = { ajan: m.ajan, model: m.model, gerekce: t('sp_korundu', { aday: `${hesap.ajan} / ${hesap.model}`, gerekce: hesap.gerekce }) };
    tt.sampiyon = { ajan: m.ajan, model: m.model, zaman: m.zaman };
    return tt;
  });
  return { turler: sonuc, degisimler };
}
