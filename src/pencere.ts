// Uygulama penceresi (Asama 16): kodlama bilmeyen kullanici icin tek pencere, sekmeli. Kurulum yok, yonetici izni yok: yerel bir
// sunucu yalniz 127.0.0.1'e baglanir ve sayfayi tarayicida gosterir. Her acilista rastgele bir anahtar uretilir; API istekleri bu
// anahtari ve dogru Host basligini tasimazsa reddedilir (baska bir web sitesi bu sunucuyu kullanamaz).
// Pencere, komut satirinin kullandigi islevlerin aynisini cagirir (ayarDegistir, kur, kaldir, geriAl, raporHtml, oneriHesapla):
// CLI ile pencere ayrismaz. Eslesme PENCERE_ESLEME'dedir ve test/pencere.test.ts her CLI komutunun karsiligini denetler.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYARLAR, ayarlariOku, ayarTanimi, degerCoz, type AyarDegeri } from './ayar.js';
import { ayarDegistir, baglamYuku } from './ayar-cli.js';
import { Defter } from './defter.js';
import { dilAyarla, hangiDil, METINLER, sec, sistemDili } from './dil.js';
import { agaciOldur } from './dogrulama.js';
import { geriAl, geriAlinanIsler } from './geri.js';
import { kaldir } from './kaldir.js';
import { kur } from './kur.js';
import { oneriHesapla, oneriMetni } from './oneri.js';
import { raporHtml } from './rapor.js';
import { listeOku } from './surucu.js';
import { AJANLAR } from './ajanlar.js';
import { PENCERE_SAYFASI } from './pencere-sayfa.js';
import { doktor, hataPaketi } from './doktor.js';
import { listeDenetimi } from './liste-denetim.js';
import { elOturumlariniTopla } from './el-oturumu.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

/** Pencerenin varsayilan portu; doluysa sonraki 20 port, o da olmazsa isletim sisteminin verdigi bos port denenir. */
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
};

function dilKur(kok: string): void {
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
    dil: hangiDil(), metinler: pencereMetinleri(),
    proje: { kok, ad: basename(kok), kurulu: existsSync(join(kok, '.mihenk', 'kurulum.json')), liste_var: existsSync(join(kok, 'mihenk-isler.json')) },
    ozet, baglam: baglamYuku(kok),
    ayarlar: AYARLAR.map((t) => ({
      ad: t.ad, baslik: sec(t.baslik), deger: a[t.ad], varsayilan: t.varsayilan, secenekler: t.secenekler ?? null, sayi: t.sayi ?? null, etki: t.etki,
      secenek_adlari: t.secenek_adlari ? Object.fromEntries(Object.entries(t.secenek_adlari).map(([k, v]) => [k, sec(v)])) : null,
      aciklama: sec(t.aciklama), amac: sec(t.amac), sonuc: sec(t.sonuc), varsayilan_aciklama: sec(t.varsayilan_aciklama),
    })),
  };
}

export interface PencereSunucusu {
  url: string;
  anahtar: string;
  port: number;
  kapat(): Promise<void>;
}

/** Sunucuyu baslatir (port 0: bos bir port). Yalniz 127.0.0.1'e baglanir. */
export function pencereAc(hedef: string, o: { port?: number; dosyaAcici?: (yol: string) => void } = {}): Promise<PencereSunucusu> {
  const kok = resolve(hedef);
  const anahtar = randomBytes(24).toString('hex');
  let surucu: { cocuk: ChildProcess; satirlar: string[]; bitti: boolean; cikis: number | null } | null = null;
  let port = 0;

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
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(existsSync(join(kok, '.mihenk', 'defter.db')) ? raporHtml(kok).html : `<p>${METINLER.p_defter_bos[hangiDil()]}</p>`);
      }
      const yol = `${req.method} ${u.pathname}`;
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
          const turler = oneriHesapla(d.olcumler());
          return json(res, 200, { metin: oneriMetni(turler), turler, kullanim: d.rapor({}).kullanim });
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
        const listeIsleri = liste.map((x) => ({ soru: alan(x, 'soru'), beklenti: alan(x, 'beklenti'), yanlissa: alan(x, 'yanlissa'), dogrulama_komutu: alan(x, 'dogrulama_komutu'), ...(alan(x, 'ajan') ? { ajan: alan(x, 'ajan') } : {}) }));
        return json(res, 200, {
          var: existsSync(dosya), bozuk, ajan: typeof ham.ajan === 'string' ? ham.ajan : '', araclar,
          uyarilar: existsSync(dosya) ? listeDenetimi(kok, listeIsleri, { ...(typeof ham.ajan === 'string' ? { ajan: ham.ajan } : {}) }) : [],
          isler: liste.map((x) => ({ tur: alan(x, 'tur'), soru: alan(x, 'soru'), beklenti: alan(x, 'beklenti'), yanlissa: alan(x, 'yanlissa'), dogrulama_komutu: alan(x, 'dogrulama_komutu') })),
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
          tur: temiz(x.tur) || 'hata_duzeltme', soru: temiz(x.soru), beklenti: temiz(x.beklenti), yanlissa: temiz(x.yanlissa), dogrulama_komutu: temiz(x.dogrulama_komutu),
        }));
        const ALANLAR = [['soru', 'p_alan_soru'], ['beklenti', 'p_alan_beklenti'], ['yanlissa', 'p_alan_yanlissa'], ['dogrulama_komutu', 'p_alan_komut']] as const;
        for (const [n, x] of (ham.isler as Record<string, string>[]).entries()) {
          for (const [a, k] of ALANLAR) {
            if (!x[a]) return json(res, 400, { hata: METINLER.p_alan_bos[hangiDil()].replace('{n}', String(n + 1)).replace('{alan}', METINLER[k][hangiDil()]) });
          }
        }
        if (typeof g.ajan === 'string' && g.ajan !== '') ham.ajan = g.ajan;
        else delete ham.ajan;
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
      ok({
        url: `http://127.0.0.1:${port}/?anahtar=${anahtar}`, anahtar, port,
        kapat: () => new Promise((k) => {
          if (surucu && !surucu.bitti) agaciOldur(surucu.cocuk);
          sunucu.close(() => k());
          sunucu.closeAllConnections?.();
        }),
      });
    }, red);
  });
}
