// Defter cekirdegi: is kaydi ve durum makinesi. Kurallari metin degil bu dosya ve veritabani tetikleyicileri zorlar (Ilke 1).
//   - kayit acilmadan is baslamaz: kaydi olmayan ise kanit, karar, hukum yazilmaz;
//   - kaniti ajan beyan etmez: hukum_ver dogrulama komutunu burada kosar, sonucu kendisi yazar;
//   - dogrulama gecmeden is "gecti" diye kapanmaz; kapanan is degismez.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gectiMi, komutuCalistir, komutuCoz, VARSAYILAN_IZINLI } from './dogrulama.js';
import { Ret } from './hata.js';
import { Log } from './log.js';
import { kisalt } from './sinir.js';

export type Durum = 'acik' | 'gecti' | 'kaldi' | 'belirsiz';
export type Hukum = 'gecti' | 'kaldi' | 'belirsiz';
const HUKUMLER: readonly Hukum[] = ['gecti', 'kaldi', 'belirsiz'];
const DURUMLAR: readonly Durum[] = ['acik', 'gecti', 'kaldi', 'belirsiz'];

export interface Ayarlar {
  izinli_programlar: string[];
  /** Is kaydinda verilmezse kullanilan dogrulama zaman asimi. */
  zaman_asimi_sn: number;
  en_fazla_zaman_asimi_sn: number;
  /** Deftere yazilan dogrulama ciktisi ozetinin ust siniri (karakter). */
  ozet_siniri: number;
}

const VARSAYILAN_AYARLAR: Ayarlar = {
  izinli_programlar: [...VARSAYILAN_IZINLI],
  zaman_asimi_sn: 120,
  en_fazla_zaman_asimi_sn: 1800,
  ozet_siniri: 2000,
};

/** Ayarlar surec baslarken bir kez okunur: oturum icinde mihenk.json'u degistirmek calisan sunucuyu etkilemez. */
export function ayarlariOku(kok: string): Ayarlar {
  const yol = join(kok, 'mihenk.json');
  if (!existsSync(yol)) return { ...VARSAYILAN_AYARLAR };
  const ham = JSON.parse(readFileSync(yol, 'utf8')) as Partial<Ayarlar>;
  const a = { ...VARSAYILAN_AYARLAR };
  if (Array.isArray(ham.izinli_programlar)) a.izinli_programlar = ham.izinli_programlar.map(String);
  if (Number.isInteger(ham.zaman_asimi_sn)) a.zaman_asimi_sn = ham.zaman_asimi_sn as number;
  if (Number.isInteger(ham.en_fazla_zaman_asimi_sn)) a.en_fazla_zaman_asimi_sn = ham.en_fazla_zaman_asimi_sn as number;
  if (Number.isInteger(ham.ozet_siniri)) a.ozet_siniri = ham.ozet_siniri as number;
  return a;
}

export interface IsGirdisi {
  tur: string;
  soru: string;
  beklenti: string;
  yanlissa: string;
  dogrulama_komutu: string;
  ajan: string;
  model: string;
  zaman_asimi_sn?: number;
  /** Baglanan MCP istemcisinin kendi bildirdigi ad ve surum; sunucu doldurur. */
  istemci?: string;
}

export interface IsKaydi {
  id: number;
  tur: string;
  soru: string;
  beklenti: string;
  yanlissa: string;
  dogrulama_komutu: string;
  zaman_asimi_sn: number;
  ajan: string;
  model: string;
  istemci: string | null;
  durum: Durum;
  baslangic: string;
  bitis: string | null;
  deneme_sayisi: number;
  gerekce: string | null;
}

export interface KanitKaydi {
  id: number;
  is_id: number;
  zaman: string;
  kaynak: 'ajan' | 'sunucu';
  icerik: string | null;
  komut: string | null;
  gecti: number | null;
  cikis_kodu: number | null;
  zaman_asimi: number | null;
  sure_ms: number | null;
  cikti_ozeti: string | null;
  cikti_dosyasi: string | null;
}

export interface KararKaydi {
  id: number;
  is_id: number;
  zaman: string;
  konu: string;
  secenekler: string[];
  secilen: string;
  karsi_gorus: string;
}

export interface HukumSonucu {
  is_id: number;
  durum: Durum;
  kapandi: boolean;
  istenen: Hukum;
  deneme_sayisi: number;
  dogrulama: {
    komut: string;
    gecti: boolean;
    cikis_kodu: number | null;
    zaman_asimi: boolean;
    sure_ms: number;
    cikti_ozeti: string;
    cikti_dosyasi: string;
    baslatma_hatasi?: string;
  };
  mesaj: string;
}

export interface Rapor {
  ozet: { toplam: number; acik: number; gecti: number; kaldi: number; belirsiz: number };
  is?: IsKaydi & { sure_sn: number | null };
  kanitlar?: KanitKaydi[];
  kararlar?: KararKaydi[];
  isler?: Array<Pick<IsKaydi, 'id' | 'tur' | 'durum' | 'ajan' | 'model' | 'deneme_sayisi'> & { soru: string; sure_sn: number | null }>;
}

const SEMA = `
CREATE TABLE IF NOT EXISTS isler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tur TEXT NOT NULL,
  soru TEXT NOT NULL,
  beklenti TEXT NOT NULL,
  yanlissa TEXT NOT NULL,
  dogrulama_komutu TEXT NOT NULL,
  zaman_asimi_sn INTEGER NOT NULL,
  ajan TEXT NOT NULL,
  model TEXT NOT NULL,
  istemci TEXT,
  durum TEXT NOT NULL DEFAULT 'acik' CHECK (durum IN ('acik', 'gecti', 'kaldi', 'belirsiz')),
  baslangic TEXT NOT NULL,
  bitis TEXT,
  deneme_sayisi INTEGER NOT NULL DEFAULT 0,
  gerekce TEXT
);
CREATE TABLE IF NOT EXISTS kanitlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_id INTEGER NOT NULL REFERENCES isler(id),
  zaman TEXT NOT NULL,
  kaynak TEXT NOT NULL CHECK (kaynak IN ('ajan', 'sunucu')),
  icerik TEXT,
  komut TEXT,
  gecti INTEGER,
  cikis_kodu INTEGER,
  zaman_asimi INTEGER,
  sure_ms INTEGER,
  cikti_ozeti TEXT,
  cikti_dosyasi TEXT
);
CREATE TABLE IF NOT EXISTS kararlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_id INTEGER NOT NULL REFERENCES isler(id),
  zaman TEXT NOT NULL,
  konu TEXT NOT NULL,
  secenekler TEXT NOT NULL,
  secilen TEXT NOT NULL,
  karsi_gorus TEXT NOT NULL
);

-- Kurallar veritabaninda da durur: kodun cevresinden dolasan bir yazma da reddedilir.
CREATE TRIGGER IF NOT EXISTS is_acik_dogar BEFORE INSERT ON isler
WHEN NEW.durum <> 'acik' OR NEW.bitis IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'mihenk: is ancak acik durumda acilir'); END;

CREATE TRIGGER IF NOT EXISTS kapali_is_degismez BEFORE UPDATE ON isler
WHEN OLD.durum <> 'acik'
BEGIN SELECT RAISE(ABORT, 'mihenk: kapali is degismez'); END;

CREATE TRIGGER IF NOT EXISTS kayit_degismez BEFORE UPDATE OF tur, soru, beklenti, yanlissa, dogrulama_komutu, zaman_asimi_sn, baslangic ON isler
BEGIN SELECT RAISE(ABORT, 'mihenk: is kaydi acildiktan sonra degismez'); END;

CREATE TRIGGER IF NOT EXISTS kapanis_dogrulama_ister BEFORE UPDATE OF durum ON isler
WHEN NEW.durum <> 'acik' AND NOT EXISTS (SELECT 1 FROM kanitlar WHERE is_id = NEW.id AND kaynak = 'sunucu')
BEGIN SELECT RAISE(ABORT, 'mihenk: sunucunun kostugu dogrulama olmadan is kapanmaz'); END;

CREATE TRIGGER IF NOT EXISTS gecti_gecen_dogrulama_ister BEFORE UPDATE OF durum ON isler
WHEN NEW.durum = 'gecti'
 AND COALESCE((SELECT gecti FROM kanitlar WHERE is_id = NEW.id AND kaynak = 'sunucu' ORDER BY id DESC LIMIT 1), 0) <> 1
BEGIN SELECT RAISE(ABORT, 'mihenk: son dogrulama gecmeden is gecti diye kapanmaz'); END;

CREATE TRIGGER IF NOT EXISTS kanit_acik_ise_girer BEFORE INSERT ON kanitlar
WHEN (SELECT durum FROM isler WHERE id = NEW.is_id) IS NOT 'acik'
BEGIN SELECT RAISE(ABORT, 'mihenk: kanit yalniz acik ise girer'); END;

CREATE TRIGGER IF NOT EXISTS karar_acik_ise_girer BEFORE INSERT ON kararlar
WHEN (SELECT durum FROM isler WHERE id = NEW.is_id) IS NOT 'acik'
BEGIN SELECT RAISE(ABORT, 'mihenk: karar yalniz acik ise girer'); END;
`;

const SINIRLAR = { kisa: 100, kayit: 1000, komut: 500, kanit: 4000 } as const;
const TUR_BICIMI = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function dolu(ad: string, deger: unknown, enUzun: number): string {
  if (typeof deger !== 'string' || deger.trim() === '') throw new Ret('EKSIK_ALAN', `${ad} bos olamaz.`);
  const d = deger.trim();
  if (d.length > enUzun) {
    throw new Ret('COK_UZUN', `${ad} en fazla ${enUzun} karakter olabilir (${d.length} geldi). Kayit kisa tutulur.`);
  }
  return d;
}

function sureSn(is: IsKaydi): number | null {
  if (!is.bitis) return null;
  return Math.round((Date.parse(is.bitis) - Date.parse(is.baslangic)) / 100) / 10;
}

export class Defter {
  readonly kok: string;
  readonly dizin: string;
  readonly ayarlar: Ayarlar;
  private readonly db: DatabaseSync;
  private readonly log: Log;

  constructor(kok: string, ayarlar?: Ayarlar) {
    this.kok = kok;
    this.dizin = join(kok, '.mihenk');
    mkdirSync(join(this.dizin, 'ciktilar'), { recursive: true });
    this.ayarlar = ayarlar ?? ayarlariOku(kok);
    this.log = new Log(join(this.dizin, 'log.jsonl'));
    this.db = new DatabaseSync(join(this.dizin, 'defter.db'));
    // Birden cok surec (her ajan araci kendi sunucusunu baslatir) ayni dosyaya yazar.
    this.db.exec('PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SEMA);
  }

  kapat(): void {
    this.db.close();
  }

  // ---- islemler ----

  isAc(g: IsGirdisi): IsKaydi {
    return this.log.sar('is_ac', g, () => {
      const tur = dolu('tur', g.tur, SINIRLAR.kisa);
      if (!TUR_BICIMI.test(tur)) {
        throw new Ret('GECERSIZ_DEGER', `tur kucuk harf, rakam, alt cizgi ve tireden olusan kisa bir etikettir (or. hata_duzeltme, ozellik, belge); gelen: ${JSON.stringify(tur)}.`);
      }
      const soru = dolu('soru', g.soru, SINIRLAR.kayit);
      const beklenti = dolu('beklenti', g.beklenti, SINIRLAR.kayit);
      const yanlissa = dolu('yanlissa', g.yanlissa, SINIRLAR.kayit);
      const komut = dolu('dogrulama_komutu', g.dogrulama_komutu, SINIRLAR.komut);
      const ajan = dolu('ajan', g.ajan, SINIRLAR.kisa);
      const model = dolu('model', g.model, SINIRLAR.kisa);
      komutuCoz(komut, this.ayarlar.izinli_programlar);
      const zamanAsimi = g.zaman_asimi_sn ?? this.ayarlar.zaman_asimi_sn;
      if (!Number.isInteger(zamanAsimi) || zamanAsimi < 1 || zamanAsimi > this.ayarlar.en_fazla_zaman_asimi_sn) {
        throw new Ret('GECERSIZ_DEGER', `zaman_asimi_sn 1 ile ${this.ayarlar.en_fazla_zaman_asimi_sn} arasinda tam sayi olmalidir.`);
      }
      const sonuc = this.db
        .prepare(
          `INSERT INTO isler (tur, soru, beklenti, yanlissa, dogrulama_komutu, zaman_asimi_sn, ajan, model, istemci, baslangic)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(tur, soru, beklenti, yanlissa, komut, zamanAsimi, ajan, model, g.istemci ?? null, new Date().toISOString());
      const is = this.isGetir(Number(sonuc.lastInsertRowid));
      this.dokumYaz();
      return is;
    }, (is) => ({ is_id: is.id }));
  }

  kanitEkle(g: { is_id: number; icerik: string }): { kanit_id: number; is_id: number; kaynak: 'ajan' } {
    return this.log.sar('kanit_ekle', g, () => {
      this.acikIs(g.is_id);
      const icerik = dolu('icerik', g.icerik, SINIRLAR.kanit);
      const sonuc = this.db
        .prepare(`INSERT INTO kanitlar (is_id, zaman, kaynak, icerik) VALUES (?, ?, 'ajan', ?)`)
        .run(g.is_id, new Date().toISOString(), icerik);
      this.dokumYaz();
      return { kanit_id: Number(sonuc.lastInsertRowid), is_id: g.is_id, kaynak: 'ajan' as const };
    });
  }

  kararYaz(g: { is_id: number; konu: string; secenekler: string[]; secilen: string; karsi_gorus: string }): { karar_id: number; is_id: number } {
    return this.log.sar('karar_yaz', g, () => {
      this.acikIs(g.is_id);
      const konu = dolu('konu', g.konu, SINIRLAR.kayit);
      if (!Array.isArray(g.secenekler) || g.secenekler.length < 2) {
        throw new Ret('EKSIK_ALAN', 'secenekler en az iki secenek icerir: tek secenekli bir sey karar degildir.');
      }
      const secenekler = g.secenekler.map((s, i) => dolu(`secenekler[${i}]`, s, SINIRLAR.kayit));
      const secilen = dolu('secilen', g.secilen, SINIRLAR.kayit);
      const karsi = dolu('karsi_gorus', g.karsi_gorus, SINIRLAR.kayit);
      const sonuc = this.db
        .prepare(`INSERT INTO kararlar (is_id, zaman, konu, secenekler, secilen, karsi_gorus) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(g.is_id, new Date().toISOString(), konu, JSON.stringify(secenekler), secilen, karsi);
      this.dokumYaz();
      return { karar_id: Number(sonuc.lastInsertRowid), is_id: g.is_id };
    });
  }

  /** Dogrulama komutunu kosar ve hukmu sonuca gore yazar. Ajanin beyani burada hicbir sey degistirmez. */
  hukumVer(g: { is_id: number; hukum?: Hukum; gerekce?: string }): Promise<HukumSonucu> {
    return this.log.sarAsenk('hukum_ver', g, async () => {
      const istenen: Hukum = g.hukum ?? 'gecti';
      if (!HUKUMLER.includes(istenen)) {
        throw new Ret('GECERSIZ_DEGER', `hukum su degerlerden biridir: ${HUKUMLER.join(', ')}.`);
      }
      const is = this.acikIs(g.is_id);
      const gerekce = (g.gerekce ?? '').trim();
      if (istenen !== 'gecti' && gerekce === '') {
        throw new Ret('GEREKCE_YOK', `"${istenen}" hukmu gerekcesiz verilmez: gerekce alanina neden yazin.`);
      }
      if (gerekce.length > SINIRLAR.kayit) throw new Ret('COK_UZUN', `gerekce en fazla ${SINIRLAR.kayit} karakter olabilir.`);

      const deneme = is.deneme_sayisi + 1;
      const goreliDosya = `.mihenk/ciktilar/is-${is.id}-deneme-${deneme}-${process.pid}.txt`;
      const kosu = await komutuCalistir(komutuCoz(is.dogrulama_komutu, this.ayarlar.izinli_programlar), {
        cwd: this.kok,
        zamanAsimiMs: is.zaman_asimi_sn * 1000,
        ciktiDosyasi: join(this.kok, goreliDosya),
      });
      const gecti = gectiMi(kosu);
      let ham = '';
      try {
        ham = readFileSync(kosu.cikti_dosyasi, 'utf8');
      } catch {
        ham = '';
      }
      if (kosu.baslatma_hatasi) ham = `[komut baslatilamadi: ${kosu.baslatma_hatasi}]\n${ham}`;
      if (kosu.zaman_asimi) ham += `\n[zaman asimi: ${is.zaman_asimi_sn} sn icinde bitmedi, surec olduruldu]`;
      const ozet = kisalt(ham.trim(), this.ayarlar.ozet_siniri).metin;

      // Is kapanacak mi? Tek olcut sunucunun kostugu dogrulamanin sonucu.
      let yeniDurum: Durum = 'acik';
      let celiski = false;
      if (istenen === 'gecti' && gecti) yeniDurum = 'gecti';
      else if (istenen === 'kaldi' && !gecti) yeniDurum = 'kaldi';
      else if (istenen === 'kaldi' && gecti) celiski = true;
      else if (istenen === 'belirsiz') yeniDurum = 'belirsiz';

      const simdi = new Date().toISOString();
      this.db.exec('BEGIN IMMEDIATE');
      try {
        if (this.isGetir(is.id).durum !== 'acik') throw new Ret('IS_KAPALI', `is ${is.id} bu sirada baska bir oturumca kapatildi.`);
        this.db
          .prepare(
            `INSERT INTO kanitlar (is_id, zaman, kaynak, komut, gecti, cikis_kodu, zaman_asimi, sure_ms, cikti_ozeti, cikti_dosyasi)
             VALUES (?, ?, 'sunucu', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(is.id, simdi, is.dogrulama_komutu, gecti ? 1 : 0, kosu.cikis_kodu, kosu.zaman_asimi ? 1 : 0, kosu.sure_ms, ozet, goreliDosya);
        this.db.prepare('UPDATE isler SET deneme_sayisi = deneme_sayisi + 1 WHERE id = ?').run(is.id);
        if (yeniDurum !== 'acik') {
          this.db
            .prepare('UPDATE isler SET durum = ?, bitis = ?, gerekce = ? WHERE id = ?')
            .run(yeniDurum, simdi, gerekce === '' ? null : gerekce, is.id);
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
      this.dokumYaz();

      if (celiski) {
        throw new Ret(
          'HUKUM_CELISKILI',
          `is ${is.id}: dogrulama gecti (cikis kodu 0), bu yuzden is "kaldi" diye kapatilamaz. ` +
            'Is acik kaldi. Dogrulama yetersizse gerekcesiyle "belirsiz", is gercekten tamamsa "gecti" hukmu isteyin.',
        );
      }
      const son = this.isGetir(is.id);
      const mesaj =
        yeniDurum === 'gecti'
          ? `Dogrulama gecti; is ${is.id} "gecti" diye kapandi.`
          : yeniDurum === 'acik'
            ? `DOGRULAMA KALDI; is ${is.id} kapanmadi, acik duruyor (deneme ${son.deneme_sayisi}). Isi duzeltip hukum_ver'i yeniden cagirin; ` +
              'vazgeciyorsaniz hukum "kaldi" ve gerekce ile kapatin.'
            : `Is ${is.id} "${yeniDurum}" diye kapandi (dogrulama ${gecti ? 'gecti' : 'kaldi'}).`;
      return {
        is_id: is.id,
        durum: son.durum,
        kapandi: son.durum !== 'acik',
        istenen,
        deneme_sayisi: son.deneme_sayisi,
        dogrulama: {
          komut: is.dogrulama_komutu,
          gecti,
          cikis_kodu: kosu.cikis_kodu,
          zaman_asimi: kosu.zaman_asimi,
          sure_ms: kosu.sure_ms,
          cikti_ozeti: ozet,
          cikti_dosyasi: goreliDosya,
          ...(kosu.baslatma_hatasi ? { baslatma_hatasi: kosu.baslatma_hatasi } : {}),
        },
        mesaj,
      };
    }, (h) => ({ is_id: h.is_id, durum: h.durum, gecti: h.dogrulama.gecti, cikis_kodu: h.dogrulama.cikis_kodu, sure_ms: h.dogrulama.sure_ms }));
  }

  rapor(g: { is_id?: number; durum?: Durum; sinir?: number }): Rapor {
    return this.log.sar('rapor', g, () => {
      const ozet = { toplam: 0, acik: 0, gecti: 0, kaldi: 0, belirsiz: 0 };
      for (const s of this.db.prepare('SELECT durum, count(*) AS n FROM isler GROUP BY durum').all() as Array<{ durum: Durum; n: number }>) {
        ozet[s.durum] = s.n;
        ozet.toplam += s.n;
      }
      if (g.is_id !== undefined) {
        const is = this.isGetir(g.is_id);
        return { ozet, is: { ...is, sure_sn: sureSn(is) }, kanitlar: this.kanitlar(is.id), kararlar: this.kararlar(is.id) };
      }
      if (g.durum !== undefined && !DURUMLAR.includes(g.durum)) {
        throw new Ret('GECERSIZ_DEGER', `durum su degerlerden biridir: ${DURUMLAR.join(', ')}.`);
      }
      const sinir = Math.min(Math.max(Number.isInteger(g.sinir) ? (g.sinir as number) : 20, 1), 100);
      const satirlar = (
        g.durum
          ? this.db.prepare('SELECT * FROM isler WHERE durum = ? ORDER BY id DESC LIMIT ?').all(g.durum, sinir)
          : this.db.prepare('SELECT * FROM isler ORDER BY id DESC LIMIT ?').all(sinir)
      ) as unknown as IsKaydi[];
      return {
        ozet,
        isler: satirlar.map((is) => ({
          id: is.id, tur: is.tur, durum: is.durum, ajan: is.ajan, model: is.model, deneme_sayisi: is.deneme_sayisi,
          sure_sn: sureSn(is), soru: kisalt(is.soru, 120).metin,
        })),
      };
    }, (r) => r.ozet);
  }

  // ---- yardimcilar ----

  private isGetir(id: number): IsKaydi {
    if (!Number.isInteger(id)) throw new Ret('KAYIT_YOK', `is_id tam sayi olmalidir; once is_ac ile kayit acin.`);
    const is = this.db.prepare('SELECT * FROM isler WHERE id = ?').get(id) as unknown as IsKaydi | undefined;
    if (!is) throw new Ret('KAYIT_YOK', `is ${id} defterde yok. Kayit acilmadan is baslamaz: once is_ac cagirin.`);
    return is;
  }

  private acikIs(id: number): IsKaydi {
    const is = this.isGetir(id);
    if (is.durum !== 'acik') {
      throw new Ret('IS_KAPALI', `is ${id} "${is.durum}" diye kapanmis; kapali is degismez. Yeni calisma icin is_ac ile yeni kayit acin.`);
    }
    return is;
  }

  private kanitlar(isId: number): KanitKaydi[] {
    return this.db.prepare('SELECT * FROM kanitlar WHERE is_id = ? ORDER BY id').all(isId) as unknown as KanitKaydi[];
  }

  private kararlar(isId: number): KararKaydi[] {
    const satirlar = this.db.prepare('SELECT * FROM kararlar WHERE is_id = ? ORDER BY id').all(isId) as unknown as Array<
      Omit<KararKaydi, 'secenekler'> & { secenekler: string }
    >;
    return satirlar.map((k) => ({ ...k, secenekler: JSON.parse(k.secenekler) as string[] }));
  }

  /** Okunur dokum: her is, kanitlari ve kararlariyla tek satir. Her degisiklikte bastan yazilir; kaynak veritabanidir. */
  private dokumYaz(): void {
    try {
      const isler = this.db.prepare('SELECT * FROM isler ORDER BY id').all() as unknown as IsKaydi[];
      const metin = isler.map((is) => JSON.stringify({ ...is, kanitlar: this.kanitlar(is.id), kararlar: this.kararlar(is.id) })).join('\n');
      const gecici = join(this.dizin, `defter.jsonl.${process.pid}.tmp`);
      writeFileSync(gecici, metin === '' ? '' : metin + '\n');
      renameSync(gecici, join(this.dizin, 'defter.jsonl'));
    } catch {
      // Dokum bir kolayliktir; yazilamamasi (or. dosya baska surecte acik) islemi bozmaz.
    }
  }
}
