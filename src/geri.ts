// Is basina geri alma (Asama 13). Git'ten bagimsiz: is acilinca ve kapaninca projenin fotografi alinir (yol -> icerik ozeti);
// icerikler .mihenk/nesneler/ altinda icerik adiyla bir kez saklanir. Geri alma iki fotograf arasindaki farki tersine cevirir.
// Is bittikten sonra baska bir is ya da kullanici bir dosyayi degistirdiyse ona dokunulmaz ("cakisma" diye bildirilir).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { projeDosyalari } from './bekci.js';
import { t } from './dil.js';

/** Bundan buyuk dosyalar fotografa girmez (geri alinamaz; atlananlar listesine yazilir). */
const EN_BUYUK = 5 * 1024 * 1024;

export interface Fotograf {
  zaman: string;
  /** goreli yol -> sha256 */
  dosyalar: Record<string, string>;
  /** Buyuklugu ya da okunamamasi yuzunden alinmayanlar. */
  atlanan: string[];
}

export interface GeriAlmaSonucu {
  is_id: number;
  /** Is sirasinda degisen dosya, ise girdigi halinden geri yuklendi. */
  geri_yuklenen: string[];
  /** Is sirasinda eklenen dosya silindi. */
  silinen: string[];
  /** Is sirasinda silinen dosya geri getirildi. */
  geri_getirilen: string[];
  /** Is bittikten sonra degismis (baska is ya da kullanici): dokunulmadi. */
  cakisan: string[];
  /** Fotografta olmayan (buyuk) dosyalar: geri alinamadi. */
  atlanan: string[];
  deneme: boolean;
}

const dizin = (kok: string): string => join(kok, '.mihenk', 'geri');
const nesneYolu = (kok: string, ozet: string): string => join(kok, '.mihenk', 'nesneler', ozet.slice(0, 2), ozet);
const fotografYolu = (kok: string, isId: number, an: 'bas' | 'son'): string => join(dizin(kok), `is-${isId}-${an}.json`);
const ozetle = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

function hedefDisi(yol: string): boolean {
  return /^(\.mihenk|\.git|node_modules)(\/|$)/.test(yol);
}

/** Projenin fotografini alir ve kaydeder. Var olan fotograf ezilmez (is basina bir kez). */
export function fotografCek(kok: string, isId: number, an: 'bas' | 'son'): Fotograf {
  const yol = fotografYolu(kok, isId, an);
  if (existsSync(yol)) return JSON.parse(readFileSync(yol, 'utf8')) as Fotograf;
  const f: Fotograf = { zaman: new Date().toISOString(), dosyalar: {}, atlanan: [] };
  for (const g of projeDosyalari(kok)) {
    if (hedefDisi(g)) continue;
    const tam = join(kok, g);
    // Git'in listesinde olup diskte olmayan (silinmis) dosya fotografta "yok"tur, atlanan degil.
    if (!existsSync(tam)) continue;
    try {
      const st = statSync(tam);
      if (!st.isFile()) continue;
      if (st.size > EN_BUYUK) {
        f.atlanan.push(g);
        continue;
      }
      const icerik = readFileSync(tam);
      const o = ozetle(icerik);
      const n = nesneYolu(kok, o);
      if (!existsSync(n)) {
        mkdirSync(dirname(n), { recursive: true });
        writeFileSync(n, icerik);
      }
      f.dosyalar[g] = o;
    } catch {
      f.atlanan.push(g);
    }
  }
  mkdirSync(dizin(kok), { recursive: true });
  writeFileSync(yol, JSON.stringify(f));
  return f;
}

/**
 * Eski fotograflari temizler: en son `sakla` kapanan isin fotografi kalir (0: hicbiri); acik islerinki hep kalir.
 * Sonra hicbir fotografin kullanmadigi icerikler silinir. Silinen is numaralarini doner.
 */
export function fotograflariBuda(kok: string, sakla: number): number[] {
  const d = dizin(kok);
  if (!existsSync(d)) return [];
  const adlar = readdirSync(d);
  const kapali = [...new Set(adlar.map((a) => /^is-(\d+)-son\.json$/.exec(a)?.[1]).filter((x): x is string => x !== undefined).map(Number))].sort((a, b) => b - a);
  const silinecek = kapali.slice(Math.max(0, sakla));
  for (const id of silinecek) {
    for (const an of ['bas', 'son'] as const) {
      try {
        unlinkSync(fotografYolu(kok, id, an));
      } catch {
        // zaten yok
      }
    }
  }
  // Kullanilmayan icerikler.
  const kullanilan = new Set<string>();
  for (const a of readdirSync(d).filter((x) => /^is-\d+-(bas|son)\.json$/.test(x))) {
    try {
      for (const o of Object.values((JSON.parse(readFileSync(join(d, a), 'utf8')) as Fotograf).dosyalar)) kullanilan.add(o);
    } catch {
      // bozuk fotograf: iceriklerini korumak icin temizlik durur
      return silinecek;
    }
  }
  const nesneler = join(kok, '.mihenk', 'nesneler');
  if (existsSync(nesneler)) {
    for (const alt of readdirSync(nesneler)) {
      const ad = join(nesneler, alt);
      for (const n of readdirSync(ad)) if (!kullanilan.has(n)) unlinkSync(join(ad, n));
      if (readdirSync(ad).length === 0) rmdirSync(ad);
    }
  }
  return silinecek;
}

function mevcutOzet(kok: string, g: string): string | null {
  const tam = join(kok, g);
  try {
    return statSync(tam).isFile() ? ozetle(readFileSync(tam)) : null;
  } catch {
    return null;
  }
}

/**
 * Isin degisikliklerini geri alir. Yalniz kapanmis (iki fotografi olan) is geri alinir. deneme: hicbir sey yazmadan ne yapilacagini doner.
 * Kural: bir dosya ancak simdiki hali isin biraktigi halle ayniysa geri alinir; degilse cakismadir.
 */
export function geriAl(kok: string, isId: number, o: { deneme?: boolean } = {}): GeriAlmaSonucu {
  if (!existsSync(fotografYolu(kok, isId, 'bas'))) {
    throw new Error(t('g_fotograf_yok', { id: isId }));
  }
  if (!existsSync(fotografYolu(kok, isId, 'son'))) {
    throw new Error(t('g_acik', { id: isId }));
  }
  const bas = JSON.parse(readFileSync(fotografYolu(kok, isId, 'bas'), 'utf8')) as Fotograf;
  const son = JSON.parse(readFileSync(fotografYolu(kok, isId, 'son'), 'utf8')) as Fotograf;
  const s: GeriAlmaSonucu = { is_id: isId, geri_yuklenen: [], silinen: [], geri_getirilen: [], cakisan: [], atlanan: [...new Set([...bas.atlanan, ...son.atlanan])], deneme: o.deneme === true };
  const yollar = [...new Set([...Object.keys(bas.dosyalar), ...Object.keys(son.dosyalar)])].sort();
  const silinecekDizinler = new Set<string>();
  for (const g of yollar) {
    const b = bas.dosyalar[g] ?? null;
    const e = son.dosyalar[g] ?? null;
    if (b === e) continue; // is bu dosyaya dokunmadi
    if (s.atlanan.includes(g)) continue;
    const simdi = mevcutOzet(kok, g);
    if (simdi === b) continue; // zaten isten onceki halinde
    if (simdi !== e) {
      s.cakisan.push(g);
      continue;
    }
    const tam = join(kok, g);
    if (b === null) {
      if (!s.deneme) unlinkSync(tam);
      s.silinen.push(g);
      silinecekDizinler.add(dirname(g));
    } else {
      if (!s.deneme) {
        mkdirSync(dirname(tam), { recursive: true });
        writeFileSync(tam, readFileSync(nesneYolu(kok, b)));
      }
      (e === null ? s.geri_getirilen : s.geri_yuklenen).push(g);
    }
  }
  // Isin olusturdugu ve artik bos kalan dizinler (baslangicta icinde dosya olmayanlar).
  if (!s.deneme) {
    const basDizinleri = new Set(Object.keys(bas.dosyalar).flatMap((g) => g.split('/').slice(0, -1).map((_, i, p) => p.slice(0, i + 1).join('/'))));
    for (const d of [...silinecekDizinler].sort((a, b) => b.length - a.length)) {
      for (let x = d; x && x !== '.' && !basDizinleri.has(x); x = dirname(x) === '.' ? '' : dirname(x).replace(/\\/g, '/')) {
        try {
          const tam = join(kok, x);
          if (existsSync(tam) && readdirSync(tam).length === 0) rmdirSync(tam);
          else break;
        } catch {
          break;
        }
      }
    }
    writeFileSync(join(dizin(kok), `is-${isId}-geri-alindi-${Date.now()}.json`), JSON.stringify(s));
  }
  return s;
}
