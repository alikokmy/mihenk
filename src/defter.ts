// Defter cekirdegi: is kaydi ve durum makinesi. Kurallari metin degil bu dosya ve veritabani tetikleyicileri zorlar (Ilke 1).
//   - kayit acilmadan is baslamaz: kaydi olmayan ise kanit, karar, hukum yazilmaz;
//   - kaniti ajan beyan etmez: hukum_ver dogrulama komutunu burada kosar, sonucu kendisi yazar;
//   - dogrulama gecmeden is "gecti" diye kapanmaz; kapanan is degismez.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gectiMi, komutuCalistir, komutuCoz, VARSAYILAN_IZINLI } from './dogrulama.js';
import { kurcalamaFarki, testOzeti, type TestDosyasi } from './bekci.js';
import { fotografCek, fotograflariBuda, geriAlinanIsler } from './geri.js';
import { ayarlariOku as ozellikleriOku } from './ayar.js';
import { Ret } from './hata.js';
import { Log } from './log.js';
import { kisalt } from './sinir.js';

export type Durum = 'acik' | 'gecti' | 'kaldi' | 'belirsiz';
export type Hukum = 'gecti' | 'kaldi' | 'belirsiz';
const HUKUMLER: readonly Hukum[] = ['gecti', 'kaldi', 'belirsiz'];
/** Surucunun actigi islerin istemci alani. */
export const SURUCU_ISTEMCISI = 'mihenk-surucu';
const DURUMLAR: readonly Durum[] = ['acik', 'gecti', 'kaldi', 'belirsiz'];

export interface Ayarlar {
  izinli_programlar: string[];
  /** Is kaydinda verilmezse kullanilan dogrulama zaman asimi. */
  zaman_asimi_sn: number;
  en_fazla_zaman_asimi_sn: number;
  /** Deftere yazilan dogrulama ciktisi ozetinin ust siniri (karakter). */
  ozet_siniri: number;
  /**
   * Arac maliyet bildirmiyorsa kullanilacak fiyatlar: model adi (ya da ajan adi) -> milyon token basina USD.
   * Varsayilan bos: fiyat uydurulmaz; abonelikle calisan aracta maliyet "bilinmiyor" kalir.
   */
  fiyatlar: Record<string, Fiyat>;
}

export interface Fiyat {
  girdi: number;
  cikti: number;
  onbellek_okuma?: number;
  onbellek_yazma?: number;
}

const VARSAYILAN_AYARLAR: Ayarlar = {
  izinli_programlar: [...VARSAYILAN_IZINLI],
  zaman_asimi_sn: 120,
  en_fazla_zaman_asimi_sn: 1800,
  ozet_siniri: 2000,
  fiyatlar: {},
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
  if (ham.fiyatlar && typeof ham.fiyatlar === 'object') {
    for (const [ad, f] of Object.entries(ham.fiyatlar)) {
      if (f && Number.isFinite(f.girdi) && Number.isFinite(f.cikti)) a.fiyatlar[ad] = f;
    }
  }
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
  /** Is listesindeki kimlik; surucu doldurur. Kesilen liste bununla kaldigi yerden surer. */
  etiket?: string;
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
  etiket: string | null;
  durum: Durum;
  baslangic: string;
  bitis: string | null;
  deneme_sayisi: number;
  gerekce: string | null;
  /** Acilistaki test dosyalari ozeti (JSON; bekci kapaliysa null). Rapora girmez. */
  testler_ozeti?: string | null;
  /** Acilista dogrulama kosuldu mu: 1 gecti, 0 kaldi, null kosulmadi. */
  baslangic_dogrulama?: number | null;
  /** Bekcilerin "gecti" kapanisina dustugu notlar (JSON dizi) ya da null. */
  supheler?: string | null;
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
  /** Dogruluk bekcilerinin "gecti" kapanisina dustugu notlar (bos: suphe yok). */
  supheler: string[];
  mesaj: string;
}

/** Bir ajan oturumunun kullanimi. Token sayilari aracin bildirdigidir; girdi, onbellekten okunani icermez. */
export interface KullanimGirdisi {
  is_id: number;
  ajan: string;
  model?: string | null;
  oturum: number;
  sure_ms: number;
  girdi: number;
  onbellek_okuma: number;
  onbellek_yazma: number;
  cikti: number;
  /** Aracin bildirdigi maliyet; bildirmiyorsa null (fiyat tablosu varsa defter hesaplar). */
  maliyet_usd: number | null;
}

export interface KullanimKaydi extends Required<Omit<KullanimGirdisi, 'model'>> {
  id: number;
  zaman: string;
  model: string | null;
  maliyet_kaynagi: 'arac' | 'fiyat_tablosu' | null;
}

export interface KullanimToplami {
  oturum: number;
  ajan_sure_sn: number;
  girdi: number;
  onbellek_okuma: number;
  onbellek_yazma: number;
  cikti: number;
  /** Bilinen maliyetlerin toplami; hicbir oturumun maliyeti bilinmiyorsa null. */
  maliyet_usd: number | null;
  /** Maliyeti bilinmeyen oturum sayisi: 0 degilse maliyet_usd eksiktir. */
  maliyeti_bilinmeyen_oturum: number;
}

/** Kapanmis bir isin olculmus sonucu (oneri hesabinin birimi). */
export interface IsOlcumu {
  id: number;
  tur: string;
  ajan: string;
  model: string;
  durum: 'gecti' | 'kaldi' | 'belirsiz';
  sure_sn: number | null;
  deneme_sayisi: number;
  /** Isin butun oturumlarinin maliyeti; biri bile bilinmiyorsa null. */
  maliyet_usd: number | null;
  /** Is kapandiktan sonra degisiklikleri geri alindi mi (Asama 21): "gecti" ise oneri bunu basari saymaz. */
  geri_alindi?: boolean;
}

/** Raporun ve dokumun gosterdigi is (test ozeti cikmis, supheler dizi). */
export type IsGorunumu = NonNullable<Rapor['is']>;

export interface Rapor {
  ozet: { toplam: number; acik: number; gecti: number; kaldi: number; belirsiz: number };
  /** Butun defterin kullanim toplami. */
  kullanim: KullanimToplami;
  is?: Omit<IsKaydi, 'testler_ozeti' | 'supheler'> & { supheler: string[]; sure_sn: number | null; kullanim_toplami: KullanimToplami };
  kanitlar?: KanitKaydi[];
  kararlar?: KararKaydi[];
  kullanimlar?: KullanimKaydi[];
  isler?: Array<Pick<IsKaydi, 'id' | 'tur' | 'durum' | 'ajan' | 'model' | 'deneme_sayisi'> & { soru: string; sure_sn: number | null; maliyet_usd: number | null; supheli: boolean }>;
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
CREATE TABLE IF NOT EXISTS kullanim (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_id INTEGER NOT NULL REFERENCES isler(id),
  zaman TEXT NOT NULL,
  ajan TEXT NOT NULL,
  model TEXT,
  oturum INTEGER NOT NULL,
  sure_ms INTEGER NOT NULL CHECK (sure_ms >= 0),
  girdi INTEGER NOT NULL CHECK (girdi >= 0),
  onbellek_okuma INTEGER NOT NULL CHECK (onbellek_okuma >= 0),
  onbellek_yazma INTEGER NOT NULL CHECK (onbellek_yazma >= 0),
  cikti INTEGER NOT NULL CHECK (cikti >= 0),
  maliyet_usd REAL CHECK (maliyet_usd IS NULL OR maliyet_usd >= 0),
  maliyet_kaynagi TEXT CHECK (maliyet_kaynagi IS NULL OR maliyet_kaynagi IN ('arac', 'fiyat_tablosu'))
);
CREATE TRIGGER IF NOT EXISTS kullanim_degismez BEFORE UPDATE ON kullanim
BEGIN SELECT RAISE(ABORT, 'mihenk: kullanim kaydi degismez'); END;
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

/** Rapora ve dokume giden hali: buyuk test ozeti cikar, supheler diziye cevrilir. */
function disaAcik(is: IsKaydi): Omit<IsKaydi, 'testler_ozeti' | 'supheler'> & { supheler: string[] } {
  const { testler_ozeti: _ozet, supheler, ...geri } = is;
  return { ...geri, supheler: supheler ? (JSON.parse(supheler) as string[]) : [] };
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
    // Sema gocu: etiket (Asama 3), bekci sutunlari (Asama 10) sonradan eklendi; eski defterler acilirken tamamlanir.
    const sutunlar = this.db.prepare('PRAGMA table_info(isler)').all() as Array<{ name: string }>;
    for (const [ad, tur] of [['etiket', 'TEXT'], ['testler_ozeti', 'TEXT'], ['baslangic_dogrulama', 'INTEGER'], ['supheler', 'TEXT']] as const) {
      if (sutunlar.some((s) => s.name === ad)) continue;
      try {
        this.db.exec(`ALTER TABLE isler ADD COLUMN ${ad} ${tur}`);
      } catch (e) {
        // Ayni anda acilan ikinci surec sutunu eklemis olabilir.
        if (!String(e).includes('duplicate column')) throw e;
      }
    }
    // Bekcinin kaydi da sonradan degistirilemez: test ozeti acilista yazilir; baslangic dogrulamasi bir kez yazilir.
    this.db.exec(`CREATE TRIGGER IF NOT EXISTS test_ozeti_degismez BEFORE UPDATE OF testler_ozeti ON isler
      BEGIN SELECT RAISE(ABORT, 'mihenk: test ozeti acilista yazilir, degismez'); END;
      CREATE TRIGGER IF NOT EXISTS baslangic_dogrulama_bir_kez BEFORE UPDATE OF baslangic_dogrulama ON isler
      WHEN OLD.baslangic_dogrulama IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'mihenk: baslangic dogrulamasi bir kez yazilir'); END;`);
    this.db.exec(`CREATE TRIGGER IF NOT EXISTS etiket_degismez BEFORE UPDATE OF etiket ON isler
      BEGIN SELECT RAISE(ABORT, 'mihenk: is kaydi acildiktan sonra degismez'); END;`);
  }

  /** Is listesindeki kimligiyle acilmis en son isi doner; yoksa undefined. */
  etiketleBul(etiket: string): IsKaydi | undefined {
    return this.db.prepare('SELECT * FROM isler WHERE etiket = ? ORDER BY id DESC LIMIT 1').get(etiket) as unknown as IsKaydi | undefined;
  }

  kapat(): void {
    this.db.close();
  }

  /** Bir MCP istemcisinin baglandigini loga yazar: hangi aracin deftere ulastigi logdan okunur. */
  baglantiKaydet(istemci: string | undefined): void {
    this.log.olay('baglanti', { istemci: istemci ?? 'bilinmiyor' });
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
      const etiket = g.etiket === undefined ? null : dolu('etiket', g.etiket, SINIRLAR.kisa);
      const zamanAsimi = g.zaman_asimi_sn ?? this.ayarlar.zaman_asimi_sn;
      if (!Number.isInteger(zamanAsimi) || zamanAsimi < 1 || zamanAsimi > this.ayarlar.en_fazla_zaman_asimi_sn) {
        throw new Ret('GECERSIZ_DEGER', `zaman_asimi_sn 1 ile ${this.ayarlar.en_fazla_zaman_asimi_sn} arasinda tam sayi olmalidir.`);
      }
      const sonuc = this.db
        .prepare(
          `INSERT INTO isler (tur, soru, beklenti, yanlissa, dogrulama_komutu, zaman_asimi_sn, ajan, model, istemci, etiket, baslangic, testler_ozeti)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(tur, soru, beklenti, yanlissa, komut, zamanAsimi, ajan, model, g.istemci ?? null, etiket, new Date().toISOString(),
          ozellikleriOku(this.kok).bekci_test_kurcalama === false ? null : JSON.stringify(testOzeti(this.kok)));
      const is = this.isGetir(Number(sonuc.lastInsertRowid));
      this.fotograf(is.id, 'bas');
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

  /** Geri alma fotografi (Asama 13). Alinamamasi isi durdurmaz; loga yazilir. Ayarla kapatilabilir. */
  private fotograf(isId: number, an: 'bas' | 'son'): void {
    const oz = ozellikleriOku(this.kok);
    if (oz.geri_alma === false) return;
    try {
      fotografCek(this.kok, isId, an);
      if (an === 'son') fotograflariBuda(this.kok, Number(oz.geri_alma_sakla));
    } catch (e) {
      this.log.olay('fotograf_alinamadi', { is_id: isId, an, hata: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Dogrulama komutunu bir kez kosar (hukum disi kosular: baslangic ve tekrar). */
  private async dogrulamaKos(is: IsKaydi, dosyaAdi: string): Promise<{ gecti: boolean; cikis_kodu: number | null; zaman_asimi: boolean; sure_ms: number; ozet: string; goreliDosya: string }> {
    const goreliDosya = `.mihenk/ciktilar/${dosyaAdi}`;
    const kosu = await komutuCalistir(komutuCoz(is.dogrulama_komutu, this.ayarlar.izinli_programlar), {
      cwd: this.kok, zamanAsimiMs: is.zaman_asimi_sn * 1000, ciktiDosyasi: join(this.kok, goreliDosya),
    });
    let ham = '';
    try {
      ham = readFileSync(kosu.cikti_dosyasi, 'utf8');
    } catch {
      ham = '';
    }
    if (kosu.baslatma_hatasi) ham = `[komut baslatilamadi: ${kosu.baslatma_hatasi}]\n${ham}`;
    return { gecti: gectiMi(kosu), cikis_kodu: kosu.cikis_kodu, zaman_asimi: kosu.zaman_asimi, sure_ms: kosu.sure_ms, ozet: kisalt(ham.trim(), this.ayarlar.ozet_siniri).metin, goreliDosya };
  }

  /**
   * Bos kanit bekcisi (Asama 10): is acilinca, ajan dosyaya dokunmadan once dogrulama bir kez kosulur ve sonucu kayda gecer.
   * Is baslamadan zaten gecen bir dogrulama, "gecti" hukmunun neyi kanitladigini belirsizlestirir. Kapaliysa (ayar) hicbir sey yapmaz.
   */
  baslangicDogrula(isId: number): Promise<{ is_id: number; kosuldu: boolean; gecti: boolean | null }> {
    return this.log.sarAsenk('baslangic_dogrula', { is_id: isId }, async () => {
      const is = this.acikIs(isId);
      if (ozellikleriOku(this.kok).bekci_bos_kanit === false || is.baslangic_dogrulama !== null) {
        return { is_id: isId, kosuldu: false, gecti: is.baslangic_dogrulama === null ? null : is.baslangic_dogrulama === 1 };
      }
      const k = await this.dogrulamaKos(is, `is-${is.id}-baslangic-${process.pid}.txt`);
      this.db.prepare('UPDATE isler SET baslangic_dogrulama = ? WHERE id = ? AND baslangic_dogrulama IS NULL').run(k.gecti ? 1 : 0, is.id);
      this.dokumYaz();
      return { is_id: isId, kosuldu: true, gecti: k.gecti };
    });
  }

  /** Dogrulama komutunu kosar ve hukmu sonuca gore yazar. Ajanin beyani burada hicbir sey degistirmez. */
  hukumVer(g: { is_id: number; hukum?: Hukum; gerekce?: string; surucu?: boolean }): Promise<HukumSonucu> {
    return this.log.sarAsenk('hukum_ver', g, async () => {
      const istenen: Hukum = g.hukum ?? 'gecti';
      if (!HUKUMLER.includes(istenen)) {
        throw new Ret('GECERSIZ_DEGER', `hukum su degerlerden biridir: ${HUKUMLER.join(', ')}.`);
      }
      const is = this.acikIs(g.is_id);
      // Surucunun actigi iste hakem surucudur: ajan (MCP uzerinden) hukum isteyemez. Boylece surucu, isi kapatmadan once
      // kendi denetimlerini (or. ajan proje disina yazdi mi) yapabilir.
      if (is.istemci === SURUCU_ISTEMCISI && g.surucu !== true) {
        throw new Ret('SURUCU_ISI', `is ${is.id} surucu tarafindan yonetiliyor: hukmu surucu verir. Isi bitirip durun; hukum_ver cagirmayin.`);
      }
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

      // Dogruluk bekcileri (Asama 10): yalniz "gecti" kapanisinda.
      let tekrar: Awaited<ReturnType<Defter['dogrulamaKos']>> | undefined;
      let kapanisGerekcesi = gerekce;
      const supheler: string[] = [];
      if (yeniDurum === 'gecti') {
        const oz = ozellikleriOku(this.kok);
        if (oz.bekci_kararsiz !== false) {
          tekrar = await this.dogrulamaKos(is, `is-${is.id}-deneme-${deneme}-tekrar-${process.pid}.txt`);
          if (!tekrar.gecti) {
            yeniDurum = 'belirsiz';
            kapanisGerekcesi = 'kararsiz test: dogrulama ayni kodla once gecti, hemen ardindan kaldi; sonuc guvenilir degil. Kararsizligi giderip yeni kayit acin.';
          }
        }
        if (yeniDurum === 'gecti' && oz.bekci_test_kurcalama !== false && is.testler_ozeti) {
          supheler.push(...kurcalamaFarki(JSON.parse(is.testler_ozeti) as Record<string, TestDosyasi>, testOzeti(this.kok)));
        }
        if (yeniDurum === 'gecti' && oz.bekci_bos_kanit !== false && is.baslangic_dogrulama === 1) {
          supheler.push('dogrulama is baslamadan da geciyordu: bu kanit yapilan isi gostermeyebilir');
        }
      }

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
        if (tekrar) {
          this.db
            .prepare(
              `INSERT INTO kanitlar (is_id, zaman, kaynak, komut, gecti, cikis_kodu, zaman_asimi, sure_ms, cikti_ozeti, cikti_dosyasi)
               VALUES (?, ?, 'sunucu', ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(is.id, simdi, is.dogrulama_komutu, tekrar.gecti ? 1 : 0, tekrar.cikis_kodu, tekrar.zaman_asimi ? 1 : 0, tekrar.sure_ms, `[tekrar kosusu] ${tekrar.ozet}`, tekrar.goreliDosya);
        }
        this.db.prepare('UPDATE isler SET deneme_sayisi = deneme_sayisi + 1 WHERE id = ?').run(is.id);
        if (yeniDurum !== 'acik') {
          this.db
            .prepare('UPDATE isler SET durum = ?, bitis = ?, gerekce = ?, supheler = ? WHERE id = ?')
            .run(yeniDurum, simdi, kapanisGerekcesi === '' ? null : kapanisGerekcesi, supheler.length > 0 ? JSON.stringify(supheler) : null, is.id);
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
      if (yeniDurum !== 'acik') this.fotograf(is.id, 'son');
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
          ? `Dogrulama gecti; is ${is.id} "gecti" diye kapandi.` + (supheler.length > 0 ? ` SUPHELI: ${supheler.join('; ')}.` : '')
          : tekrar && !tekrar.gecti
            ? `Is ${is.id} "belirsiz" diye kapandi: ${kapanisGerekcesi}`
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
        supheler,
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
      const kullanim = this.kullanimToplami(null);
      if (g.is_id !== undefined) {
        const is = this.isGetir(g.is_id);
        return {
          ozet, kullanim,
          is: { ...disaAcik(is), sure_sn: sureSn(is), kullanim_toplami: this.kullanimToplami(is.id) },
          kanitlar: this.kanitlar(is.id), kararlar: this.kararlar(is.id), kullanimlar: this.kullanimlar(is.id),
        };
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
        ozet, kullanim,
        isler: satirlar.map((is) => ({
          id: is.id, tur: is.tur, durum: is.durum, ajan: is.ajan, model: is.model, deneme_sayisi: is.deneme_sayisi,
          sure_sn: sureSn(is), maliyet_usd: this.kullanimToplami(is.id).maliyet_usd, supheli: is.supheler != null, soru: kisalt(is.soru, 120).metin,
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

  /**
   * Bir ajan oturumunun kullanimini ise baglar (surucu yazar; MCP araci degildir). Olcumdur, beyan degil: is kapali olsa da yazilir.
   * Arac maliyet bildirmediyse ve fiyat tablosunda model (ya da ajan) varsa maliyet hesaplanir ve kaynagi "fiyat_tablosu" yazilir.
   */
  kullanimEkle(g: KullanimGirdisi): KullanimKaydi {
    return this.log.sar('kullanim_ekle', g, () => {
      this.isGetir(g.is_id);
      for (const alan of ['oturum', 'sure_ms', 'girdi', 'onbellek_okuma', 'onbellek_yazma', 'cikti'] as const) {
        if (!Number.isInteger(g[alan]) || g[alan] < 0) throw new Ret('GECERSIZ_DEGER', `${alan} sifir ya da pozitif tam sayi olmalidir.`);
      }
      if (g.maliyet_usd !== null && (!Number.isFinite(g.maliyet_usd) || g.maliyet_usd < 0)) {
        throw new Ret('GECERSIZ_DEGER', 'maliyet_usd sifir ya da pozitif bir sayi ya da null olmalidir.');
      }
      const ajan = dolu('ajan', g.ajan, SINIRLAR.kisa);
      const model = g.model ? kisalt(g.model, SINIRLAR.kisa).metin : null;
      let maliyet = g.maliyet_usd;
      let kaynak: KullanimKaydi['maliyet_kaynagi'] = maliyet === null ? null : 'arac';
      const fiyat = maliyet === null ? (model ? this.ayarlar.fiyatlar[model] : undefined) ?? this.ayarlar.fiyatlar[ajan] : undefined;
      if (fiyat) {
        maliyet =
          (g.girdi * fiyat.girdi + g.cikti * fiyat.cikti +
            g.onbellek_okuma * (fiyat.onbellek_okuma ?? fiyat.girdi) + g.onbellek_yazma * (fiyat.onbellek_yazma ?? fiyat.girdi)) / 1_000_000;
        kaynak = 'fiyat_tablosu';
      }
      const sonuc = this.db
        .prepare(
          `INSERT INTO kullanim (is_id, zaman, ajan, model, oturum, sure_ms, girdi, onbellek_okuma, onbellek_yazma, cikti, maliyet_usd, maliyet_kaynagi)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(g.is_id, new Date().toISOString(), ajan, model, g.oturum, g.sure_ms, g.girdi, g.onbellek_okuma, g.onbellek_yazma, g.cikti, maliyet, kaynak);
      this.dokumYaz();
      return this.db.prepare('SELECT * FROM kullanim WHERE id = ?').get(Number(sonuc.lastInsertRowid)) as unknown as KullanimKaydi;
    }, (k) => ({ is_id: k.is_id, maliyet_usd: k.maliyet_usd }));
  }

  /**
   * Oneri hesabinin girdisi: kapanmis her is, olculmus sonucuyla. Model, aracin bildirdigi tek modelse odur; degilse kayittaki.
   * Maliyet ancak butun oturumlarinki biliniyorsa yazilir (kismi toplam yaniltir); hic oturum olcumu yoksa da bilinmez.
   */
  olcumler(): IsOlcumu[] {
    const geriAlinan = geriAlinanIsler(this.kok);
    const isler = this.db.prepare("SELECT * FROM isler WHERE durum <> 'acik' ORDER BY id").all() as unknown as IsKaydi[];
    const modelSorgusu = this.db.prepare('SELECT DISTINCT model FROM kullanim WHERE is_id = ? AND model IS NOT NULL');
    return isler.map((is) => {
      const k = this.kullanimToplami(is.id);
      const modeller = (modelSorgusu.all(is.id) as Array<{ model: string }>).map((m) => m.model);
      return {
        id: is.id, tur: is.tur, ajan: is.ajan, model: modeller.length === 1 ? modeller[0]! : is.model,
        durum: is.durum as Exclude<Durum, 'acik'>, sure_sn: sureSn(is), deneme_sayisi: is.deneme_sayisi,
        maliyet_usd: k.oturum > 0 && k.maliyeti_bilinmeyen_oturum === 0 ? k.maliyet_usd : null,
        geri_alindi: geriAlinan.has(is.id),
      };
    });
  }

  private kullanimlar(isId: number): KullanimKaydi[] {
    return this.db.prepare('SELECT * FROM kullanim WHERE is_id = ? ORDER BY id').all(isId) as unknown as KullanimKaydi[];
  }

  private kullanimToplami(isId: number | null): KullanimToplami {
    const t = this.db
      .prepare(
        `SELECT count(*) AS oturum, coalesce(sum(sure_ms), 0) AS sure_ms, coalesce(sum(girdi), 0) AS girdi,
                coalesce(sum(onbellek_okuma), 0) AS onbellek_okuma, coalesce(sum(onbellek_yazma), 0) AS onbellek_yazma,
                coalesce(sum(cikti), 0) AS cikti, sum(maliyet_usd) AS maliyet_usd,
                sum(CASE WHEN maliyet_usd IS NULL THEN 1 ELSE 0 END) AS bilinmeyen
         FROM kullanim ${isId === null ? '' : 'WHERE is_id = ?'}`,
      )
      .get(...(isId === null ? [] : [isId])) as Record<string, number | null>;
    return {
      oturum: Number(t.oturum), ajan_sure_sn: Math.round(Number(t.sure_ms) / 100) / 10,
      girdi: Number(t.girdi), onbellek_okuma: Number(t.onbellek_okuma), onbellek_yazma: Number(t.onbellek_yazma), cikti: Number(t.cikti),
      maliyet_usd: t.maliyet_usd === null ? null : Math.round(Number(t.maliyet_usd) * 1e6) / 1e6,
      maliyeti_bilinmeyen_oturum: Number(t.bilinmeyen ?? 0),
    };
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
      const metin = isler.map((is) => JSON.stringify({ ...disaAcik(is), kanitlar: this.kanitlar(is.id), kararlar: this.kararlar(is.id), kullanim_toplami: this.kullanimToplami(is.id), kullanimlar: this.kullanimlar(is.id) })).join('\n');
      const gecici = join(this.dizin, `defter.jsonl.${process.pid}.tmp`);
      writeFileSync(gecici, metin === '' ? '' : metin + '\n');
      renameSync(gecici, join(this.dizin, 'defter.jsonl'));
    } catch {
      // Dokum bir kolayliktir; yazilamamasi (or. dosya baska surecte acik) islemi bozmaz.
    }
  }
}
