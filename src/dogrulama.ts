// Dogrulama komutunu SUNUCU kosar (Ilke 1: kaniti ajan beyan etmez).
// Guvenlik varsayilani (IS_PLANI "Acik kararlar" 3): kabuk yok, program izin listesinden, calisma dizini proje koku, zaman asimi var.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { Ret } from './hata.js';

/** Varsayilan izin listesi: test kosuculari ve derleme araclari. Indirip calistiranlar (npx, curl...) ve kabuklar bilerek yok. */
export const VARSAYILAN_IZINLI: readonly string[] = [
  'node', 'npm', 'pnpm', 'yarn', 'tsc',
  'python', 'python3', 'py', 'pytest',
  'cargo', 'go', 'dotnet', 'make', 'git',
];

export interface CozulmusKomut {
  program: string;
  argumanlar: string[];
}

const KABUK_KARAKTERLERI = /[&|;<>`$()^%!'\r\n]/;
const PROGRAM_ADI = /^[A-Za-z0-9_.+-]+$/;

/** Komut metnini kabuk kullanmadan program + argumanlara ayirir; kural disi olani reddeder. */
export function komutuCoz(komut: string, izinli: readonly string[]): CozulmusKomut {
  if (typeof komut !== 'string' || komut.trim() === '') {
    throw new Ret('EKSIK_ALAN', 'dogrulama_komutu bos olamaz: her isin kosulabilir bir dogrulamasi olur.');
  }
  const yasak = KABUK_KARAKTERLERI.exec(komut.trim());
  if (yasak) {
    throw new Ret(
      'KABUK_KARAKTERI',
      `dogrulama_komutu kabuk karakteri iceremez (${JSON.stringify(yasak[0])}). Tek bir program ve argumanlari yazilir; ` +
        'zincirleme, boru, yonlendirme gerekiyorsa bunlari bir betige ya da npm script tanimina koyup onu cagirin. Tirnak icin yalniz cift tirnak.',
    );
  }
  const parcalar: string[] = [];
  let simdiki = '';
  let tirnakta = false;
  let parcaVar = false;
  for (const c of komut.trim()) {
    if (c === '"') {
      tirnakta = !tirnakta;
      parcaVar = true;
    } else if (!tirnakta && /\s/.test(c)) {
      if (parcaVar) parcalar.push(simdiki);
      simdiki = '';
      parcaVar = false;
    } else {
      simdiki += c;
      parcaVar = true;
    }
  }
  if (tirnakta) throw new Ret('KABUK_KARAKTERI', 'dogrulama_komutu: kapanmamis cift tirnak.');
  if (parcaVar) parcalar.push(simdiki);

  const program = parcalar[0] ?? '';
  const ad = program.toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
  if (!PROGRAM_ADI.test(program) || !izinli.map((p) => p.toLowerCase()).includes(ad)) {
    throw new Ret(
      'KOMUT_IZINSIZ',
      `dogrulama_komutu programi izin listesinde degil: ${JSON.stringify(program)}. Izinli programlar: ${izinli.join(', ')}. ` +
        'Program yol ile degil ciplak adiyla yazilir. Liste proje kokundeki mihenk.json ("izinli_programlar") ile degisir; onu kullanici duzenler.',
    );
  }
  return { program, argumanlar: parcalar.slice(1) };
}

export interface KosuSecenekleri {
  cwd: string;
  zamanAsimiMs: number;
  ciktiDosyasi: string;
  /** Dosyaya yazilacak en fazla bayt (disk korumasi). Varsayilan 5 MB. */
  enFazlaBayt?: number;
}

export interface KosuSonucu {
  cikis_kodu: number | null;
  zaman_asimi: boolean;
  sure_ms: number;
  cikti_bayt: number;
  cikti_kesildi: boolean;
  cikti_dosyasi: string;
  baslatma_hatasi?: string;
}

/** Tek olcut: cikis kodu 0, zaman asimi yok, surec gercekten baslamis. */
export function gectiMi(s: KosuSonucu): boolean {
  return s.cikis_kodu === 0 && !s.zaman_asimi && !s.baslatma_hatasi;
}

function winProgramBul(program: string): string | null {
  const yollar = (process.env.PATH ?? '').split(';').filter(Boolean);
  const uzantilar = extname(program) ? [''] : (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';');
  for (const d of yollar) {
    for (const u of uzantilar) {
      const aday = join(d, program + u);
      if (existsSync(aday)) return aday;
    }
  }
  return null;
}

function winTirnakla(parca: string): string {
  // komutuCoz cift tirnak ve kabuk karakterlerini zaten eledi; geriye yalniz sondaki ters bolu inceligi kalir.
  const son = /\\+$/.exec(parca);
  return `"${parca}${son ? son[0] : ''}"`;
}

function baslat(k: CozulmusKomut, cwd: string): ChildProcess {
  const ortak = { cwd, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], windowsHide: true };
  if (process.platform !== 'win32') {
    return spawn(k.program, k.argumanlar, { ...ortak, detached: true });
  }
  const tam = winProgramBul(k.program);
  if (!tam) throw new Error(`program bulunamadi: ${k.program}`);
  if (/\.(cmd|bat)$/i.test(tam)) {
    // .cmd/.bat dosyalari Windows'ta ancak cmd.exe ile kosar. Girdi kabuk karakterlerinden arindigi icin satir sabittir.
    const satir = [tam, ...k.argumanlar].map(winTirnakla).join(' ');
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${satir}"`], { ...ortak, windowsVerbatimArguments: true });
  }
  return spawn(tam, k.argumanlar, ortak);
}

function agaciOldur(cocuk: ChildProcess): void {
  if (cocuk.pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(cocuk.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-cocuk.pid, 'SIGKILL');
    }
  } catch {
    cocuk.kill('SIGKILL');
  }
}

export function komutuCalistir(k: CozulmusKomut, s: KosuSecenekleri): Promise<KosuSonucu> {
  const enFazla = s.enFazlaBayt ?? 5 * 1024 * 1024;
  const t0 = Date.now();
  mkdirSync(dirname(s.ciktiDosyasi), { recursive: true });
  const fd = openSync(s.ciktiDosyasi, 'w');
  let bayt = 0;
  let yazilan = 0;
  let kesildi = false;

  const yaz = (parca: Buffer): void => {
    bayt += parca.length;
    if (yazilan >= enFazla) {
      kesildi = true;
      return;
    }
    const pay = parca.length <= enFazla - yazilan ? parca : parca.subarray(0, enFazla - yazilan);
    if (pay.length < parca.length) kesildi = true;
    writeSync(fd, pay);
    yazilan += pay.length;
  };

  return new Promise<KosuSonucu>((coz) => {
    let bitti = false;
    let zamanAsimi = false;
    let zamanlayici: NodeJS.Timeout | undefined;
    let emniyet: NodeJS.Timeout | undefined;

    const bitir = (cikis: number | null, baslatmaHatasi?: string): void => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayici);
      clearTimeout(emniyet);
      if (kesildi) writeSync(fd, `\n[mihenk: cikti ${enFazla} baytta kesildi; toplam ${bayt} bayt]\n`);
      closeSync(fd);
      coz({
        cikis_kodu: cikis,
        zaman_asimi: zamanAsimi,
        sure_ms: Date.now() - t0,
        cikti_bayt: bayt,
        cikti_kesildi: kesildi,
        cikti_dosyasi: s.ciktiDosyasi,
        ...(baslatmaHatasi ? { baslatma_hatasi: baslatmaHatasi } : {}),
      });
    };

    let cocuk: ChildProcess;
    try {
      cocuk = baslat(k, s.cwd);
    } catch (e) {
      bitir(null, e instanceof Error ? e.message : String(e));
      return;
    }
    cocuk.stdout?.on('data', yaz);
    cocuk.stderr?.on('data', yaz);
    cocuk.on('error', (e) => bitir(null, e.message));
    cocuk.on('close', (kod) => bitir(kod));

    zamanlayici = setTimeout(() => {
      zamanAsimi = true;
      agaciOldur(cocuk);
      // Torun surecler boruyu acik tutarsa 'close' gelmeyebilir: is burada asili kalmaz.
      emniyet = setTimeout(() => {
        cocuk.stdout?.destroy();
        cocuk.stderr?.destroy();
        bitir(null);
      }, 3000);
    }, s.zamanAsimiMs);
  });
}
