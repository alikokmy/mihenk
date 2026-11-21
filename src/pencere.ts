// Uygulama penceresi (Asama 16): kodlama bilmeyen kullanici icin tek pencere, sekmeli. Kurulum yok, yonetici izni yok: yerel bir
// sunucu yalniz 127.0.0.1'e baglanir ve sayfayi tarayicida gosterir. Her acilista rastgele bir anahtar uretilir; API istekleri bu
// anahtari ve dogru Host basligini tasimazsa reddedilir (baska bir web sitesi bu sunucuyu kullanamaz).
// Pencere, komut satirinin kullandigi islevlerin aynisini cagirir (ayarDegistir, kur, kaldir, geriAl, raporHtml, oneriHesapla):
// CLI ile pencere ayrismaz. Eslesme PENCERE_ESLEME'dedir ve test/pencere.test.ts her CLI komutunun karsiligini denetler.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYARLAR, ayarlariOku, ayarTanimi, degerCoz, ekAlanYaz, type AyarDegeri } from './ayar.js';
import { ayarDegistir, baglamYuku } from './ayar-cli.js';
import { kapanmaliMi, kisayolKoy, klasorSec, projelerKoku, projeUygunMu, sonProjeCikar, sonProjeEkle, sonProjeler, yeniProjeKlasoru } from './baslangic.js';
import { ayarlariOku as defterAyarlari, Defter, VARSAYILAN_AYARLAR } from './defter.js';
import { dilAyarla, hangiDil, METINLER, sec, sistemDili } from './dil.js';
import { agaciOldur, PROGRAM_ADI, VARSAYILAN_IZINLI } from './dogrulama.js';
import { geriAl, geriAlinanIsler } from './geri.js';
import { kaldir } from './kaldir.js';
import { kur } from './kur.js';
import { oneriHesapla, oneriMetni, projeOneriAyarlari } from './oneri.js';
import { isNedeni, raporHtml } from './rapor.js';
import { ajaniKostur, isKimligi, LISTE_ALANLARI, listeAlaniDenetle, listeOku, type ListeIsi } from './surucu.js';
import { fikriBol } from './fikir.js';
import { TERCIH_SIRASI } from './kesif.js';
import { AJANLAR, type AjanTanimi } from './ajanlar.js';
import { PENCERE_SAYFASI } from './pencere-sayfa.js';
import { doktor, hataPaketi } from './doktor.js';
import { listeDenetimi } from './liste-denetim.js';
import { elOturumlariniTopla } from './el-oturumu.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

/** Pencerenin varsayilan portu; doluysa sonraki 20 port, o da olmazsa isletim sisteminin verdigi bos port denenir. */
/** Ise ozel ek alanlar: gecerli olanlar korunur (Asama 28 oncesi pencere bunlari kaydederken siliyordu). */
function isEkleri(x: Record<string, unknown>): Record<string, unknown> {
  const e: Record<string, unknown> = {};
  if (typeof x.kimlik === 'string' && x.kimlik.trim()) e.kimlik = x.kimlik.trim();
  if (typeof x.ajan === 'string' && x.ajan.trim()) e.ajan = x.ajan.trim();
  if (Number.isInteger(x.zaman_asimi_sn)) e.zaman_asimi_sn = x.zaman_asimi_sn;
  if (typeof x.zorluk === 'string' && ['kolay', 'orta', 'zor'].includes(x.zorluk)) e.zorluk = x.zorluk;
  for (const a of ['aile', 'bolme_plani'] as const) if (typeof x[a] === 'string' && x[a].trim()) e[a] = x[a].trim();
  return e;
}

export const VARSAYILAN_PORT = 47700;

/** "Dosyayi ac" dugmesi: her ayarin bulundugu dosya (proje icinde sabit yollar; disaridan yol alinmaz). */
export function ayarDosyasi(ad: string): string {
  const arac: Record<string, string> = {
    arac_claude: '.mcp.json', arac_codex: '.codex/config.toml', arac_gemini: '.gemini/settings.json', arac_antigravity: '.agents/plugins/mihenk/mcp_config.json',
    arac_opencode: 'opencode.json', arac_kilo: 'kilo.json', arac_cline: '.cline/mcp_settings.json', arac_qwen: '.qwen/settings.json',
  };
  if (arac[ad]) return arac[ad]!;
  if (ad === 'yontem_metni') return 'AGENTS.md';
  if (ad === 'skiller') return '.claude/skills';
  return 'mihenk.json';
}

function isletimSistemiyleAc(yol: string): void {
  if (process.platform === 'win32') spawn('cmd.exe', ['/d', '/c', 'start', '""', `"${yol}"`], { windowsHide: true, windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [yol], { detached: true, stdio: 'ignore' }).unref();
}

/** Her CLI yonetim komutunun penceredeki karsiligi (sekme ve API). uyum gelistirici aracidir, pencerede yok. */
export const PENCERE_ESLEME: Record<string, { sekme: string; api: string } | { yok: string }> = {
  kur: { sekme: 'proje', api: 'POST /api/kur' },
  kaldir: { sekme: 'proje', api: 'POST /api/kaldir' },
  sur: { sekme: 'liste', api: 'POST /api/sur' },
  ayar: { sekme: 'ayarlar', api: 'POST /api/ayar' },
  rapor: { sekme: 'defter', api: 'GET /rapor' },
  'geri-al': { sekme: 'defter', api: 'POST /api/geri-al' },
  oneri: { sekme: 'oneri', api: 'GET /api/oneri' },
  doktor: { sekme: 'proje', api: 'GET /api/doktor' },
  'hata-paketi': { sekme: 'proje', api: 'POST /api/hata-paketi' },
  'maliyet-topla': { sekme: 'oneri', api: 'POST /api/maliyet-topla' },
  uyum: { yok: 'gelistirici araci: araclarin yonteme uyumunu olcer; uzun surer ve sonucu dosyaya yazar' },
  pencere: { yok: 'pencerenin kendisi' },
  ac: { yok: 'pencerenin kendisi: proje secmeden acar (baslangic ekrani)' },
  paketle: { yok: 'gelistirici araci: cevrimdisi kurulum paketini uretir' },
};

/**
 * Komut satirinin her seceneginin penceredeki karsiligi (Asama 30). ayar: Ayarlar sekmesi; liste: Is listesi > Liste ayarlari;
 * is: isin formu; gelismis: Ayarlar > Gelismis; yer: sayfadaki ogenin kimligi; yok: neden pencerede olmadigi.
 * test/pencere-tam.test.ts komut satirindaki her secenegin burada olmasini ve karsiligin sayfada bulunmasini zorlar.
 */
export type SecenekKarsiligi = { ayar: string } | { liste: string } | { is: string } | { gelismis: string } | { yer: string } | { yok: string };
export const SECENEK_ESLEME: Record<string, SecenekKarsiligi[]> = {
  '--hedef': [{ yok: 'pencere hep acildigi projede calisir; proje degistirmek Asama 31' }],
  '--arac': [{ ayar: 'arac_claude' }, { yok: 'uyum icin: gelistirici araci' }],
  '--senaryo': [{ yok: 'uyum: gelistirici araci' }],
  '--cikis': [{ yok: 'uyum ve paketle: gelistirici araclari' }],
  '--oturum-sn': [{ liste: 'oturum_dk' }],
  '--uyum': [{ yok: 'pencere uyum raporunu varsayilan yerinden kendisi okur' }],
  '--esik': [{ ayar: 'oneri_esik' }],
  '--en-az': [{ ayar: 'oneri_en_az' }],
  '--json': [{ yok: 'makine ciktisi; pencere zaten veriyi kendisi gosterir' }],
  '--ac': [{ yer: 'p_rapor_ac' }],
  '--deneme': [{ yer: 'geri-al' }, { liste: 'deneme_siniri' }],
  '--defter-dahil': [{ yer: 'defter-dahil' }],
  '--cmd-den': [{ yok: 'ic kullanim: mihenk-kaldir.cmd kendini en son siler' }],
  '--liste': [{ yok: 'pencere projenin kendi listesini (mihenk-isler.json) duzenler' }],
  '--saklama': [{ ayar: 'saklama' }, { liste: 'saklama' }],
  '--ajan': [{ yer: 'ajan-sec' }, { is: 'ajan' }],
  '--uyanik-tut': [{ ayar: 'uyanik_tut' }, { liste: 'uyanik_tut' }],
  '--baglam-esigi': [{ liste: 'baglam_esigi' }],
  '--port': [{ yok: 'pencerenin kendisi: dolu portta kendiliginden baska port secer' }],
  '--acma': [{ yok: 'pencerenin kendisi' }],
  '--zipsiz': [{ yok: 'paketle: gelistirici araci' }],
};
/** Isin formundaki alanlar (data-alan); kimlik ic kullanimdir: listedeki isin kalici adi, pencere korur ama gostermez. */
export const IS_ALANLARI = ['tur', 'soru', 'beklenti', 'yanlissa', 'dogrulama_komutu', 'zorluk', 'ajan', 'zaman_asimi_sn', 'aile', 'bolme_plani'] as const;

function dilKur(kok: string): void {
  if (!kok) { dilAyarla('tr'); return; } // baslangic ekrani: proje yok, varsayilan dil
  const d = ayarlariOku(kok).dil;
  dilAyarla(d === 'en' || d === 'tr' ? d : sistemDili());
}

/** Penceredeki metinler (p_ ile baslayan katalog anahtarlari), gecerli dilde. */
function pencereMetinleri(): Record<string, string> {
  const d = hangiDil();
  return Object.fromEntries(Object.entries(METINLER).filter(([k]) => k.startsWith('p_')).map(([k, v]) => [k, v[d]]));
}

function isler(kok: string) {
  if (!existsSync(join(kok, '.mihenk', 'defter.db'))) return [];
  const defter = new Defter(kok);
  const geriAlinan = geriAlinanIsler(kok);
  try {
    return (defter.rapor({ sinir: 100 }).isler ?? []).map((x) => {
      const is = defter.rapor({ is_id: x.id }).is!;
      return {
        id: is.id, tur: is.tur, soru: is.soru, durum: is.durum, ajan: is.ajan, sure_sn: is.sure_sn, deneme: is.deneme_sayisi,
        gerekce: is.gerekce, supheler: is.supheler, maliyet_usd: is.kullanim_toplami.maliyet_usd,
        geri_alindi: geriAlinan.has(is.id),
        geri_alinabilir: !geriAlinan.has(is.id) && is.durum !== 'acik' && existsSync(join(kok, '.mihenk', 'geri', `is-${is.id}-son.json`)),
      };
    });
  } finally {
    defter.kapat();
  }
}

function durum(kok: string) {
  const a = ayarlariOku(kok);
  let ozet = null;
  if (existsSync(join(kok, '.mihenk', 'defter.db'))) {
    const d = new Defter(kok);
    try {
      ozet = d.rapor({}).ozet;
    } finally {
      d.kapat();
    }
  }
  return {
    secim: false, dil: hangiDil(), metinler: pencereMetinleri(),
    proje: { kok, ad: basename(kok), kurulu: existsSync(join(kok, '.mihenk', 'kurulum.json')), liste_var: existsSync(join(kok, 'mihenk-isler.json')) },
    ozet, baglam: baglamYuku(kok),
    ayarlar: AYARLAR.map((t) => ({
      ad: t.ad, baslik: sec(t.baslik), deger: a[t.ad], varsayilan: t.varsayilan, secenekler: t.secenekler ?? null, sayi: t.sayi ?? null, etki: t.etki,
      secenek_adlari: t.secenek_adlari ? Object.fromEntries(Object.entries(t.secenek_adlari).map(([k, v]) => [k, sec(v)])) : null,
      aciklama: sec(t.aciklama), amac: sec(t.amac), sonuc: sec(t.sonuc), varsayilan_aciklama: sec(t.varsayilan_aciklama),
    })),
  };
}


/** Pencerenin "Gelismis" bolumundeki sayisal alanlar: mihenk.json'da, defter ayarlari (Asama 30). */
export const GELISMIS_SAYILAR = [
  { ad: 'zaman_asimi_sn', en_az: 1, en_cok: 86_400 },
  { ad: 'en_fazla_zaman_asimi_sn', en_az: 1, en_cok: 86_400 },
  { ad: 'ozet_siniri', en_az: 200, en_cok: 200_000 },
] as const;
/** "Gelismis" bolumunun butun alanlari; esleme testi defterin her ayarinin burada oldugunu denetler. */
export const GELISMIS_ALANLARI = ['izinli_programlar', 'kota', 'fiyatlar', ...GELISMIS_SAYILAR.map((s) => s.ad)] as const;

function gelismisOku(kok: string) {
  const a = defterAyarlari(kok);
  return {
    izinli_programlar: a.izinli_programlar, varsayilan_izinli: [...VARSAYILAN_IZINLI],
    kota: a.kota, fiyatlar: a.fiyatlar,
    sayilar: GELISMIS_SAYILAR.map((s) => ({ ...s, deger: a[s.ad], varsayilan: VARSAYILAN_AYARLAR[s.ad] })),
    araclar: Object.keys(AJANLAR),
  };
}

const pozitifMi = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const negatifDegilMi = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/** Gelismis alanin degerini dogrular; varsayilana esitse null doner (dosyadan cikar). */
function gelismisDenetle(alan: string, d: unknown): { deger: unknown } | { hata: string } {
  if (alan === 'izinli_programlar') {
    if (!Array.isArray(d)) return { hata: 'liste' };
    const l = [...new Set(d.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
    const kotu = l.find((x) => !PROGRAM_ADI.test(x));
    if (kotu !== undefined) return { hata: kotu };
    if (l.length === 0) return { hata: 'bos' };
    const v = [...VARSAYILAN_IZINLI].map((x) => x.toLowerCase());
    return { deger: l.length === v.length && l.every((x) => v.includes(x)) ? null : l };
  }
  if (alan === 'kota' || alan === 'fiyatlar') {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { hata: alan };
    const sonuc: Record<string, Record<string, number>> = {};
    for (const [ad, k] of Object.entries(d as Record<string, Record<string, unknown>>)) {
      const isim = ad.trim();
      if (!isim || !k || typeof k !== 'object') return { hata: ad || '?' };
      if (alan === 'kota') {
        if (!pozitifMi(k.pencere_saat)) return { hata: `${isim}: pencere_saat` };
        for (const x of ['kapasite', 'pencere_usd']) if (k[x] !== undefined && k[x] !== null && !pozitifMi(k[x])) return { hata: `${isim}: ${x}` };
        sonuc[isim] = { pencere_saat: k.pencere_saat as number, ...(pozitifMi(k.kapasite) ? { kapasite: k.kapasite } : {}), ...(pozitifMi(k.pencere_usd) ? { pencere_usd: k.pencere_usd } : {}) };
      } else {
        if (!negatifDegilMi(k.girdi) || !negatifDegilMi(k.cikti)) return { hata: `${isim}: girdi / cikti` };
        for (const x of ['onbellek_okuma', 'onbellek_yazma']) if (k[x] !== undefined && k[x] !== null && !negatifDegilMi(k[x])) return { hata: `${isim}: ${x}` };
        sonuc[isim] = { girdi: k.girdi as number, cikti: k.cikti as number, ...(negatifDegilMi(k.onbellek_okuma) ? { onbellek_okuma: k.onbellek_okuma } : {}), ...(negatifDegilMi(k.onbellek_yazma) ? { onbellek_yazma: k.onbellek_yazma } : {}) };
      }
    }
    return { deger: Object.keys(sonuc).length ? sonuc : null };
  }
  const s = GELISMIS_SAYILAR.find((x) => x.ad === alan);
  if (!s) return { hata: alan };
  if (d === null || d === '') return { deger: null };
  if (typeof d !== 'number' || !Number.isInteger(d) || d < s.en_az || d > s.en_cok) return { hata: `${s.en_az}-${s.en_cok}` };
  return { deger: d === VARSAYILAN_AYARLAR[s.ad] ? null : d };
}

export interface PencereSunucusu {
  url: string;
  anahtar: string;
  port: number;
  kapat(): Promise<void>;
}

export interface PencereSecenekleri {
  port?: number;
  dosyaAcici?: (yol: string) => void;
  /** Klasor secici (varsayilan: Windows'un kendi secicisi); testler sahtesini verir. */
  klasorSecici?: (aciklama: string) => Promise<string | null>;
  /** Masaustu kisayolu yapan islev; testler sahtesini verir. */
  kisayolYapici?: () => Promise<string | null>;
  /** Yeni projelerin acildigi klasor (varsayilan Belgeler\mihenk-projeleri). */
  projelerKoku?: string;
  /** Sayfa kapaninca kendiliginden kapanma (Asama 31): nabiz bu kadar gelmezse ve liste calismiyorsa. */
  otomatikKapan?: { sureMs: number; denetimMs?: number };
  /** Kendiliginden kapandiktan sonra cagrilir (komut satiri sureci bitirir). */
  kapaninca?: () => void;
  /** Fikri islere bolen ajan tanimlari (varsayilan: bilinen araclar); testler sahtesini verir. */
  ajanlar?: Readonly<Record<string, AjanTanimi>>;
}

/**
 * Islerin durumu duz dille (Asama 32): listedeki her is icin sirada / yapiliyor / bitti / olmadi / baslayamadi ve nedeni.
 * Kayit listedeki isin kalici adiyla (etiket) bulunur; kaydi hic acilamamis is (hazirlik olmadi) surucunun olay kaydindan.
 */
function listeDurumu(kok: string, calisiyor: boolean) {
  let isler: ListeIsi[] = [];
  try {
    isler = listeOku(join(kok, 'mihenk-isler.json')).isler;
  } catch {
    return [];
  }
  const takilan = new Map<string, string>();
  try {
    for (const s of readFileSync(join(kok, '.mihenk', 'surucu.jsonl'), 'utf8').split('\n')) {
      if (!s.includes('"test_once"')) continue;
      const o = JSON.parse(s) as { kimlik?: string; tamam?: boolean; neden?: string | null };
      if (!o.kimlik) continue;
      if (o.tamam === false) takilan.set(o.kimlik, o.neden ?? '');
      else takilan.delete(o.kimlik);
    }
  } catch {
    // olay kaydi yok
  }
  const d = existsSync(join(kok, '.mihenk', 'defter.db')) ? new Defter(kok) : null;
  let yapiliyorVerildi = false;
  try {
    return isler.map((is, i) => {
      const kimlik = isKimligi(is);
      const kayit = d?.etiketleBul(kimlik) ?? null;
      let durum: string;
      let neden = '';
      if (kayit && kayit.durum !== 'acik') {
        durum = kayit.durum;
        neden = isNedeni(d!.rapor({ is_id: kayit.id }).is!);
      } else if (calisiyor && !yapiliyorVerildi && !(takilan.has(kimlik) && !kayit)) {
        durum = 'yapiliyor';
        yapiliyorVerildi = true;
      } else if (!kayit && takilan.has(kimlik)) {
        durum = 'takildi';
        neden = takilan.get(kimlik)!;
      } else durum = kayit ? 'yarim' : 'sirada';
      return { sira: i + 1, soru: is.soru, durum, neden };
    });
  } finally {
    d?.kapat();
  }
}

/**
 * Sunucuyu baslatir (port 0: bos bir port). Yalniz 127.0.0.1'e baglanir. hedef null ise baslangic ekrani acilir (Asama 31): proje
 * secilene dek yalniz baslangic uclari calisir. Liste calismiyorken proje degistirilebilir.
 */
export function pencereAc(hedef: string | null, o: PencereSecenekleri = {}): Promise<PencereSunucusu> {
  let kok = hedef ? resolve(hedef) : '';
  const anahtar = randomBytes(24).toString('hex');
  let surucu: { cocuk: ChildProcess; satirlar: string[]; bitti: boolean; cikis: number | null } | null = null;
  let port = 0;
  let sonNabiz = 0;
  let fikirIsi: { calisiyor: boolean; ajan: string; sonuc: Awaited<ReturnType<typeof fikriBol>> | null } | null = null;
  let zamanlayici: NodeJS.Timeout | undefined;
  const listeCalisiyor = (): boolean => surucu !== null && !surucu.bitti;
  const baslangicDurumu = () => ({
    secim: true, dil: hangiDil(), metinler: pencereMetinleri(), son_projeler: sonProjeler(), projeler_koku: o.projelerKoku ?? projelerKoku(),
    kisayol: process.platform === 'win32',
  });

  const json = (res: ServerResponse, kod: number, veri: unknown): void => {
    res.writeHead(kod, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(veri));
  };
  const govde = (req: IncomingMessage): Promise<Record<string, unknown>> => new Promise((ok, red) => {
    let s = '';
    req.on('data', (p: Buffer) => { s += p.toString('utf8'); if (s.length > 1_000_000) red(new Error('govde cok buyuk')); });
    req.on('end', () => { try { ok(s ? (JSON.parse(s) as Record<string, unknown>) : {}); } catch (e) { red(e as Error); } });
  });

  const sunucu: Server = createServer(async (req, res) => {
    try {
      // DNS yeniden baglama ve baska sitelere karsi: Host yalniz bu sunucu, API isteginde anahtar zorunlu.
      const host = req.headers.host ?? '';
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return json(res, 403, { hata: 'host' });
      const u = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      dilKur(kok);
      const anahtarGecerli = req.headers['x-mihenk-anahtar'] === anahtar || u.searchParams.get('anahtar') === anahtar;
      if (u.pathname === '/' && req.method === 'GET') {
        if (!anahtarGecerli) return json(res, 403, { hata: 'anahtar' });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" });
        return res.end(PENCERE_SAYFASI);
      }
      if (!anahtarGecerli) return json(res, 403, { hata: 'anahtar' });
      if (u.pathname === '/rapor' && req.method === 'GET') {
        if (!kok) return json(res, 409, { hata: 'proje' });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(existsSync(join(kok, '.mihenk', 'defter.db')) ? raporHtml(kok).html : `<p>${METINLER.p_defter_bos[hangiDil()]}</p>`);
      }
      const yol = `${req.method} ${u.pathname}`;
      sonNabiz = Date.now(); // sayfadan gelen her istek nabizdir
      // --- Baslangic ekrani (Asama 31): proje secmek, yeni proje, klasor secici, kisayol. Proje acikken de calisir.
      if (yol === 'POST /api/nabiz') return json(res, 200, { tamam: true });
      if (yol === 'GET /api/durum' && !kok) return json(res, 200, baslangicDurumu());
      if (yol === 'POST /api/proje') {
        const g = await govde(req);
        if (listeCalisiyor()) return json(res, 409, { hata: METINLER.p_bs_liste_calisiyor[hangiDil()] });
        if (g.kok === null) { kok = ''; return json(res, 200, { secim: true }); }
        const u2 = projeUygunMu(String(g.kok ?? ''));
        if (!u2.tamam) return json(res, 400, { hata: METINLER[`p_bs_${u2.neden}`][hangiDil()] });
        const kurulu = existsSync(join(u2.kok, '.mihenk', 'kurulum.json'));
        if (!kurulu && g.kur !== true) return json(res, 200, { kurulu: false, kok: u2.kok });
        if (!kurulu) kur(u2.kok, { esitle: true });
        kok = u2.kok;
        surucu = null;
        sonProjeEkle(kok);
        return json(res, 200, { kurulu: true, kok });
      }
      if (yol === 'POST /api/yeni-proje') {
        const g = await govde(req);
        const y = yeniProjeKlasoru(String(g.ad ?? ''), o.projelerKoku);
        if (!y.tamam) return json(res, 400, { hata: METINLER.p_bs_ad_gecersiz[hangiDil()] });
        return json(res, 200, { kok: y.kok });
      }
      if (yol === 'POST /api/klasor-sec') {
        const secilen = await (o.klasorSecici ?? klasorSec)(METINLER.p_bs_secici_aciklama[hangiDil()]);
        return json(res, 200, { kok: secilen });
      }
      if (yol === 'POST /api/son-proje-cikar') {
        const g = await govde(req);
        sonProjeCikar(String(g.kok ?? ''));
        return json(res, 200, { son_projeler: sonProjeler() });
      }
      if (yol === 'POST /api/kisayol') {
        const y = await (o.kisayolYapici ?? kisayolKoy)();
        if (!y) return json(res, 400, { hata: METINLER.p_bs_kisayol_olmadi[hangiDil()] });
        return json(res, 200, { yol: y });
      }
      if (!kok) return json(res, 409, { hata: METINLER.p_bs_proje_sec[hangiDil()] });
      if (yol === 'GET /api/durum') return json(res, 200, durum(kok));
      if (yol === 'GET /api/isler') return json(res, 200, isler(kok));
      if (yol === 'GET /api/doktor') return json(res, 200, doktor(kok));
      if (yol === 'POST /api/maliyet-topla') return json(res, 200, existsSync(join(kok, '.mihenk', 'defter.db')) ? { ...elOturumlariniTopla(kok), mesaj: METINLER.mt_fiyat[hangiDil()] } : { eklenen: 0, bos: 0, zaten: 0, mesaj: METINLER.p_defter_bos[hangiDil()] });
      if (yol === 'POST /api/hata-paketi') {
        const p = hataPaketi(kok);
        (o.dosyaAcici ?? isletimSistemiyleAc)(p);
        return json(res, 200, { yol: p.slice(kok.length + 1).replace(/\\/g, '/') });
      }
      if (yol === 'POST /api/ayar') {
        const g = await govde(req);
        const t = ayarTanimi(String(g.ad));
        // Deger komut satiriyla ayni yoldan dogrulanir: ac / kapa, secim ya da sayi.
        const deger: AyarDegeri = degerCoz(t, typeof g.deger === 'boolean' ? (g.deger ? 'ac' : 'kapa') : String(g.deger));
        return json(res, 200, { mesaj: ayarDegistir(kok, t.ad, deger) });
      }
      if (yol === 'GET /api/gelismis') return json(res, 200, gelismisOku(kok));
      if (yol === 'POST /api/gelismis') {
        // mihenk.json'un ayar disi alanlari (Asama 30): dosya elle duzenlenmez. Gecersiz deger dosyaya yazilmaz.
        const g = await govde(req);
        const alan = String(g.alan);
        const sonuc = gelismisDenetle(alan, g.deger);
        if ('hata' in sonuc) return json(res, 400, { hata: METINLER.p_gl_hatali[hangiDil()].replace('{neden}', sonuc.hata) });
        ekAlanYaz(kok, { [alan]: sonuc.deger });
        return json(res, 200, gelismisOku(kok));
      }
      if (yol === 'POST /api/kur') {
        const s = kur(kok, { esitle: true });
        return json(res, 200, { yazilan: s.yazilan.length, degismeyen: s.degismeyen.length, geri_alinan: s.geri_alinan?.length ?? 0, uyarilar: s.uyarilar });
      }
      if (yol === 'POST /api/kaldir') {
        const g = await govde(req);
        if (g.onay !== true) return json(res, 400, { hata: METINLER.p_onay_gerekli[hangiDil()] });
        return json(res, 200, kaldir(kok, { defterDahil: g.defter_dahil === true }));
      }
      if (yol === 'POST /api/geri-al') {
        // Once onizleme (deneme), sonra acik onay: onaysiz istek dosyaya dokunmaz (Asama 18).
        const g = await govde(req);
        if (g.deneme === true) return json(res, 200, geriAl(kok, Number(g.id), { deneme: true }));
        if (g.onay !== true) return json(res, 400, { hata: METINLER.p_onay_gerekli_geri[hangiDil()] });
        return json(res, 200, geriAl(kok, Number(g.id)));
      }
      if (yol === 'GET /api/oneri') {
        if (!existsSync(join(kok, '.mihenk', 'defter.db'))) return json(res, 200, { metin: METINLER.p_defter_bos[hangiDil()], turler: [] });
        const d = new Defter(kok);
        try {
          const turler = oneriHesapla(d.olcumler(), projeOneriAyarlari(kok, { kurulu: Object.keys(AJANLAR).filter((a) => AJANLAR[a]!.komutBul() !== null) }));
          return json(res, 200, { metin: oneriMetni(turler, projeOneriAyarlari(kok)), turler, kullanim: d.rapor({}).kullanim });
        } finally {
          d.kapat();
        }
      }
      if (yol === 'GET /api/liste') {
        // Liste alan alan doner (pencere JSON gostermez). Dosya yoksa ornekten, o da yoksa bos.
        const dosya = join(kok, 'mihenk-isler.json');
        const ornek = join(kok, 'mihenk-isler.ornek.json');
        let ham: Record<string, unknown> = {};
        let bozuk = false;
        try {
          ham = existsSync(dosya) ? JSON.parse(readFileSync(dosya, 'utf8')) : existsSync(ornek) ? JSON.parse(readFileSync(ornek, 'utf8')) : {};
        } catch {
          bozuk = true;
        }
        const alan = (x: Record<string, unknown>, a: string): string => (typeof x[a] === 'string' ? (x[a] as string) : '');
        const liste = Array.isArray(ham.isler) ? (ham.isler as Record<string, unknown>[]) : [];
        const araclar = Object.entries(AJANLAR).filter(([, t]) => t.komutBul() !== null).map(([a]) => a);
        const listeIsleri = liste.map((x) => ({ soru: alan(x, 'soru'), beklenti: alan(x, 'beklenti'), yanlissa: alan(x, 'yanlissa'), dogrulama_komutu: alan(x, 'dogrulama_komutu'), ...(alan(x, 'ajan') ? { ajan: alan(x, 'ajan') } : {}), ...(x.zorluk !== undefined ? { zorluk: String(x.zorluk) } : {}) }));
        return json(res, 200, {
          var: existsSync(dosya), bozuk, ajan: typeof ham.ajan === 'string' ? ham.ajan : '', araclar,
          uyarilar: existsSync(dosya) ? listeDenetimi(kok, listeIsleri, { ...(typeof ham.ajan === 'string' ? { ajan: ham.ajan } : {}) }) : [],
          // Liste ayarlari (Asama 30): bos olanlar null; pencere bunlari "Liste ayarlari" bolumunde gosterir.
          liste_alanlari: LISTE_ALANLARI, liste_ayarlari: Object.fromEntries(LISTE_ALANLARI.map((a) => [a.ad, ham[a.ad] ?? null])),
          saklama_adlari: Object.fromEntries(Object.entries(ayarTanimi('saklama').secenek_adlari ?? {}).map(([k, v]) => [k, sec(v)])),
          // Ise ozel ek alanlar (ajan, kimlik, zaman asimi, zorluk) da doner: form kaydedince kaybolmasinlar.
          isler: liste.map((x) => ({ tur: alan(x, 'tur'), soru: alan(x, 'soru'), beklenti: alan(x, 'beklenti'), yanlissa: alan(x, 'yanlissa'), dogrulama_komutu: alan(x, 'dogrulama_komutu'), ...isEkleri(x) })),
        });
      }
      if (yol === 'POST /api/liste') {
        // Formdan gelen isler ve arac; dosyadaki oteki alanlar (saklama, tavanlar...) korunur. Gecersizse dosyaya dokunulmaz.
        const g = await govde(req);
        const dosya = join(kok, 'mihenk-isler.json');
        let ham: Record<string, unknown> = {};
        try {
          if (existsSync(dosya)) ham = JSON.parse(readFileSync(dosya, 'utf8')) as Record<string, unknown>;
        } catch {
          ham = {};
        }
        delete ham.aciklama;
        const temiz = (s: unknown): string => String(s ?? '').trim();
        ham.isler = (Array.isArray(g.isler) ? g.isler as Record<string, unknown>[] : []).map((x) => ({
          tur: temiz(x.tur) || 'hata_duzeltme', soru: temiz(x.soru), beklenti: temiz(x.beklenti), yanlissa: temiz(x.yanlissa),
          ...(temiz(x.dogrulama_komutu) ? { dogrulama_komutu: temiz(x.dogrulama_komutu) } : {}),
          ...isEkleri(x),
        }));
        // Komut zorunlu degil (Asama 32): bos birakilirsa ajan once kabul testini yazar.
        const ALANLAR = [['soru', 'p_alan_soru'], ['beklenti', 'p_alan_beklenti'], ['yanlissa', 'p_alan_yanlissa']] as const;
        for (const [n, x] of (ham.isler as Record<string, string>[]).entries()) {
          for (const [a, k] of ALANLAR) {
            if (!x[a]) return json(res, 400, { hata: METINLER.p_alan_bos[hangiDil()].replace('{n}', String(n + 1)).replace('{alan}', METINLER[k][hangiDil()]) });
          }
        }
        if (typeof g.ajan === 'string' && g.ajan !== '') ham.ajan = g.ajan;
        else delete ham.ajan;
        if (g.liste_ayarlari && typeof g.liste_ayarlari === 'object') {
          const la = g.liste_ayarlari as Record<string, unknown>;
          for (const a of LISTE_ALANLARI) {
            if (!(a.ad in la)) continue;
            const v = typeof la[a.ad] === 'string' ? (la[a.ad] as string).trim() : la[a.ad];
            if (v === null || v === '') { delete ham[a.ad]; continue; }
            if (listeAlaniDenetle(a, v) !== null) {
              return json(res, 400, { hata: METINLER.p_la_hatali[hangiDil()].replace('{alan}', METINLER[`p_la_${a.ad}`]?.[hangiDil()] ?? a.ad) });
            }
            ham[a.ad] = v;
          }
        }
        const gecici = `${dosya}.${process.pid}.tmp`;
        writeFileSync(gecici, JSON.stringify(ham, null, 2) + '\n');
        try {
          listeOku(gecici); // gecersizse hata; asil dosyaya dokunulmaz
        } catch (e) {
          try { writeFileSync(gecici, ''); } catch { /* yok */ }
          return json(res, 400, { hata: e instanceof Error ? e.message : String(e) });
        }
        renameSync(gecici, dosya);
        return json(res, 200, { tamam: true, uyarilar: listeDenetimi(kok, ham.isler as Record<string, string>[], { ...(typeof ham.ajan === 'string' ? { ajan: ham.ajan as string } : {}) }) });
      }
      if (yol === 'POST /api/sur') {
        if (surucu && !surucu.bitti) return json(res, 409, { hata: METINLER.p_zaten_calisiyor[hangiDil()] });
        if (!existsSync(join(kok, 'mihenk-isler.json'))) return json(res, 400, { hata: METINLER.p_liste_yok[hangiDil()] });
        const cocuk = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'sur', '--hedef', kok], { cwd: kok, windowsHide: true });
        const s = { cocuk, satirlar: [] as string[], bitti: false, cikis: null as number | null };
        const ekle = (p: Buffer): void => { s.satirlar.push(...p.toString('utf8').split(/\r?\n/).filter(Boolean)); if (s.satirlar.length > 2000) s.satirlar.splice(0, s.satirlar.length - 2000); };
        cocuk.stdout?.on('data', ekle);
        cocuk.stderr?.on('data', ekle);
        cocuk.on('exit', (k) => { s.bitti = true; s.cikis = k; });
        surucu = s;
        return json(res, 200, { basladi: true });
      }
      if (yol === 'POST /api/dosya-ac') {
        const g = await govde(req);
        const goreli = ayarDosyasi(ayarTanimi(String(g.ayar)).ad);
        const tam = join(kok, goreli);
        const acilan = existsSync(tam) ? tam : kok; // dosya henuz yoksa (ayar varsayilanda) proje klasoru acilir
        (o.dosyaAcici ?? isletimSistemiyleAc)(acilan);
        return json(res, 200, { acilan: acilan === kok ? '.' : goreli });
      }
      if (yol === 'GET /api/liste-durum') return json(res, 200, listeDurumu(kok, listeCalisiyor()));
      if (yol === 'POST /api/fikir') {
        // Fikri islere bol (Asama 32): uzun surer; arka planda calisir, sayfa GET /api/fikir ile sorar.
        const g = await govde(req);
        if (fikirIsi?.calisiyor) return json(res, 409, { hata: METINLER.fk_calisiyor[hangiDil()] });
        const ajanlar = o.ajanlar ?? AJANLAR;
        const kurulu = Object.keys(ajanlar).filter((a) => ajanlar[a]!.komutBul() != null);
        let listeAjani = '';
        try { listeAjani = listeOku(join(kok, 'mihenk-isler.json')).ajan ?? ''; } catch { /* liste yok */ }
        const ad = [String(g.ajan ?? ''), listeAjani].find((a) => a && kurulu.includes(a)) ?? TERCIH_SIRASI.find((a) => kurulu.includes(a)) ?? kurulu[0];
        if (!ad) return json(res, 400, { hata: METINLER.fk_arac_yok[hangiDil()] });
        const is = { calisiyor: true, ajan: ad, sonuc: null as Awaited<ReturnType<typeof fikriBol>> | null };
        fikirIsi = is;
        mkdirSync(join(kok, '.mihenk', 'ciktilar'), { recursive: true });
        void fikriBol({
          kok, fikir: String(g.fikir ?? ''), tanim: ajanlar[ad]!,
          kosucu: (ta, istem, cwd) => ajaniKostur(ta, istem, { cwd, zamanAsimiMs: 15 * 60_000, baglamEsigi: 10_000_000, ciktiDosyasi: join(kok, '.mihenk', 'ciktilar', 'planlama.txt') }),
        }).then((s) => { is.sonuc = s; }, (e: unknown) => { is.sonuc = { tamam: false, neden: e instanceof Error ? e.message : String(e) }; }).finally(() => { is.calisiyor = false; });
        return json(res, 200, { basladi: true, ajan: ad });
      }
      if (yol === 'GET /api/fikir') return json(res, 200, fikirIsi ? { calisiyor: fikirIsi.calisiyor, ajan: fikirIsi.ajan, ...(fikirIsi.sonuc ?? {}) } : { calisiyor: false });
      if (yol === 'GET /api/sur') return json(res, 200, surucu ? { calisiyor: !surucu.bitti, cikis: surucu.cikis, satirlar: surucu.satirlar } : { calisiyor: false, cikis: null, satirlar: [] });
      if (yol === 'POST /api/sur/durdur') {
        if (surucu && !surucu.bitti) agaciOldur(surucu.cocuk);
        return json(res, 200, { durduruldu: true });
      }
      return json(res, 404, { hata: 'yok' });
    } catch (e) {
      return json(res, 400, { hata: e instanceof Error ? e.message : String(e) });
    }
  });

  // Port cakismasi: istenen port doluysa sonraki 20 port, o da olmazsa isletim sisteminin verdigi bos port.
  const adaylar = o.port === undefined || o.port === 0 ? [0] : [...Array.from({ length: 21 }, (_, i) => o.port! + i), 0];
  const dene = (i: number, ok: () => void, red: (e: Error) => void): void => {
    const hata = (e: NodeJS.ErrnoException): void => {
      sunucu.off('listening', dinliyor);
      if (e.code === 'EADDRINUSE' && i + 1 < adaylar.length) dene(i + 1, ok, red);
      else red(e);
    };
    const dinliyor = (): void => { sunucu.off('error', hata); ok(); };
    sunucu.once('error', hata);
    sunucu.once('listening', dinliyor);
    sunucu.listen(adaylar[i], '127.0.0.1');
  };
  return new Promise((ok, red) => {
    dene(0, () => {
      const adres = sunucu.address();
      port = typeof adres === 'object' && adres ? adres.port : 0;
      if (o.otomatikKapan) {
        const { sureMs, denetimMs = 10_000 } = o.otomatikKapan;
        zamanlayici = setInterval(() => {
          if (!kapanmaliMi({ sonNabiz, simdi: Date.now(), sureMs, listeCalisiyor: listeCalisiyor() })) return;
          clearInterval(zamanlayici);
          sunucu.close(() => o.kapaninca?.());
          sunucu.closeAllConnections?.();
        }, denetimMs);
        zamanlayici.unref();
      }
      ok({
        url: `http://127.0.0.1:${port}/?anahtar=${anahtar}`, anahtar, port,
        kapat: () => new Promise((k) => {
          clearInterval(zamanlayici);
          if (surucu && !surucu.bitti) agaciOldur(surucu.cocuk);
          sunucu.close(() => k());
          sunucu.closeAllConnections?.();
        }),
      });
    }, red);
  });
}
