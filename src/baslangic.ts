// Baslangic ekrani (Asama 31): pencere proje secilmeden acilir; kullanici son projelerden birini, Windows'un klasor secicisini ya da
// yeni bir proje klasorunu secer. Komut satiri ve dosya duzenleme gerekmez; yonetici izni gerekmez.
// Son projeler kullanicinin kendi uygulama verisinde tutulur (%LOCALAPPDATA%\mihenk): mihenk'in kendi dosyasidir, hicbir aracin kuresel
// ayarina dokunulmaz. Testler MIHENK_VERI_DIZINI ile baska bir klasor verir.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BURASI = dirname(fileURLToPath(import.meta.url)); // dist/src (pakette app/dist/src)
const EN_COK_PROJE = 10;

export function veriDizini(): string {
  return process.env.MIHENK_VERI_DIZINI ?? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'mihenk');
}

export interface SonProje {
  kok: string;
  ad: string;
  zaman: string;
  kurulu: boolean;
}

const dosya = (): string => join(veriDizini(), 'son-projeler.json');

function oku(): Array<{ kok: string; zaman: string }> {
  try {
    const d = JSON.parse(readFileSync(dosya(), 'utf8')) as unknown;
    return Array.isArray(d) ? d.filter((x): x is { kok: string; zaman: string } => !!x && typeof x.kok === 'string' && typeof x.zaman === 'string') : [];
  } catch {
    return [];
  }
}

function yaz(l: Array<{ kok: string; zaman: string }>): void {
  mkdirSync(veriDizini(), { recursive: true });
  writeFileSync(dosya(), JSON.stringify(l.slice(0, EN_COK_PROJE), null, 2) + '\n');
}

/** Son acilan projeler, yeniden eskiye; silinmis klasorler gosterilmez. */
export function sonProjeler(): SonProje[] {
  return oku().filter((x) => existsSync(x.kok)).map((x) => ({
    kok: x.kok, ad: basename(x.kok), zaman: x.zaman, kurulu: existsSync(join(x.kok, '.mihenk', 'kurulum.json')),
  }));
}

export function sonProjeEkle(kok: string, zaman = new Date()): void {
  const k = resolve(kok);
  yaz([{ kok: k, zaman: zaman.toISOString() }, ...oku().filter((x) => resolve(x.kok).toLowerCase() !== k.toLowerCase())]);
}

export function sonProjeCikar(kok: string): void {
  const k = resolve(kok).toLowerCase();
  yaz(oku().filter((x) => resolve(x.kok).toLowerCase() !== k));
}

/**
 * Proje klasoru olarak kullanilabilir mi? Kurulum klasore dosya yazdigi icin surucu koku, kullanici klasorunun kendisi ve Windows /
 * Program Files klasorleri reddedilir. Hata varsa nedenin katalog anahtari doner.
 */
export function projeUygunMu(kok: string): { tamam: true; kok: string } | { tamam: false; neden: 'yok' | 'klasor_degil' | 'sistem' } {
  const k = resolve(kok);
  if (!existsSync(k)) return { tamam: false, neden: 'yok' };
  if (!statSync(k).isDirectory()) return { tamam: false, neden: 'klasor_degil' };
  const kucuk = k.toLowerCase().replace(/[\\/]+$/, '');
  const sistem = [homedir(), process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData, process.env.LOCALAPPDATA, process.env.APPDATA]
    .filter((x): x is string => !!x).map((x) => resolve(x).toLowerCase());
  const sistemAlti = [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((x): x is string => !!x).map((x) => resolve(x).toLowerCase());
  if (parse(k).root.toLowerCase().replace(/[\\/]+$/, '') === kucuk || sistem.includes(kucuk) || sistemAlti.some((s) => kucuk.startsWith(s + '\\'))) {
    return { tamam: false, neden: 'sistem' };
  }
  return { tamam: true, kok: k };
}

/** Yeni projelerin varsayilan yeri: Belgeler\mihenk-projeleri (Belgeler yoksa kullanici klasoru). */
export function projelerKoku(): string {
  const belgeler = join(homedir(), 'Documents');
  return join(existsSync(belgeler) ? belgeler : homedir(), 'mihenk-projeleri');
}

/** Yeni proje klasoru: ad harf, rakam, bosluk, tire ve alt cizgiden olusur; varsa ayni klasor kullanilir. */
export function yeniProjeKlasoru(ad: string, kok = projelerKoku()): { tamam: true; kok: string } | { tamam: false } {
  const temiz = ad.trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,59}$/u.test(temiz)) return { tamam: false };
  const yol = join(kok, temiz);
  mkdirSync(yol, { recursive: true });
  return { tamam: true, kok: yol };
}

function powershell(betik: string, env: Record<string, string>): Promise<{ kod: number | null; cikti: string }> {
  return new Promise((ok) => {
    const c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', betik], {
      env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    let s = '';
    c.stdout.on('data', (p: Buffer) => (s += p.toString('utf8')));
    c.on('error', () => ok({ kod: null, cikti: '' }));
    c.on('exit', (kod) => ok({ kod, cikti: s.trim() }));
  });
}

/**
 * Windows'un kendi klasor secicisi (yonetici izni istemez). Pencere tarayicinin onune gelsin diye en ustte duran bir sahibi vardir.
 * Vazgecilirse null. Metinler ortam degiskeniyle gecer (betige elle yazilmaz).
 */
export async function klasorSec(aciklama: string): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const betik = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$f = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; WindowState = "Minimized" }',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$d.Description = $env:MIHENK_ACIKLAMA; $d.ShowNewFolderButton = $true',
    'if ($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }',
  ].join('; ');
  const r = await powershell(betik, { MIHENK_ACIKLAMA: aciklama });
  return r.kod === 0 && r.cikti ? r.cikti : null;
}

/** Paketteki tek giris dosyasi (Mihenk-Ac.cmd); depodan calisirken yok. */
export function girisDosyasi(): string | null {
  const p = resolve(BURASI, '..', '..', '..', 'Mihenk-Ac.cmd');
  return existsSync(p) ? p : null;
}

/** Masaustune "mihenk" kisayolu (kullanici dugmeye basinca). Hedef paketteki Mihenk-Ac.cmd; yoksa node ile "mihenk ac". */
export async function kisayolKoy(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const giris = girisDosyasi();
  const env = giris
    ? { MIHENK_HEDEF: giris, MIHENK_ARG: '', MIHENK_DIZIN: dirname(giris) }
    : { MIHENK_HEDEF: process.execPath, MIHENK_ARG: `--disable-warning=ExperimentalWarning "${join(BURASI, 'cli.js')}" ac`, MIHENK_DIZIN: homedir() };
  const betik = [
    '$m = [Environment]::GetFolderPath("Desktop")',
    '$y = Join-Path $m "mihenk.lnk"',
    '$k = (New-Object -ComObject WScript.Shell).CreateShortcut($y)',
    '$k.TargetPath = $env:MIHENK_HEDEF; $k.Arguments = $env:MIHENK_ARG; $k.WorkingDirectory = $env:MIHENK_DIZIN; $k.WindowStyle = 7',
    '$k.Save(); [Console]::Out.Write($y)',
  ].join('; ');
  const r = await powershell(betik, env);
  return r.kod === 0 && r.cikti ? r.cikti : null;
}

/**
 * Kendiliginden kapanma (Asama 31): sayfa acildiktan sonra nabiz `sureMs`ten uzun suredir gelmiyorsa ve liste calismiyorsa sunucu kapanir.
 * Sayfa hic acilmadiysa (sonNabiz 0) kapanmaz.
 */
export function kapanmaliMi(o: { sonNabiz: number; simdi: number; sureMs: number; listeCalisiyor: boolean }): boolean {
  return o.sonNabiz > 0 && !o.listeCalisiyor && o.simdi - o.sonNabiz > o.sureMs;
}
