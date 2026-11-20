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
import { geriAl } from './geri.js';
import { kaldir } from './kaldir.js';
import { kur } from './kur.js';
import { oneriHesapla, oneriMetni } from './oneri.js';
import { raporHtml } from './rapor.js';
import { listeOku } from './surucu.js';
import { PENCERE_SAYFASI } from './pencere-sayfa.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

/** Her CLI yonetim komutunun penceredeki karsiligi (sekme ve API). uyum gelistirici aracidir, pencerede yok. */
export const PENCERE_ESLEME: Record<string, { sekme: string; api: string } | { yok: string }> = {
  kur: { sekme: 'proje', api: 'POST /api/kur' },
  kaldir: { sekme: 'proje', api: 'POST /api/kaldir' },
  sur: { sekme: 'liste', api: 'POST /api/sur' },
  ayar: { sekme: 'ayarlar', api: 'POST /api/ayar' },
  rapor: { sekme: 'defter', api: 'GET /rapor' },
  'geri-al': { sekme: 'defter', api: 'POST /api/geri-al' },
  oneri: { sekme: 'oneri', api: 'GET /api/oneri' },
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
  try {
    return (defter.rapor({ sinir: 100 }).isler ?? []).map((x) => {
      const is = defter.rapor({ is_id: x.id }).is!;
      return {
        id: is.id, tur: is.tur, soru: is.soru, durum: is.durum, ajan: is.ajan, sure_sn: is.sure_sn, deneme: is.deneme_sayisi,
        gerekce: is.gerekce, supheler: is.supheler, maliyet_usd: is.kullanim_toplami.maliyet_usd,
        geri_alinabilir: is.durum !== 'acik' && existsSync(join(kok, '.mihenk', 'geri', `is-${is.id}-son.json`)),
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
      ad: t.ad, deger: a[t.ad], varsayilan: t.varsayilan, secenekler: t.secenekler ?? null, sayi: t.sayi ?? null, etki: t.etki,
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
export function pencereAc(hedef: string, o: { port?: number } = {}): Promise<PencereSunucusu> {
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
        const g = await govde(req);
        return json(res, 200, geriAl(kok, Number(g.id), { deneme: g.deneme === true }));
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
        const dosya = join(kok, 'mihenk-isler.json');
        const ornek = join(kok, 'mihenk-isler.ornek.json');
        return json(res, 200, { var: existsSync(dosya), icerik: existsSync(dosya) ? readFileSync(dosya, 'utf8') : existsSync(ornek) ? readFileSync(ornek, 'utf8') : '{\n  "isler": []\n}\n' });
      }
      if (yol === 'POST /api/liste') {
        const g = await govde(req);
        const dosya = join(kok, 'mihenk-isler.json');
        const gecici = `${dosya}.${process.pid}.tmp`;
        writeFileSync(gecici, String(g.icerik ?? ''));
        try {
          listeOku(gecici); // gecersizse hata; asil dosyaya dokunulmaz
        } catch (e) {
          try { writeFileSync(gecici, ''); } catch { /* yok */ }
          return json(res, 400, { hata: e instanceof Error ? e.message : String(e) });
        }
        renameSync(gecici, dosya);
        return json(res, 200, { tamam: true });
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

  return new Promise((ok, red) => {
    sunucu.once('error', red);
    sunucu.listen(o.port ?? 0, '127.0.0.1', () => {
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
    });
  });
}
