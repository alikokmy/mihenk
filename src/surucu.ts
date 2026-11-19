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
import { AJANLAR, type AjanTanimi } from './ajanlar.js';
import { Defter, type Durum, type IsKaydi } from './defter.js';
import { agaciOldur } from './dogrulama.js';
import { Ret } from './hata.js';
import { depoDurumu, sakla, SAKLAMA_KIPLERI, type SaklamaKipi } from './saklama.js';
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
  isler: ListeIsi[];
}

export interface SurucuSecenekleri {
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
  isler: IsSonucu[];
  ozet: { toplam: number; gecti: number; kaldi: number; belirsiz: number; acik: number };
}

const MIHENK_DEPOSU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Is listesi dosyasini okur; hata iletileri kodlama bilmeyen kullanici icin yazilmistir. */
export function listeOku(dosya: string): IsListesi {
  if (!existsSync(dosya)) throw new Error(`Is listesi bulunamadi: ${dosya}`);
  let ham: unknown;
  try {
    ham = JSON.parse(readFileSync(dosya, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`Is listesi okunamadi (${dosya}): dosya gecerli JSON degil. ${e instanceof Error ? e.message : ''}`);
  }
  const liste = (Array.isArray(ham) ? { isler: ham } : ham) as IsListesi;
  if (!liste || !Array.isArray(liste.isler)) throw new Error(`Is listesi (${dosya}) "isler" adli bir liste icermeli.`);
  if (liste.saklama !== undefined && !SAKLAMA_KIPLERI.includes(liste.saklama)) {
    throw new Error(`Is listesinde "saklama" su degerlerden biri olmali: ${SAKLAMA_KIPLERI.join(', ')}.`);
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

function istemYaz(is: IsKaydi, devirNotu: string | null): string {
  const satirlar = [
    `Bu bir mihenk is kaydidir (is_id=${is.id}). Yalniz bu isi yap.`,
    `Is turu: ${is.tur}`,
    `Yapilacak: ${is.soru}`,
    `Beklenti: ${is.beklenti}`,
    `Yanlissa ne gorulur: ${is.yanlissa}`,
    `Isin bittigini gosteren komut: ${is.dogrulama_komutu}`,
    'Kurallar: Bu komutu surucu kendisi kosacak; "bitti" demen yetmez, komut gecmeli.',
    'Yalniz bu proje klasorunde calis; disindaki hicbir dosyayi degistirme. Commit ya da push yapma, saklamayi surucu yapar.',
    'Karar gereken yerde onerdigin secenegi uygula ve devam et; soru sorma. Is bitince dur.',
  ];
  if (devirNotu) satirlar.push(`DEVIR NOTU (onceki oturumdan): ${devirNotu}`);
  return satirlar.join('\n');
}

interface AjanKosusu {
  cikis_kodu: number | null;
  zaman_asimi: boolean;
  esik_asildi: boolean;
  baglam: number;
  son_metin: string;
  sure_ms: number;
  baslatma_hatasi?: string;
}

/** Ajani bassiz kipte calistirir; ciktisini satir satir izler (kullanim, son ileti), dosyaya yazar. */
function ajaniKostur(
  tanim: AjanTanimi,
  istem: string,
  o: { cwd: string; zamanAsimiMs: number; baglamEsigi: number; ciktiDosyasi: string },
): Promise<AjanKosusu> {
  const t0 = Date.now();
  const sonuc: AjanKosusu = { cikis_kodu: null, zaman_asimi: false, esik_asildi: false, baglam: 0, son_metin: '', sure_ms: 0 };
  const komut = tanim.komutBul();
  if (!komut) return Promise.resolve({ ...sonuc, baslatma_hatasi: `"${tanim.ad}" araci bu bilgisayarda bulunamadi` });

  // cwd tek basina yetmez: bazi araclar calisma klasorunu miras kalan PWD degiskeninden alir (OpenCode'da yasandi).
  const ortam: Record<string, string | undefined> = { ...process.env, PWD: o.cwd };
  delete ortam.OLDPWD;
  delete ortam.INIT_CWD;

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

function gitignoreSagla(kok: string): void {
  // Defter klasoru projeyle birlikte commit edilmez.
  const yol = join(kok, '.gitignore');
  const eski = existsSync(yol) ? readFileSync(yol, 'utf8') : '';
  if (!/^\.mihenk\/?\s*$/m.test(eski)) writeFileSync(yol, `${eski}${eski === '' || eski.endsWith('\n') ? '' : '\n'}.mihenk/\n`);
}

export async function listeyiYurut(s: SurucuSecenekleri): Promise<SurucuRaporu> {
  const kok = resolve(s.kok);
  const ajanlar = s.ajanlar ?? AJANLAR;
  const kip: SaklamaKipi = s.saklama ?? s.liste.saklama ?? 'yerel';
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
  try {
    olay('liste_basla', { is_sayisi: s.liste.isler.length, saklama: kip, baglam_esigi: baglamEsigi });
    for (const [sira, listeIsi] of s.liste.isler.entries()) {
      const kimlik = isKimligi(listeIsi);
      const baslik = `[${sira + 1}/${s.liste.isler.length}]`;
      const ajanAdi = listeIsi.ajan ?? s.liste.ajan ?? s.varsayilanAjan ?? '';
      const tanim = ajanlar[ajanAdi];

      let is = defter.etiketleBul(kimlik);
      if (is && is.durum !== 'acik') {
        yaz(`${baslik} zaten kapali (${is.durum}): ${tekSatir(listeIsi.soru, 70)}`);
        sonuclar.push({ kimlik, is_id: is.id, durum: is.durum, atlandi: true, deneme: 0, devir: 0, gecersiz: false, not: 'onceki kosuda kapanmis' });
        continue;
      }
      if (!is) {
        try {
          is = defter.isAc({
            tur: listeIsi.tur, soru: listeIsi.soru, beklenti: listeIsi.beklenti, yanlissa: listeIsi.yanlissa,
            dogrulama_komutu: listeIsi.dogrulama_komutu, ajan: ajanAdi === '' ? 'belirtilmedi' : ajanAdi, model: 'aracin varsayilani',
            istemci: 'mihenk-surucu', etiket: kimlik,
            ...(listeIsi.zaman_asimi_sn === undefined ? {} : { zaman_asimi_sn: listeIsi.zaman_asimi_sn }),
          });
        } catch (e) {
          // Kaydi acilamayan is (eksik alan, izinsiz komut) listeyi durdurmaz.
          const neden = e instanceof Error ? e.message : String(e);
          yaz(`${baslik} KAYIT ACILAMADI: ${neden}`);
          olay('kayit_acilamadi', { kimlik, neden });
          sonuclar.push({ kimlik, is_id: 0, durum: 'kaldi', atlandi: false, deneme: 0, devir: 0, gecersiz: true, not: `kayit acilamadi: ${neden}` });
          continue;
        }
      }
      const isId = is.id;
      yaz(`${baslik} basliyor (is ${isId}, ajan: ${ajanAdi || 'yok'}): ${tekSatir(listeIsi.soru, 70)}`);

      let deneme = 0;
      let devir = 0;
      let devirNotu: string | null = null;
      let gecersiz = false;
      let not = '';

      while (deneme < denemeSiniri) {
        if (!tanim) {
          not = `ajan tanimli degil: "${ajanAdi}". Gecerli: ${Object.keys(ajanlar).join(', ')}`;
          surucuNotu(isId, not);
          break;
        }
        const once = korunan.map((d) => depoDurumu(d));
        const ciktiDosyasi = join(defter.dizin, 'ciktilar', `ajan-is-${isId}-oturum-${deneme + devir + 1}.txt`);
        olay('oturum_basla', { is_id: isId, ajan: tanim.ad, deneme: deneme + 1, devir });
        const kosu = await ajaniKostur(tanim, istemYaz(defter.rapor({ is_id: isId }).is as IsKaydi, devirNotu), {
          cwd: kok, zamanAsimiMs: ajanZamanAsimiMs, baglamEsigi, ciktiDosyasi,
        });
        olay('oturum_bitti', { is_id: isId, ajan: tanim.ad, cikis_kodu: kosu.cikis_kodu, zaman_asimi: kosu.zaman_asimi, esik_asildi: kosu.esik_asildi, baglam: kosu.baglam, sure_ms: kosu.sure_ms, hata: kosu.baslatma_hatasi ?? null });

        // Ajan proje disinda bir sey degistirdi mi?
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
        if (kosu.esik_asildi && devir < devirSiniri) {
          // Baglam butcesi asildi: oturum kapatildi; yenisi devir notuyla acilir. Bu bir basarisiz deneme sayilmaz.
          devir += 1;
          devirNotu = kisalt(
            `Onceki oturum baglami sisirdigi icin kapatildi (yaklasik ${kosu.baglam} token). Simdiye kadar yapilan degisiklikler diskte duruyor; ` +
              `once neyin yapildigina bak, kaldigin yerden surdur, gereksiz cikti uretme. Onceki oturumun son iletisi: ${kosu.son_metin || '(yok)'}`,
            1500,
          ).metin;
          surucuNotu(isId, `baglam esigi (${baglamEsigi}) asildi (${kosu.baglam} token): oturum devredildi (${devir}. devir)`);
          yaz(`${baslik}   baglam esigi asildi; oturum devrediliyor (${devir}. devir)`);
          continue;
        }

        deneme += 1;
        if ((defter.rapor({ is_id: isId }).is as IsKaydi).durum !== 'acik') break; // ajan defteri kullanip isi kendisi kapatti
        const hukum = await defter.hukumVer({ is_id: isId });
        if (hukum.kapandi) break;
        const neden = kosu.zaman_asimi
          ? `ajan oturumu ${s.ajanZamanAsimiSn ?? 900} saniyede bitmedi, kapatildi`
          : kosu.esik_asildi
            ? 'baglam esigi yine asildi, devir siniri doldu'
            : `ajan durdu (cikis kodu ${kosu.cikis_kodu}) ama dogrulama gecmedi`;
        surucuNotu(isId, `${deneme}. deneme: ${neden}`);
        yaz(`${baslik}   ${deneme}. deneme: ${neden}`);
        devirNotu = kisalt(
          `Bu is daha once denendi ve dogrulama gecmedi (${deneme}. deneme; ${neden}). Diskteki degisiklikler duruyor. ` +
            `Dogrulama ciktisinin sonu: ${hukum.dogrulama.cikti_ozeti || '(bos)'}`,
          1500,
        ).metin;
      }

      // Kapanis: ya gecti, ya ajan kapatti, ya da takildi.
      let son = defter.rapor({ is_id: isId }).is as IsKaydi;
      if (son.durum === 'acik') {
        const gerekce = gecersiz ? not : `takildi: ${not || `${deneme} denemede dogrulama gecmedi`}`;
        try {
          await defter.hukumVer({ is_id: isId, hukum: gecersiz ? 'belirsiz' : 'kaldi', gerekce: kisalt(gerekce, 900).metin });
        } catch (e) {
          // Son anda dogrulama gecerse "kaldi" verilemez: is gercekten gecmistir.
          if (!(e instanceof Ret) || e.kod !== 'HUKUM_CELISKILI') throw e;
          await defter.hukumVer({ is_id: isId });
        }
        son = defter.rapor({ is_id: isId }).is as IsKaydi;
      }
      if (son.durum === 'gecti' && !gecersiz) {
        const saklama = sakla(kok, kip, `mihenk: is ${isId} gecti: ${tekSatir(listeIsi.soru, 60)}`);
        not = saklama.not;
        olay('saklama', { is_id: isId, kip, commit: saklama.commit, push: saklama.push, not: saklama.not });
      } else if (not === '') {
        not = son.gerekce ?? '';
      }
      yaz(`${baslik} ${son.durum.toUpperCase()}${gecersiz ? ' (GECERSIZ)' : ''}: ${not}`);
      olay('is_bitti', { is_id: isId, kimlik, durum: son.durum, deneme, devir, gecersiz });
      sonuclar.push({ kimlik, is_id: isId, durum: son.durum, atlandi: false, deneme, devir, gecersiz, not });
    }
  } finally {
    defter.kapat();
  }

  const ozet = { toplam: sonuclar.length, gecti: 0, kaldi: 0, belirsiz: 0, acik: 0 };
  for (const r of sonuclar) ozet[r.durum] += 1;
  olay('liste_bitti', ozet);
  yaz(`Liste bitti: ${ozet.gecti} gecti, ${ozet.kaldi} kaldi, ${ozet.belirsiz} belirsiz (toplam ${ozet.toplam}).`);
  return { isler: sonuclar, ozet };
}
