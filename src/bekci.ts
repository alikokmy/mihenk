// Dogruluk bekcileri (Asama 10): test kurcalama ve bos kanit icin yardimcilar. Bekciler hukmu engellemez, "supheli" notu duser:
// yeni test eklemek ya da testi gercekten duzeltmek mesru olabilir; karar kullaniciya (ve oneri hesabina) gorunur kalir.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Test ya da beklenen cikti sayilan yollar (dil bagimsiz yaygin adlandirmalar). */
export const TEST_DOSYASI =
  /(^|\/)(tests?|__tests__|specs?|__snapshots__|fixtures?|testdata)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$|\.snap$/i;

/** Testi atlatan isaretler: JS (skip, xit, todo, { skip: true }), Python (pytest / unittest), Go, Rust. */
const ATLA = /\.skip\s*\(|\bx(it|describe|test)\s*\(|\.todo\s*\(|\bskip\s*:\s*true|@pytest\.mark\.(skip|xfail)|@unittest\.skip|\bt\.Skip(Now)?\(|#\[ignore\]/g;

const SINIR = 5000;

export interface TestDosyasi {
  ozet: string;
  /** Dosyadaki atlama isareti sayisi. */
  atla: number;
}

/** Projenin dosyalari (git deposunda git'in yok saydiklari haric; degilse nokta ile baslayanlar ve node_modules haric). */
export function projeDosyalari(kok: string): string[] {
  const git = spawnSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], { cwd: kok, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (git.status === 0 && typeof git.stdout === 'string') return git.stdout.split('\0').filter(Boolean);
  const sonuc: string[] = [];
  const yuru = (d: string): void => {
    for (const g of readdirSync(join(kok, d), { withFileTypes: true })) {
      if (sonuc.length >= 50_000) return;
      if (g.name.startsWith('.') || g.name === 'node_modules') continue;
      const yol = d === '' ? g.name : `${d}/${g.name}`;
      if (g.isDirectory()) yuru(yol);
      else if (g.isFile()) sonuc.push(yol);
    }
  };
  yuru('');
  return sonuc;
}

/** Projedeki test dosyalarinin ozeti ve atlama isareti sayisi. */
export function testOzeti(kok: string): Record<string, TestDosyasi> {
  const sonuc: Record<string, TestDosyasi> = {};
  for (const yol of projeDosyalari(kok).filter((y) => TEST_DOSYASI.test(y) && !/^(\.mihenk|node_modules)\//.test(y)).slice(0, SINIR)) {
    try {
      const tam = join(kok, yol);
      if (!statSync(tam).isFile()) continue;
      const icerik = readFileSync(tam);
      sonuc[yol] = { ozet: createHash('sha256').update(icerik).digest('hex'), atla: (icerik.toString('utf8').match(ATLA) ?? []).length };
    } catch {
      // okunamayan dosya atlanir
    }
  }
  return sonuc;
}

/** Iki ozet arasindaki kuskulu farklar: var olan test degisti / silindi; atlama isareti artti. Yeni test dosyasi kuskulu degildir. */
export function kurcalamaFarki(once: Record<string, TestDosyasi>, sonra: Record<string, TestDosyasi>): string[] {
  const degisen: string[] = [];
  const silinen: string[] = [];
  const atlanan: string[] = [];
  for (const [yol, o] of Object.entries(once)) {
    const s = sonra[yol];
    if (!s) silinen.push(yol);
    else if (s.ozet !== o.ozet) degisen.push(yol);
  }
  for (const [yol, s] of Object.entries(sonra)) {
    if (s.atla > (once[yol]?.atla ?? 0)) atlanan.push(yol);
  }
  const k = (l: string[]): string => l.slice(0, 5).join(', ') + (l.length > 5 ? ` (+${l.length - 5})` : '');
  const sonuc: string[] = [];
  if (silinen.length) sonuc.push(`is sirasinda var olan test dosyasi silindi: ${k(silinen)}`);
  if (degisen.length) sonuc.push(`is sirasinda var olan test dosyasi degisti: ${k(degisen)}`);
  if (atlanan.length) sonuc.push(`is sirasinda test atlama isareti eklendi (skip / xfail): ${k(atlanan)}`);
  return sonuc;
}
