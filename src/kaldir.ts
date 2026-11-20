// Temiz kaldirma: mihenk kur'un bu projeye yaptigi her seyi geri alir, kullanicinin kendi dosya ve degisikliklerine dokunmaz.
// Kurulum kaydi (.mihenk/kurulum.json) her dosyanin kurulumdan onceki halini (yedek) ve kurulumun yazdigi icerigin ozetini tutar:
//   - dosya hala kurulumun yazdigi gibiyse: once yoksa silinir, varsa yedekten bayt bayt geri yuklenir;
//   - kullanici kurulumdan sonra degistirdiyse: yalniz mihenk'in parcasi (isaretli blok, mihenk anahtari, kapi kancasi) cikarilir.
// Defter (.mihenk/) kullanicinin is kaydidir: varsayilan olarak proje disina (yerel uygulama verisi) tasinir, proje temiz kalir.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export interface DosyaKaydi {
  once_vardi: boolean;
  /** Yedek kurulum oncesi hali tasiyor mu (kullanici arada degistirdiyse gecersiz). */
  yedek: boolean;
  /** Kurulumun son yazdigi icerigin sha256 ozeti. */
  ozet: string;
}

export interface KurulumKaydi {
  surum: 1;
  dosyalar: Record<string, DosyaKaydi>;
  /** Kurulumun olusturdugu dizinler (bossa silinir). */
  dizinler: string[];
}

export const ozet = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const kayitYolu = (kok: string): string => join(kok, '.mihenk', 'kurulum.json');
const yedekYolu = (kok: string, goreli: string): string => join(kok, '.mihenk', 'kurulum-yedek', goreli);

export function kayitOku(kok: string): KurulumKaydi {
  try {
    return JSON.parse(readFileSync(kayitYolu(kok), 'utf8')) as KurulumKaydi;
  } catch {
    return { surum: 1, dosyalar: {}, dizinler: [] };
  }
}

export function kayitYaz(kok: string, k: KurulumKaydi): void {
  mkdirSync(join(kok, '.mihenk'), { recursive: true });
  writeFileSync(kayitYolu(kok), JSON.stringify(k, null, 2) + '\n');
}

export function yedekYaz(kok: string, goreli: string, icerik: Buffer): void {
  const y = yedekYolu(kok, goreli);
  mkdirSync(dirname(y), { recursive: true });
  writeFileSync(y, icerik);
}

// ---- cerrahi cikarma: kullanicinin degistirdigi dosyada yalniz mihenk'in parcasi ----

function blokCikar(metin: string, bas: string, son: string): string {
  const i = metin.indexOf(bas);
  const j = metin.indexOf(son, i);
  if (i < 0 || j < 0) return metin;
  const once = metin.slice(0, i).replace(/\n{2,}$/, '\n');
  return once + metin.slice(j + son.length).replace(/^\r?\n/, '');
}

function bosKaplariBuda(n: any, yol: string[]): void {
  // yol uzerindeki bos nesne / dizileri en derinden baslayarak siler.
  for (let d = yol.length - 1; d >= 0; d--) {
    let ust: any = n;
    for (const p of yol.slice(0, d)) ust = ust?.[p];
    const deger = ust?.[yol[d]!];
    if (deger && typeof deger === 'object' && Object.keys(deger).length === 0) delete ust[yol[d]!];
  }
}

function jsonCikar(goreli: string, metin: string): string {
  let n: any;
  try {
    n = JSON.parse(metin);
  } catch {
    return metin; // gecersiz JSON'a dokunulmaz
  }
  const eski = JSON.stringify(n);
  if (n?.mcpServers?.mihenk) { delete n.mcpServers.mihenk; bosKaplariBuda(n, ['mcpServers']); }
  if (n?.mcp?.servers?.mihenk) { delete n.mcp.servers.mihenk; bosKaplariBuda(n, ['mcp', 'servers']); }
  if (n?.hooks && typeof n.hooks === 'object') {
    for (const olay of Object.keys(n.hooks)) {
      if (!Array.isArray(n.hooks[olay])) continue;
      n.hooks[olay] = n.hooks[olay].filter((g: unknown) => !JSON.stringify(g).includes('kapi-bin.js'));
      bosKaplariBuda(n, ['hooks', olay]);
    }
  }
  if (goreli === '.gemini/settings.json' && Array.isArray(n?.context?.fileName)) {
    n.context.fileName = n.context.fileName.filter((f: string) => f !== 'AGENTS.md');
    if (n.context.fileName.length === 1 && n.context.fileName[0] === 'GEMINI.md') delete n.context.fileName;
    bosKaplariBuda(n, ['context', 'fileName']);
  }
  if (goreli === '.agents/plugins/mihenk/plugin.json' && n?.name === 'mihenk') delete n.name;
  // Icinde mihenk parcasi olmayan dosya yeniden bicimlenmez.
  return JSON.stringify(n) === eski ? metin : JSON.stringify(n, null, 2) + '\n';
}

/** Dosyadan yalniz mihenk'in ekledigini cikarir; bilinmeyen dosya turunde null (dokunulmaz). */
export function cerrahiCikar(goreli: string, metin: string): string | null {
  if (goreli === 'AGENTS.md') return blokCikar(metin, '<!-- mihenk:basla -->', '<!-- mihenk:bitti -->');
  if (goreli === '.codex/config.toml') return blokCikar(metin, '# mihenk:basla (mihenk kur yazar)', '# mihenk:bitti');
  if (goreli === 'CLAUDE.md') {
    const i = metin.lastIndexOf('@AGENTS.md');
    return i < 0 ? metin : (metin.slice(0, i).replace(/\n{2,}$/, '\n') + metin.slice(i + '@AGENTS.md'.length).replace(/^\r?\n/, ''));
  }
  if (goreli === '.gitignore') return metin.replace(/^\.mihenk\/?[ \t]*\r?\n?/m, '');
  if (goreli.endsWith('.json')) return jsonCikar(goreli, metin);
  return null;
}

const bosMu = (metin: string): boolean => metin.trim() === '' || metin.trim() === '{}';

// ---- kaldirma ----

export interface KaldirSecenekleri {
  /** Defteri de sil (varsayilan: proje disina tasi). */
  defterDahil?: boolean;
  /** Defterin tasinacagi ust dizin; varsayilan %LOCALAPPDATA%\mihenk\kaldirilan (yoksa ~/.mihenk-kaldirilan). */
  arsivDizini?: string;
  /** Cift tiklanan mihenk-kaldir.cmd'den calisiyor: o dosyayi cmd kendisi en sonda siler. */
  cmdDen?: boolean;
}

export interface KaldirSonucu {
  silinen: string[];
  geri_yuklenen: string[];
  /** Kullanicinin degisikligi korunarak yalniz mihenk'in parcasi cikarilan dosyalar. */
  ayiklanan: string[];
  /** Dokunulmadan birakilan dosyalar ve nedeni. */
  birakilan: string[];
  defter: string;
}

function varsayilanArsiv(): string {
  return process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'mihenk', 'kaldirilan') : join(homedir(), '.mihenk-kaldirilan');
}

/** Kurulum kaydi olmayan eski kurulumlar icin: kurulumun bilinen dosyalari. */
const BILINEN_OLUSTURULANLAR = ['mihenk-baslat.cmd', 'mihenk-kaldir.cmd', 'mihenk-isler.ornek.json'];
const BILINEN_DUZENLENENLER = ['AGENTS.md', 'CLAUDE.md', '.gitignore', '.mcp.json', '.codex/config.toml', '.codex/hooks.json',
  '.claude/settings.json', '.gemini/settings.json', 'opencode.json', '.agents/plugins/mihenk/plugin.json', '.agents/plugins/mihenk/mcp_config.json'];

export function kaldir(hedefDizin: string, secenek: KaldirSecenekleri = {}): KaldirSonucu {
  const kok = resolve(hedefDizin);
  const sonuc: KaldirSonucu = { silinen: [], geri_yuklenen: [], ayiklanan: [], birakilan: [], defter: '' };
  const kayitVar = existsSync(kayitYolu(kok));
  const kayit = kayitOku(kok);

  if (!kayitVar) {
    // Kayit yok: ya mihenk hic kurulmamis (ya da zaten kaldirilmis) ya da eski surumle kurulmus. Iz yoksa hicbir seye dokunulmaz.
    const iz = (g: string): boolean => existsSync(join(kok, g)) && /mihenk:basla|kapi-bin\.js|"mihenk"\s*:/.test(readFileSync(join(kok, g), 'utf8'));
    const izVar = BILINEN_DUZENLENENLER.some(iz) || BILINEN_OLUSTURULANLAR.some((g) => existsSync(join(kok, g)));
    if (!izVar) {
      sonuc.defter = existsSync(join(kok, '.mihenk')) ? 'defter yerinde (mihenk kurulu degil; dokunulmadi)' : 'defter yoktu';
      return sonuc;
    }
    // Eski surumun kurulumu: bilinen dosyalarda yalniz mihenk'in parcasi cikarilir; birebir geri donus garanti degildir.
    // CLAUDE.md'deki "@AGENTS.md" satirinin kullanicinin mi mihenk'in mi oldugu bilinemez: dokunulmaz.
    for (const g of BILINEN_OLUSTURULANLAR) kayit.dosyalar[g] = { once_vardi: false, yedek: false, ozet: '?' };
    for (const g of BILINEN_DUZENLENENLER.filter((x) => x !== 'CLAUDE.md')) kayit.dosyalar[g] = { once_vardi: true, yedek: false, ozet: '?' };
    sonuc.birakilan.push('(kurulum kaydi yok: eski surumle kurulmus; yalniz mihenk\'in bilinen parcalari cikarildi; CLAUDE.md\'ye dokunulmadi)');
  }

  for (const [g, k] of Object.entries(kayit.dosyalar).sort(([a], [b]) => b.localeCompare(a))) {
    const yol = join(kok, g);
    if (!existsSync(yol)) continue;
    const mevcut = readFileSync(yol);
    if (secenek.cmdDen && g === 'mihenk-kaldir.cmd') {
      sonuc.silinen.push(`${g} (pencere kapanirken)`);
      continue;
    }
    if (ozet(mevcut) === k.ozet) {
      // Kurulumun yazdigi gibi duruyor.
      if (!k.once_vardi) { unlinkSync(yol); sonuc.silinen.push(g); continue; }
      if (k.yedek && existsSync(yedekYolu(kok, g))) { writeFileSync(yol, readFileSync(yedekYolu(kok, g))); sonuc.geri_yuklenen.push(g); continue; }
    }
    if (!kayitVar && BILINEN_OLUSTURULANLAR.includes(g)) { unlinkSync(yol); sonuc.silinen.push(g); continue; }
    // Kullanici degistirmis (ya da yedek gecersiz): cerrahi.
    const yeni = cerrahiCikar(g, mevcut.toString('utf8'));
    if (yeni === null) {
      sonuc.birakilan.push(`${g} (kurulumdan sonra degistirilmis; mihenk'in parcasi ayiklanamiyor, dokunulmadi)`);
      continue;
    }
    if (!k.once_vardi && bosMu(yeni)) { unlinkSync(yol); sonuc.silinen.push(g); continue; }
    if (yeni !== mevcut.toString('utf8')) { writeFileSync(yol, yeni); sonuc.ayiklanan.push(g); }
  }

  // Kayitsiz kurulum: paketten gelen skill dizinleri, icerikleri paketle ayniysa.
  if (!kayitVar) {
    for (const ust of ['.claude/skills', '.agents/skills']) {
      if (!existsSync(join(kok, ust))) continue;
      for (const d of readdirSync(join(kok, ust))) {
        if (d.startsWith('mihenk-')) { rmSync(join(kok, ust, d), { recursive: true, force: true }); sonuc.silinen.push(`${ust}/${d}/`); }
      }
    }
    kayit.dizinler.push('.agents/plugins/mihenk', '.agents/plugins', '.claude/skills', '.agents/skills', '.agents', '.claude', '.codex', '.gemini');
  }

  // Kurulumun olusturdugu ve artik bos olan dizinler (en derinden).
  for (const d of [...kayit.dizinler].sort((a, b) => b.split('/').length - a.split('/').length || b.localeCompare(a))) {
    const yol = join(kok, d);
    try {
      if (existsSync(yol) && readdirSync(yol).length === 0) rmdirSync(yol);
    } catch {
      // bos degil ya da kilitli: birakilir
    }
  }

  // Defter.
  const mihenkDizini = join(kok, '.mihenk');
  if (existsSync(mihenkDizini)) {
    rmSync(join(mihenkDizini, 'kurulum-yedek'), { recursive: true, force: true });
    rmSync(kayitYolu(kok), { force: true });
    const kalan = readdirSync(mihenkDizini);
    if (kalan.length === 0) {
      rmdirSync(mihenkDizini);
      sonuc.defter = 'defter yoktu';
    } else if (secenek.defterDahil) {
      rmSync(mihenkDizini, { recursive: true, force: true });
      sonuc.defter = 'defter silindi';
    } else {
      const zaman = new Date().toISOString().replace(/[:.]/g, '-');
      const arsiv = join(secenek.arsivDizini ?? varsayilanArsiv(), `${basename(kok)}-${zaman}`);
      mkdirSync(dirname(arsiv), { recursive: true });
      cpSync(mihenkDizini, arsiv, { recursive: true });
      rmSync(mihenkDizini, { recursive: true, force: true });
      sonuc.defter = `defter proje disina tasindi: ${arsiv}`;
    }
  } else {
    sonuc.defter = 'defter yoktu';
  }
  return sonuc;
}
