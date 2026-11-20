// Surucu (dis dongu): is listesini sirayla ajanlara verir ve liste bitene dek surdurur (Ilke 2).
//   - her is temiz bir bassiz oturumda baslar; isin durumu baglamda degil defterdedir;
//   - isin bittigine ajan degil surucu karar verir: dogrulama komutunu defter kosar;
//   - ajan takilirsa, cokerse ya da baglami sisirirse oturum kapatilir, yenisi devir notuyla acilir;
//   - sinirli denemeden sonra is "takildi" diye kapatilir ve siradakine gecilir: liste tek is yuzunden durmaz;
//   - ajan yalniz kendisine verilen proje klasorunde calisir; baska yerde degisiklik gorulurse is gecersiz sayilir.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AJANLAR, saglayiciHatasi, type AjanTanimi } from './ajanlar.js';
import { Defter, SURUCU_ISTEMCISI, type Durum, type IsGorunumu } from './defter.js';
import { agaciOldur, gectiMi, komutuCalistir, komutuCoz } from './dogrulama.js';
import { Ret } from './hata.js';
import { depoDurumu, sakla, SAKLAMA_KIPLERI, type SaklamaKipi } from './saklama.js';
import { ayarlariOku } from './ayar.js';
import { t } from './dil.js';
import { bildir } from './bildirim.js';
import { raporYaz } from './rapor.js';
import { kisalt } from './sinir.js';

export interface ListeIsi {
  /** Listedeki kalici kimlik; verilmezse soru ve dogrulama komutundan turetilir. */
  kimlik?: string;
  tur: string;
  soru: string;
  beklenti: string;
  yanlissa: string;
  dogrulama_komutu: string;
  ajan?: string;
  zaman_asimi_sn?: number;
}

export interface IsListesi {
  ajan?: string;
  saklama?: SaklamaKipi;
  uyanik_tut?: boolean;
  /** Projenin butun test takimi (gerileme tabani, Asama 11). Yoksa package.json'da test betigi varsa "npm test". */
  gerileme_komutu?: string;
  gerileme_zaman_asimi_sn?: number;
  /**
   * Tavanlar (Asama 12). Is tavani asilinca is "belirsiz (butce)" kapanir, liste surer; liste tavani asilinca liste durur (yeniden
   * baslatilinca kaldigi yerden surer). Her ajan oturumundan once denetlenir. Dolar tavani yalniz maliyeti bilinen oturumlari sayar.
   */
  butce_usd?: number;
  is_butce_usd?: number;
  sure_tavani_dk?: number;
  is_sure_tavani_dk?: number;
  /** Model saglayicisi hiz siniri / kota hatasi verince bekleme (dakika, varsayilan 15) ve en cok kac kez beklenecegi (varsayilan 4). */
  kota_bekleme_dk?: number;
  kota_bekleme_sayisi?: number;
  isler: ListeIsi[];
}

export interface SurucuSecenekleri {
  /** Butun testler pahaliysa oneri esigi (varsayilan: en az 2 dakika ve listenin %25'i). Testler kisaltir. */
  gerilemeOneriEsigi?: { enAzMs: number; oran: number };
  /** Liste sonunda Windows bildirimi (ayar "bildirim" de acik olmali). Komut satiri acar; testler kapali birakir. */
  bildirim?: boolean;
  /** Kota beklemesinin suresi (ms); testler kisaltir. Verilmezse listedeki kota_bekleme_dk. */
  kotaBeklemeMs?: number;
  kok: string;
  liste: IsListesi;
  ajanlar?: Readonly<Record<string, AjanTanimi>>;
  varsayilanAjan?: string;
  saklama?: SaklamaKipi;
  /** Bir is icin en fazla kac kez ajan calistirilir (dogrulama kaldikca). */
  denemeSiniri?: number;
  /** Bir is icin en fazla kac kez baglam esigi yuzunden oturum devredilir. */
  devirSiniri?: number;
  /** Tek bir ajan oturumunun en uzun suresi. */
  ajanZamanAsimiSn?: number;
  /** Oturumun baglami bu kadar token'i asarsa oturum kapatilir ve devredilir. Baslangic degeri oneridir. */
  baglamEsigi?: number;
  /** Ajanin dokunmamasi gereken git depolari; kosudan once ve sonra karsilastirilir. */
  korunanDizinler?: string[];
  /** Kullaniciya giden kisa iletiler. */
  yaz?: (satir: string) => void;
}

export interface IsSonucu {
  kimlik: string;
  is_id: number;
  durum: Durum;
  /** Onceki bir kosuda kapanmisti, bu kosuda dokunulmadi. */
  atlandi: boolean;
  deneme: number;
  devir: number;
  gecersiz: boolean;
  not: string;
}

export interface SurucuRaporu {
  /** Liste tavan yuzunden durduysa nedeni; kalan isler baslatilmadi. */
  durdu?: string;
  isler: IsSonucu[];
  ozet: { toplam: number; gecti: number; kaldi: number; belirsiz: number; acik: number };
}

const MIHENK_DEPOSU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Is listesi dosyasini okur; hata iletileri kodlama bilmeyen kullanici icin yazilmistir. */
export function listeOku(dosya: string): IsListesi {
  if (!existsSync(dosya)) throw new Error(t('liste_bulunamadi', { yol: dosya }));
  let ham: unknown;
  try {
    ham = JSON.parse(readFileSync(dosya, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(t('liste_json_degil', { yol: dosya, hata: e instanceof Error ? e.message : '' }));
  }
  const liste = (Array.isArray(ham) ? { isler: ham } : ham) as IsListesi;
  if (!liste || !Array.isArray(liste.isler)) throw new Error(t('liste_isler_yok', { yol: dosya }));
  if (liste.saklama !== undefined && !SAKLAMA_KIPLERI.includes(liste.saklama)) {
    throw new Error(t('liste_saklama', { gecerli: SAKLAMA_KIPLERI.join(', ') }));
  }
  return liste;
}

export function isKimligi(is: ListeIsi): string {
  if (is.kimlik !== undefined && String(is.kimlik).trim() !== '') return String(is.kimlik).trim();
  return createHash('sha1').update(`${is.soru}\n${is.dogrulama_komutu}`).digest('hex').slice(0, 12);
}

/** Ileti ve commit basligi icin: tek satir, en fazla n karakter. */
function tekSatir(metin: string, n: number): string {
  const duz = metin.replace(/\s+/g, ' ').trim();
  return duz.length <= n ? duz : `${duz.slice(0, n - 3)}...`;
}

function istemYaz(is: IsGorunumu, devirNotu: string | null): string {
  const satirlar = [
    `Bu bir mihenk is kaydidir (is_id=${is.id}). Yalniz bu isi yap.`,
    `Is turu: ${is.tur}`,
    `Yapilacak: ${is.soru}`,
    `Beklenti: ${is.beklenti}`,
    `Yanlissa ne gorulur: ${is.yanlissa}`,
    `Isin bittigini gosteren komut: ${is.dogrulama_komutu}`,
    'Kurallar: Bu komutu surucu kendisi kosacak; "bitti" demen yetmez, komut gecmeli. Hukmu surucu verir: hukum_ver cagirma (reddedilir); not icin kanit_ekle, karar icin karar_yaz kullanabilirsin.',
    'Yalniz bu proje klasorunde calis; disindaki hicbir dosyayi degistirme. Commit ya da push yapma, saklamayi surucu yapar.',
    'Karar gereken yerde onerdigin secenegi uygula ve devam et; soru sorma. Is bitince dur.',
  ];
  if (devirNotu) satirlar.push(`DEVIR NOTU (onceki oturumdan): ${devirNotu}`);
  return satirlar.join('\n');
}

export interface AjanKosusu {
  cikis_kodu: number | null;
  zaman_asimi: boolean;
  esik_asildi: boolean;
  baglam: number;
  son_metin: string;
  /** Oturumun kullanimi (aracin bildirdigi); maliyet_usd null: arac bildirmedi. */
  kullanim: { girdi: number; onbellek_okuma: number; onbellek_yazma: number; cikti: number; maliyet_usd: number | null; model: string | null };
  sure_ms: number;
  baslatma_hatasi?: string;
}

/** Ajani bassiz kipte calistirir; ciktisini satir satir izler (kullanim, son ileti), dosyaya yazar. */
export function ajaniKostur(
  tanim: AjanTanimi,
  istem: string,
  o: { cwd: string; zamanAsimiMs: number; baglamEsigi: number; ciktiDosyasi: string; surucuIsareti?: boolean },
): Promise<AjanKosusu> {
  const t0 = Date.now();
  const sonuc: AjanKosusu = {
    cikis_kodu: null, zaman_asimi: false, esik_asildi: false, baglam: 0, son_metin: '', sure_ms: 0,
    kullanim: { girdi: 0, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 0, maliyet_usd: null, model: null },
  };
  const komut = tanim.komutBul();
  if (!komut) return Promise.resolve({ ...sonuc, baslatma_hatasi: `"${tanim.ad}" araci bu bilgisayarda bulunamadi` });

  // cwd tek basina yetmez: bazi araclar calisma klasorunu miras kalan PWD degiskeninden alir (OpenCode'da yasandi).
  // MIHENK_SURUCU: isi surucu kapatir ve dogrular; aracin kapi kancasi bu oturumda karismaz (kapi-bin.ts).
  const ortam: Record<string, string | undefined> = { ...process.env, PWD: o.cwd, MIHENK_SURUCU: '1' };
  if (o.surucuIsareti === false) delete ortam.MIHENK_SURUCU;
  Object.assign(ortam, tanim.ortam?.(o.cwd) ?? {});
  delete ortam.OLDPWD;
  delete ortam.INIT_CWD;
  delete ortam.NODE_TEST_CONTEXT; // ajanin kostugu "node --test" cagiranin test kosucusuna baglanmasin

  return new Promise<AjanKosusu>((coz) => {
    const fd = openSync(o.ciktiDosyasi, 'w');
    let bitti = false;
    let tampon = '';
    let bayt = 0;
    let olculenBaglam: number | undefined;
    let zamanlayici: NodeJS.Timeout | undefined;
    let pay: NodeJS.Timeout | undefined;

    const bitir = (kod: number | null, hata?: string): void => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayici);
      clearTimeout(pay);
      closeSync(fd);
      coz({ ...sonuc, cikis_kodu: kod, baglam: olculenBaglam ?? Math.round(bayt / 4), sure_ms: Date.now() - t0, ...(hata ? { baslatma_hatasi: hata } : {}) });
    };

    let cocuk: ChildProcess;
    try {
      cocuk = spawn(komut.program, [...komut.onEk, ...tanim.argumanlar(istem)], {
        cwd: o.cwd, env: ortam, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
      });
    } catch (e) {
      bitir(null, e instanceof Error ? e.message : String(e));
      return;
    }

    const satirIsle = (satir: string): void => {
      if (satir.trim() === '') return;
      let cozulmus: unknown = satir;
      try {
        cozulmus = JSON.parse(satir);
      } catch {
        // JSON olmayan satir ham metin olarak kalir.
      }
      const katki = tanim.kullanimKatkisi?.(cozulmus);
      if (katki) {
        const k = sonuc.kullanim;
        const alanlar = ['girdi', 'onbellek_okuma', 'onbellek_yazma', 'cikti'] as const;
        if (katki.tur === 'toplam') {
          for (const a of alanlar) k[a] = katki[a] ?? 0;
          if (katki.maliyet_usd !== undefined) k.maliyet_usd = katki.maliyet_usd;
        } else {
          for (const a of alanlar) k[a] += katki[a] ?? 0;
          if (katki.maliyet_usd !== undefined) k.maliyet_usd = (k.maliyet_usd ?? 0) + katki.maliyet_usd;
        }
        if (katki.model) k.model = katki.model;
      }
      const kullanim = tanim.kullanimOku(cozulmus);
      if (kullanim?.baglam !== undefined) olculenBaglam = kullanim.baglam;
      const metin = tanim.metinOku(cozulmus);
      if (metin) sonuc.son_metin = metin;
      // Arac baglami bildirmiyorsa cikti hacminden tahmin edilir (yaklasik 4 bayt = 1 token).
      if (!sonuc.esik_asildi && (olculenBaglam ?? Math.round(bayt / 4)) > o.baglamEsigi) {
        sonuc.esik_asildi = true;
        agaciOldur(cocuk);
      }
    };

    cocuk.stdout?.on('data', (parca: Buffer) => {
      if (bitti) return;
      bayt += parca.length;
      writeSync(fd, parca);
      tampon += parca.toString('utf8');
      const satirlar = tampon.split('\n');
      tampon = satirlar.pop() ?? '';
      for (const s of satirlar) satirIsle(s);
    });
    cocuk.stderr?.on('data', (parca: Buffer) => {
      if (!bitti) writeSync(fd, parca);
    });
    cocuk.on('error', (e) => bitir(null, e.message));
    cocuk.on('exit', (kod) => {
      // Arkada boruyu acik tutan surec kalirsa 'close' gelmez: kisa paydan sonra sonuc verilir.
      pay = setTimeout(() => {
        cocuk.stdout?.destroy();
        cocuk.stderr?.destroy();
        bitir(kod);
      }, 1000);
    });
    cocuk.on('close', (kod) => {
      if (tampon !== '') satirIsle(tampon);
      bitir(kod);
    });
    zamanlayici = setTimeout(() => {
      sonuc.zaman_asimi = true;
      agaciOldur(cocuk);
    }, o.zamanAsimiMs);
  });
}

/** Saklama kipi: komut satiri, sonra is listesi, sonra projenin ayari (mihenk.json "saklama"; varsayilan "yerel"). */
export function saklamaKipiSec(o: { bayrak?: SaklamaKipi | undefined; liste: IsListesi; kok: string }): SaklamaKipi {
  return o.bayrak ?? o.liste.saklama ?? (ayarlariOku(o.kok).saklama as SaklamaKipi);
}

/** Uyanik tutma: komut satiri ya da is listesi acikca istediyse; liste bir sey demiyorsa projenin ayari ("uyanik_tut"). */
export function uyanikIstendiMi(o: { bayrak: boolean; liste: IsListesi; kok: string }): boolean {
  return o.bayrak || o.liste.uyanik_tut === true || (o.liste.uyanik_tut === undefined && ayarlariOku(o.kok).uyanik_tut === true);
}

/**
 * Gerileme tabani (Asama 11): listenin basinda projenin butun test takimi bir kez kosulur. Gecerse, her isin "gecti" hukmunden once
 * yeniden kosulur; kalirsa o deneme basarisizdir. Taban zaten kaliyorsa denetim bu listede yapilamaz (cikis koduyla calisir; hangi
 * testin onceden kaldigini ayirt etmez) ve bu soylenir. Komut yoksa, bekci kapaliysa ya da izinsizse null.
 */
async function gerilemeTabani(kok: string, liste: IsListesi, defter: Defter, yaz: (s: string) => void):
  Promise<{ komut: string; kip: 'her_iste' | 'liste_sonunda' | 'gonderirken'; kos(ad: string): Promise<{ gecti: boolean; ozet: string; dosya: string; sureMs: number }>; harcananMs(): number } | null> {
  const kipi = ayarlariOku(kok).gerileme;
  if (kipi === 'kapali') return null;
  if (kipi === 'gonderirken' && saklamaKipiSec({ liste, kok }) !== 'yerel_gonder') return null;
  let komut = liste.gerileme_komutu?.trim();
  if (!komut) {
    try {
      const paket = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
      if (paket.scripts?.test && !/no test specified/.test(paket.scripts.test)) komut = 'npm test';
    } catch {
      // package.json yok ya da okunamadi
    }
  }
  if (!komut) {
    yaz(t('gerileme_yok_komut'));
    return null;
  }
  let parcalar: ReturnType<typeof komutuCoz>;
  try {
    parcalar = komutuCoz(komut, defter.ayarlar.izinli_programlar);
  } catch (e) {
    yaz(t('gerileme_yok_izin', { komut, hata: e instanceof Error ? e.message : String(e) }));
    return null;
  }
  const zamanAsimiMs = (liste.gerileme_zaman_asimi_sn ?? 600) * 1000;
  const kos = async (ad: string): Promise<{ gecti: boolean; ozet: string; dosya: string; sureMs: number }> => {
    const dosya = join(defter.dizin, 'ciktilar', `gerileme-${ad}.txt`);
    const k = await komutuCalistir(parcalar, { cwd: kok, zamanAsimiMs, ciktiDosyasi: dosya });
    let ham = '';
    try {
      ham = readFileSync(dosya, 'utf8');
    } catch {
      ham = k.baslatma_hatasi ?? '';
    }
    return { gecti: gectiMi(k), ozet: kisalt(ham.trim(), 800).metin, dosya: goreli(kok, dosya), sureMs: k.sure_ms };
  };
  const taban = await kos('taban');
  if (!taban.gecti) {
    yaz(t('gerileme_yok_taban', { komut, dosya: taban.dosya }));
    return null;
  }
  const ne = t(kipi === 'her_iste' ? 'gerileme_ne_her_iste' : kipi === 'liste_sonunda' ? 'gerileme_ne_liste_sonunda' : 'gerileme_ne_gonderirken');
  yaz(t('gerileme_taban', { komut, ne }));
  // Butun testlere harcanan sure (taban dahil): pahaliysa liste sonunda kullaniciya oneri yapilir.
  let harcananMs = taban.sureMs;
  const olcerek = async (ad: string) => { const r = await kos(ad); harcananMs += r.sureMs; return r; };
  return { komut, kos: olcerek, kip: kipi as 'her_iste' | 'liste_sonunda' | 'gonderirken', harcananMs: () => harcananMs };
}

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function okuSessiz(dosya: string): string {
  try {
    return readFileSync(dosya, 'utf8');
  } catch {
    return '';
  }
}

/** Dogrulama ciktisinin hata imzasi: sure, sayi ve yol farklarini atar; ayni hata ayni imzayi verir. */
export function hataImzasi(cikti: string): string {
  return cikti
    .replace(/\d+(\.\d+)?\s*(ms|s|sn)\b/g, '')
    .replace(/[A-Za-z]:\\[^\s'"]*|\/[^\s'"]*\//g, '')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-600);
}

const goreli = (kok: string, yol: string): string => yol.slice(kok.length + 1).replace(/\\/g, '/');

function gitignoreSagla(kok: string): void {
  // Defter klasoru projeyle birlikte commit edilmez.
  const yol = join(kok, '.gitignore');
  const eski = existsSync(yol) ? readFileSync(yol, 'utf8') : '';
  if (!/^\.mihenk\/?\s*$/m.test(eski)) writeFileSync(yol, `${eski}${eski === '' || eski.endsWith('\n') ? '' : '\n'}.mihenk/\n`);
}

export async function listeyiYurut(s: SurucuSecenekleri): Promise<SurucuRaporu> {
  const kok = resolve(s.kok);
  const ajanlar = s.ajanlar ?? AJANLAR;
  const kip = saklamaKipiSec({ bayrak: s.saklama, liste: s.liste, kok });
  const denemeSiniri = s.denemeSiniri ?? 3;
  const devirSiniri = s.devirSiniri ?? 3;
  const ajanZamanAsimiMs = (s.ajanZamanAsimiSn ?? 900) * 1000;
  const baglamEsigi = s.baglamEsigi ?? 120_000;
  const yaz = s.yaz ?? ((satir: string) => console.log(satir));
  // Varsayilan koruma: mihenk'in kendi deposu (proje o deponun kendisi degilse).
  const korunan = (s.korunanDizinler ?? (MIHENK_DEPOSU === kok ? [] : [MIHENK_DEPOSU])).map((d) => resolve(d));

  const defter = new Defter(kok);
  const surucuLogu = join(defter.dizin, 'surucu.jsonl');
  const olay = (ad: string, veri: Record<string, unknown>): void => {
    try {
      appendFileSync(surucuLogu, JSON.stringify({ zaman: new Date().toISOString(), olay: ad, ...veri }) + '\n');
    } catch {
      // Log yazilamamasi isi durdurmaz.
    }
  };
  const surucuNotu = (isId: number, metin: string): void => {
    try {
      defter.kanitEkle({ is_id: isId, icerik: kisalt(`[surucu] ${metin}`, 3900).metin });
    } catch {
      // Is bu arada kapanmis olabilir; not yazilamamasi akisi bozmaz.
    }
  };
  if (kip !== 'yok') gitignoreSagla(kok);

  const sonuclar: IsSonucu[] = [];
  let durdu = '';
  let gerilemeSonu = '';
  let gerilemeKaldi = false;
  let gerilemeOnerisi = '';
  try {
    olay('liste_basla', { is_sayisi: s.liste.isler.length, saklama: kip, baglam_esigi: baglamEsigi });
    const gerileme = await gerilemeTabani(kok, s.liste, defter, yaz);
    olay('gerileme_tabani', { komut: gerileme?.komut ?? null, etkin: gerileme !== null });
    const bekciler = ayarlariOku(kok);
    const listeBasi = Date.now();
    const listeIsleri: number[] = [];
    const maliyet = (idler: number[]): number => idler.reduce((t, id) => t + (defter.rapor({ is_id: id }).is?.kullanim_toplami.maliyet_usd ?? 0), 0);
    if (s.liste.butce_usd !== undefined || s.liste.is_butce_usd !== undefined) {
      yaz(t('dolar_tavani_notu'));
    }
    const listeTavaniNe = (): string =>
      s.liste.sure_tavani_dk !== undefined && Date.now() - listeBasi >= s.liste.sure_tavani_dk * 60_000
        ? `liste sure tavani (${s.liste.sure_tavani_dk} dk) doldu`
        : s.liste.butce_usd !== undefined && maliyet(listeIsleri) >= s.liste.butce_usd
          ? `liste dolar tavani (${s.liste.butce_usd} USD) doldu (harcanan ${round6(maliyet(listeIsleri))} USD)` : '';
    for (const [sira, listeIsi] of s.liste.isler.entries()) {
      if (!durdu) durdu = listeTavaniNe(); // tavan dolduysa yeni is acilmaz
      if (durdu) break;
      const kimlik = isKimligi(listeIsi);
      const baslik = `[${sira + 1}/${s.liste.isler.length}]`;
      const ajanAdi = listeIsi.ajan ?? s.liste.ajan ?? s.varsayilanAjan ?? '';
      const tanim = ajanlar[ajanAdi];

      let is = defter.etiketleBul(kimlik);
      if (is && is.durum !== 'acik') {
        yaz(t('is_kapali', { baslik, durum: is.durum, soru: tekSatir(listeIsi.soru, 70) }));
        sonuclar.push({ kimlik, is_id: is.id, durum: is.durum, atlandi: true, deneme: 0, devir: 0, gecersiz: false, not: 'onceki kosuda kapanmis' });
        continue;
      }
      if (!is) {
        try {
          is = defter.isAc({
            tur: listeIsi.tur, soru: listeIsi.soru, beklenti: listeIsi.beklenti, yanlissa: listeIsi.yanlissa,
            dogrulama_komutu: listeIsi.dogrulama_komutu, ajan: ajanAdi === '' ? 'belirtilmedi' : ajanAdi, model: 'aracin varsayilani',
            istemci: SURUCU_ISTEMCISI, etiket: kimlik,
            ...(listeIsi.zaman_asimi_sn === undefined ? {} : { zaman_asimi_sn: listeIsi.zaman_asimi_sn }),
          });
        } catch (e) {
          // Kaydi acilamayan is (eksik alan, izinsiz komut) listeyi durdurmaz.
          const neden = e instanceof Error ? e.message : String(e);
          yaz(t('kayit_acilamadi', { baslik, neden }));
          olay('kayit_acilamadi', { kimlik, neden });
          sonuclar.push({ kimlik, is_id: 0, durum: 'kaldi', atlandi: false, deneme: 0, devir: 0, gecersiz: true, not: `kayit acilamadi: ${neden}` });
          continue;
        }
      }
      const isId = is.id;
      yaz(t('is_basliyor', { baslik, id: isId, ajan: ajanAdi || t('yok'), soru: tekSatir(listeIsi.soru, 70) }));
      // Bos kanit bekcisi: ajan baslamadan dogrulama bir kez kosulur (yeniden baslatilan listede ikinci kez kosulmaz).
      const baslangic = await defter.baslangicDogrula(isId);
      if (baslangic.kosuldu && baslangic.gecti) {
        yaz(t('bos_kanit_uyarisi', { baslik }));
      }

      let deneme = 0;
      let devir = 0;
      let devirNotu: string | null = null;
      let gecersiz = false;
      let not = '';
      let gerilemeNotu = '';
      let butceNotu = '';
      let kotaBekleme = 0;
      let oncekiHata: string | null = null;
      const isBasi = Date.now();
      listeIsleri.push(isId);

      while (deneme < denemeSiniri) {
        // Tavanlar: her oturumdan once.
        const listeTavani = listeTavaniNe();
        const isTavani = s.liste.is_sure_tavani_dk !== undefined && Date.now() - isBasi >= s.liste.is_sure_tavani_dk * 60_000
          ? `is sure tavani (${s.liste.is_sure_tavani_dk} dk) doldu`
          : s.liste.is_butce_usd !== undefined && maliyet([isId]) >= s.liste.is_butce_usd
            ? `is dolar tavani (${s.liste.is_butce_usd} USD) doldu (harcanan ${round6(maliyet([isId]))} USD)` : '';
        if (listeTavani || isTavani) {
          butceNotu = `butce: ${listeTavani || isTavani}`;
          if (listeTavani) durdu = listeTavani;
          surucuNotu(isId, butceNotu);
          yaz(t('satir_not', { baslik, not: butceNotu }));
          olay('tavan', { is_id: isId, neden: butceNotu, liste: Boolean(listeTavani) });
          break;
        }
        if (!tanim) {
          not = `ajan tanimli degil: "${ajanAdi}". Gecerli: ${Object.keys(ajanlar).join(', ')}`;
          surucuNotu(isId, not);
          break;
        }
        const once = korunan.map((d) => depoDurumu(d));
        const ciktiDosyasi = join(defter.dizin, 'ciktilar', `ajan-is-${isId}-oturum-${deneme + devir + 1}.txt`);
        olay('oturum_basla', { is_id: isId, ajan: tanim.ad, deneme: deneme + 1, devir });
        const kosu = await ajaniKostur(tanim, istemYaz(defter.rapor({ is_id: isId }).is as IsGorunumu, devirNotu), {
          cwd: kok, zamanAsimiMs: ajanZamanAsimiMs, baglamEsigi, ciktiDosyasi,
        });
        olay('oturum_bitti', { is_id: isId, ajan: tanim.ad, cikis_kodu: kosu.cikis_kodu, zaman_asimi: kosu.zaman_asimi, esik_asildi: kosu.esik_asildi, baglam: kosu.baglam, sure_ms: kosu.sure_ms, hata: kosu.baslatma_hatasi ?? null });

        // Ajan proje disinda bir sey degistirdi mi?
        if (!kosu.baslatma_hatasi) {
          // Oturumun kullanimi ise baglanir (Asama 5): her oturum, devir ve basarisiz deneme dahil.
          defter.kullanimEkle({ is_id: isId, ajan: tanim.ad, ...kosu.kullanim, oturum: deneme + devir + 1, sure_ms: kosu.sure_ms });
        }
        const degisen = korunan.filter((d, i) => once[i] !== null && depoDurumu(d) !== once[i]);
        if (degisen.length > 0) {
          gecersiz = true;
          not = `GECERSIZ: ajan proje disinda degisiklik yapti (${degisen.join(', ')}). O klasore "git status" ile bakin; surucu oraya dokunmadi.`;
          surucuNotu(isId, not);
          olay('proje_disi_degisiklik', { is_id: isId, dizinler: degisen });
          break;
        }
        if (kosu.baslatma_hatasi) {
          not = `ajan baslatilamadi: ${kosu.baslatma_hatasi}`;
          surucuNotu(isId, not);
          break;
        }
        // Kota / hiz siniri: model saglayicisi reddetti; ajanin denemesi sayilmaz, bekleyip yeniden denenir.
        const saglayici = saglayiciHatasi(okuSessiz(ciktiDosyasi));
        if (saglayici && (defter.rapor({ is_id: isId }).is as IsGorunumu).durum === 'acik') {
          const sinir = s.liste.kota_bekleme_sayisi ?? 4;
          if (kotaBekleme < sinir) {
            kotaBekleme += 1;
            const beklemeMs = s.kotaBeklemeMs ?? (s.liste.kota_bekleme_dk ?? 15) * 60_000;
            const m = `model saglayicisi hatasi (${tekSatir(saglayici, 120)}); ${Math.round(beklemeMs / 1000)} sn beklenip yeniden denenecek (${kotaBekleme}/${sinir})`;
            surucuNotu(isId, m);
            yaz(t('satir_not', { baslik, not: m }));
            olay('kota_bekleme', { is_id: isId, bekleme_ms: beklemeMs, sayi: kotaBekleme, hata: saglayici });
            await new Promise((r) => setTimeout(r, beklemeMs));
            continue;
          }
          not = `model saglayicisi ${sinir} beklemeden sonra da reddetti: ${tekSatir(saglayici, 160)}`;
          surucuNotu(isId, not);
          butceNotu = `kota: ${not}`;
          break;
        }
        if (kosu.esik_asildi && devir < devirSiniri) {
          // Baglam butcesi asildi: oturum kapatildi; yenisi devir notuyla acilir. Bu bir basarisiz deneme sayilmaz.
          devir += 1;
          devirNotu = kisalt(
            `Onceki oturum baglami sisirdigi icin kapatildi (yaklasik ${kosu.baglam} token). Simdiye kadar yapilan degisiklikler diskte duruyor; ` +
              `once neyin yapildigina bak, kaldigin yerden surdur, gereksiz cikti uretme. Onceki oturumun son iletisi: ${kosu.son_metin || '(yok)'}`,
            1500,
          ).metin;
          surucuNotu(isId, `baglam esigi (${baglamEsigi}) asildi (${kosu.baglam} token): oturum devredildi (${devir}. devir)`);
          yaz(t('devir', { baslik, devir }));
          continue;
        }

        deneme += 1;
        if ((defter.rapor({ is_id: isId }).is as IsGorunumu).durum !== 'acik') break; // ajan defteri kullanip isi kendisi kapatti
        // Gerileme bekcisi: listenin basinda gecen butun test takimi simdi kaliyorsa is bu denemede gecemez.
        if (gerileme?.kip === 'her_iste') {
          const g = await gerileme.kos(`is-${isId}-deneme-${deneme}`);
          if (!g.gecti) {
            gerilemeNotu = `gerileme: listenin basinda gecen butun test takimi (${gerileme.komut}) simdi kaliyor; is kendi dogrulamasini gecse de "gecti" sayilmaz`;
            surucuNotu(isId, `${deneme}. deneme: ${gerilemeNotu}. Cikti: ${g.dosya}`);
            yaz(t('deneme_notu', { baslik, deneme, not: gerilemeNotu }));
            devirNotu = kisalt(`Bu is daha once denendi (${deneme}. deneme). Senin degisikligin, onceden gecen testleri bozdu: ${gerileme.komut} kaliyor. ` +
              `Bozdugun yeri duzelt; testleri degistirme. Ciktinin sonu: ${g.ozet}`, 1500).metin;
            continue;
          }
          gerilemeNotu = '';
        }
        const hukum = await defter.hukumVer({ is_id: isId, surucu: true });
        if (hukum.kapandi) break;
        const neden = kosu.zaman_asimi
          ? `ajan oturumu ${s.ajanZamanAsimiSn ?? 900} saniyede bitmedi, kapatildi`
          : kosu.esik_asildi
            ? 'baglam esigi yine asildi, devir siniri doldu'
            : `ajan durdu (cikis kodu ${kosu.cikis_kodu}) ama dogrulama gecmedi`;
        surucuNotu(isId, `${deneme}. deneme: ${neden}`);
        yaz(t('deneme_notu', { baslik, deneme, not: neden }));
        // Dongu kesici: dogrulama iki denemede ayni hatayi verdiyse ajan ilerlemiyor; kalan denemeler harcanmaz.
        const hata = hataImzasi(hukum.dogrulama.cikti_ozeti);
        if (bekciler.bekci_dongu !== false && oncekiHata !== null && hata === oncekiHata && deneme < denemeSiniri) {
          not = `dongu: dogrulama ${deneme - 1}. ve ${deneme}. denemede ayni hatayi verdi; kalan denemeler harcanmadi`;
          surucuNotu(isId, not);
          yaz(t('satir_not', { baslik, not }));
          olay('dongu_kesildi', { is_id: isId, deneme });
          break;
        }
        oncekiHata = hata;
        devirNotu = kisalt(
          `Bu is daha once denendi ve dogrulama gecmedi (${deneme}. deneme; ${neden}). Diskteki degisiklikler duruyor. ` +
            `Dogrulama ciktisinin sonu: ${hukum.dogrulama.cikti_ozeti || '(bos)'}`,
          1500,
        ).metin;
      }

      // Kapanis: ya gecti, ya ajan kapatti, ya da takildi.
      let son = defter.rapor({ is_id: isId }).is as IsGorunumu;
      if (son.durum === 'acik') {
        // Gerilemeyle biten is "belirsiz" kapanir: kendi dogrulamasi gecebilir, "kaldi" ile celisir ve "gecti"ye dusmemeli.
        const belirsiz = gecersiz || gerilemeNotu !== '' || butceNotu !== '';
        const gerekce = gecersiz ? not : butceNotu !== '' ? butceNotu : gerilemeNotu !== '' ? `takildi: ${gerilemeNotu}` : `takildi: ${not || `${deneme} denemede dogrulama gecmedi`}`;
        try {
          await defter.hukumVer({ surucu: true, is_id: isId, hukum: belirsiz ? 'belirsiz' : 'kaldi', gerekce: kisalt(gerekce, 900).metin });
        } catch (e) {
          // Son anda dogrulama gecerse "kaldi" verilemez: is gercekten gecmistir.
          if (!(e instanceof Ret) || e.kod !== 'HUKUM_CELISKILI') throw e;
          await defter.hukumVer({ is_id: isId, surucu: true });
        }
        son = defter.rapor({ is_id: isId }).is as IsGorunumu;
      }
      if (son.durum === 'gecti' && !gecersiz) {
        // Gerileme "gonderirken": gondermeden once tam takim; kalirsa yalniz yerelde saklanir, gonderilmez.
        let saklamaKipi = kip;
        if (gerileme?.kip === 'gonderirken' && kip === 'yerel_gonder') {
          const g = await gerileme.kos(`is-${isId}-gonderim`);
          if (!g.gecti) {
            saklamaKipi = 'yerel';
            surucuNotu(isId, `gonderilmedi: tam test takimi (${gerileme.komut}) kaliyor; yalniz yerelde saklandi. Cikti: ${g.dosya}`);
            yaz(t('gonderilmedi', { baslik, dosya: g.dosya }));
          }
        }
        const saklama = sakla(kok, saklamaKipi, `mihenk: is ${isId} gecti: ${tekSatir(listeIsi.soru, 60)}`);
        not = saklama.not;
        olay('saklama', { is_id: isId, kip, commit: saklama.commit, push: saklama.push, not: saklama.not });
      } else if (not === '') {
        not = son.gerekce ?? '';
      }
      if (son.supheler.length > 0) not = `SUPHELI: ${son.supheler.join('; ')}. ${not}`;
      yaz(t('is_sonucu', { baslik, durum: son.durum.toUpperCase(), gecersiz: gecersiz ? t('gecersiz_ek') : '', not }));
      if (son.durum !== 'gecti' && existsSync(join(defter.dizin, 'geri', `is-${isId}-son.json`))) {
        yaz(t('geri_al_hatirlatma', { baslik, id: isId }));
      }
      olay('is_bitti', { is_id: isId, kimlik, durum: son.durum, deneme, devir, gecersiz });
      sonuclar.push({ kimlik, is_id: isId, durum: son.durum, atlandi: false, deneme, devir, gecersiz, not });
    }
    // Gerileme "liste_sonunda": butun isler bitince tam takim bir kez.
    if (gerileme?.kip === 'liste_sonunda') {
      const g = await gerileme.kos('liste-sonu');
      gerilemeKaldi = !g.gecti;
      gerilemeSonu = t(g.gecti ? 'gerileme_sonu_gecti' : 'gerileme_sonu_kaldi', { komut: gerileme.komut, dosya: g.dosya });
      olay('gerileme_liste_sonu', { gecti: g.gecti, dosya: g.dosya });
    }
    // Olcume dayali oneri: butun testler hem esikten uzun hem listenin onemli bir payiysa daha hizli kip onerilir.
    if (gerileme && gerileme.kip !== 'gonderirken') {
      const ms = gerileme.harcananMs();
      const toplam = Date.now() - listeBasi;
      const esik = s.gerilemeOneriEsigi ?? { enAzMs: 120_000, oran: 0.25 };
      if (ms >= esik.enAzMs && toplam > 0 && ms / toplam >= esik.oran) {
        gerilemeOnerisi = t('gerileme_oneri', { dk: Math.round(ms / 6000) / 10, oran: Math.round((ms / toplam) * 100) });
        olay('gerileme_onerisi', { harcanan_ms: ms, liste_ms: toplam });
      }
    }
  } finally {
    defter.kapat();
  }

  const ozet = { toplam: sonuclar.length, gecti: 0, kaldi: 0, belirsiz: 0, acik: 0 };
  for (const r of sonuclar) ozet[r.durum] += 1;
  olay('liste_bitti', ozet);
  if (gerilemeSonu) yaz(gerilemeSonu);
  if (gerilemeOnerisi) yaz(gerilemeOnerisi);
  if (durdu) {
    const kalan = s.liste.isler.length - sonuclar.length;
    yaz(t('liste_durdu', { neden: durdu, kalan }));
    olay('liste_durdu', { neden: durdu, kalan });
  }
  yaz(t('liste_bitti', { gecti: ozet.gecti, kaldi: ozet.kaldi, belirsiz: ozet.belirsiz, toplam: ozet.toplam }));
  // Duz dilde rapor her liste sonunda yenilenir; bildirim istenirse gonderilir (Asama 14).
  try {
    const raporYolu = raporYaz(kok);
    yaz(t('rapor_satiri', { yol: raporYolu }));
    if (s.bildirim && ayarlariOku(kok).bildirim !== false) {
      const baslik = t(durdu ? 'bildirim_baslik_durdu' : 'bildirim_baslik_bitti');
      const metin = t('bildirim_metin', { toplam: ozet.toplam, gecti: ozet.gecti, kaldi: ozet.kaldi, belirsiz: ozet.belirsiz }) +
        (durdu ? t('bildirim_neden', { neden: durdu }) : '') + (gerilemeKaldi ? t('bildirim_gerileme') : '');
      const b = bildir(baslik, metin);
      olay('bildirim', { gosterildi: b.gosterildi, not: b.not });
      if (!b.gosterildi) yaz(t('parantez', { metin: b.not }));
    }
  } catch (e) {
    yaz(t('rapor_yazilamadi', { hata: e instanceof Error ? e.message : String(e) }));
  }
  return { ...(durdu ? { durdu } : {}), isler: sonuclar, ozet };
}
