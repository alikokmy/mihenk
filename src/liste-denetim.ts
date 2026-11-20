// Baslamadan once liste denetimi (Asama 20; superpowers'in "builder check" fikri ve Asama 4 bulgusu: Codex projede tanimli olmayan
// "npm test"i yazmisti). Her is icin anlasilir uyari: bos alan, calistirilamayan komut, tanimsiz betik, olmayan dosya, bulunmayan arac.
// Engellemez: uyarilar liste baslarken ve pencerede gosterilir; surucu calistirilamayan isi zaten "kayit acilamadi" diye atlar.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AJANLAR, type AjanTanimi } from './ajanlar.js';
import { t } from './dil.js';
import { komutuCoz, PROGRAM_ADI, VARSAYILAN_IZINLI } from './dogrulama.js';
import { Ret } from './hata.js';

export interface ListeUyarisi {
  /** 1'den baslayan is sirasi. */
  is: number;
  uyari: string;
  /** Uyari izinsiz bir programdan geliyorsa o programin adi: pencere "izin ver" dugmesi gosterir (Asama 30). */
  program?: string;
}

interface DenetlenecekIs { soru?: string; beklenti?: string; yanlissa?: string; dogrulama_komutu?: string; ajan?: string; zorluk?: string }

function izinliProgramlar(kok: string): readonly string[] {
  try {
    const a = JSON.parse(readFileSync(join(kok, 'mihenk.json'), 'utf8')) as { izinli_programlar?: unknown };
    if (Array.isArray(a.izinli_programlar)) return a.izinli_programlar.map(String);
  } catch {
    // varsayilan
  }
  return VARSAYILAN_IZINLI;
}

/** npm / pnpm / yarn komutunun calistiracagi betik adi; betik degilse null. */
function betikAdi(arg: string[]): string | null {
  const [ilk, ikinci] = arg;
  if (!ilk) return null;
  if (ilk === 'run' || ilk === 'run-script') return ikinci ?? null;
  if (['test', 'start', 'stop', 'restart', 't', 'tst'].includes(ilk)) return ilk === 't' || ilk === 'tst' ? 'test' : ilk;
  return null;
}

export function listeDenetimi(kok: string, isler: DenetlenecekIs[], o: { ajan?: string; ajanlar?: Readonly<Record<string, AjanTanimi>> } = {}): ListeUyarisi[] {
  const sonuc: ListeUyarisi[] = [];
  const ajanlar = o.ajanlar ?? AJANLAR;
  const izinli = izinliProgramlar(kok);
  let paket: { scripts?: Record<string, string> } | null | undefined;
  const paketOku = (): typeof paket => {
    if (paket !== undefined) return paket;
    try {
      paket = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    } catch {
      paket = null;
    }
    return paket;
  };
  const bulunanAjan = new Map<string, boolean>();
  isler.forEach((is, i) => {
    const n = i + 1;
    const ekle = (uyari: string, program?: string): void => { sonuc.push({ is: n, uyari, ...(program ? { program } : {}) }); };
    // Komut zorunlu degil (Asama 32): bos komutlu iste ajan once kabul testini yazar.
    for (const alan of ['soru', 'beklenti', 'yanlissa'] as const) {
      if (!String(is[alan] ?? '').trim()) ekle(t('l_bos_alan', { alan }));
    }
    const komut = String(is.dogrulama_komutu ?? '').trim();
    if (komut) {
      try {
        const parca = komutuCoz(komut, izinli);
        const program = parca.program.toLowerCase().replace(/\.(cmd|exe)$/, '');
        const arg = parca.argumanlar;
        if (['npm', 'pnpm', 'yarn'].includes(program)) {
          const betik = betikAdi(arg) ?? (program === 'yarn' && arg[0] && !arg[0].startsWith('-') ? arg[0] : null);
          if (betik) {
            const p = paketOku();
            if (!p) ekle(t('l_paket_yok', { komut }));
            else if (!p.scripts?.[betik]) ekle(t('l_betik_yok', { komut, betik }));
          }
        } else if (['node', 'python', 'python3', 'py'].includes(program)) {
          const dosya = arg.find((a) => !a.startsWith('-'));
          if (dosya && /\.(m?js|cjs|ts|py)$/i.test(dosya) && !existsSync(join(kok, dosya))) ekle(t('l_dosya_yok', { komut, dosya }));
        }
      } catch (e) {
        const ilk = komut.split(/\s+/)[0] ?? '';
        const program = e instanceof Ret && e.kod === 'KOMUT_IZINSIZ' && PROGRAM_ADI.test(ilk) ? ilk.toLowerCase().replace(/\.(exe|cmd|bat)$/, '') : undefined;
        // Izinsiz program: duz dille (teknik ret metni kodlama bilmeyen kullaniciya gosterilmez); pencere "izin ver" dugmesi ekler.
        if (program) ekle(t('l_program_izinsiz', { program }), program);
        else ekle(t('l_komut_red', { neden: e instanceof Error ? e.message.split('\n')[0]! : String(e) }));
      }
    }
    if (is.zorluk !== undefined && !['kolay', 'orta', 'zor'].includes(is.zorluk)) ekle(t('l_zorluk', { deger: String(is.zorluk) }));
    const ajan = is.ajan ?? o.ajan;
    if (ajan && ajan !== 'oneri') {
      if (!bulunanAjan.has(ajan)) bulunanAjan.set(ajan, ajanlar[ajan]?.komutBul() != null);
      if (!bulunanAjan.get(ajan)) ekle(t('l_ajan_yok', { ajan }));
    }
  });
  return sonuc;
}

export function listeDenetimMetni(u: ListeUyarisi[]): string {
  return [t('l_baslik', { sayi: u.length }), ...u.map((x) => t('l_satir', { n: x.is, uyari: x.uyari }))].join('\n');
}
