// Yapilandirilmis log: her islem adi ve girdisiyle bir "basla", sonucuyla bir "bitti" satiri yazar. Kok neden logdan okunur.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Ret } from './hata.js';

const EN_UZUN_DEGER = 300;

function kirp(deger: unknown): unknown {
  if (typeof deger === 'string') {
    return deger.length > EN_UZUN_DEGER ? `${deger.slice(0, EN_UZUN_DEGER)}... [${deger.length} karakter]` : deger;
  }
  if (Array.isArray(deger)) return deger.slice(0, 20).map(kirp);
  if (deger && typeof deger === 'object') {
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, kirp(v)]));
  }
  return deger;
}

export class Log {
  private sayac = 0;

  constructor(private readonly dosya: string) {
    mkdirSync(dirname(dosya), { recursive: true });
  }

  private yaz(kayit: Record<string, unknown>): void {
    try {
      appendFileSync(this.dosya, JSON.stringify({ zaman: new Date().toISOString(), ...kayit }) + '\n');
    } catch {
      // Log yazilamamasi isi durdurmaz.
    }
  }

  private basla(islem: string, girdi: unknown): { no: string; t0: number } {
    const no = `${process.pid}-${++this.sayac}`;
    this.yaz({ islem, asama: 'basla', no, girdi: kirp(girdi) });
    return { no, t0: Date.now() };
  }

  private bitti(islem: string, b: { no: string; t0: number }, hata?: unknown, ozet?: unknown): void {
    const ortak = { islem, asama: 'bitti', no: b.no, sure_ms: Date.now() - b.t0 };
    if (hata === undefined) this.yaz({ ...ortak, sonuc: 'tamam', ...(ozet === undefined ? {} : { cikti: kirp(ozet) }) });
    else if (hata instanceof Ret) this.yaz({ ...ortak, sonuc: 'ret', ret_kodu: hata.kod, mesaj: kirp(hata.message) });
    else this.yaz({ ...ortak, sonuc: 'hata', mesaj: kirp(hata instanceof Error ? hata.message : String(hata)) });
  }

  /** Baslangici ve bitisi olmayan tek satirlik olay (or. bir istemcinin baglanmasi). */
  olay(islem: string, girdi: unknown): void {
    this.yaz({ islem, asama: 'olay', no: `${process.pid}-${++this.sayac}`, girdi: kirp(girdi) });
  }

  /** Es zamanli islemi basla / bitti satirlariyla sarar. `ozetle` donusun loga girecek kisa halini verir. */
  sar<T>(islem: string, girdi: unknown, f: () => T, ozetle?: (sonuc: T) => unknown): T {
    const b = this.basla(islem, girdi);
    try {
      const sonuc = f();
      this.bitti(islem, b, undefined, ozetle?.(sonuc));
      return sonuc;
    } catch (e) {
      this.bitti(islem, b, e);
      throw e;
    }
  }

  async sarAsenk<T>(islem: string, girdi: unknown, f: () => Promise<T>, ozetle?: (sonuc: T) => unknown): Promise<T> {
    const b = this.basla(islem, girdi);
    try {
      const sonuc = await f();
      this.bitti(islem, b, undefined, ozetle?.(sonuc));
      return sonuc;
    } catch (e) {
      this.bitti(islem, b, e);
      throw e;
    }
  }
}
