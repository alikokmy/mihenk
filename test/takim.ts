// Takim kosucusu (Asama 37): "node dist/test/takim.js bilgi|engel|hepsi". Takim listesi test/takimlar.json'dadir.
// Artik denetimi (2026-11-22): testler sahte proje klasorlerini gecici klasorde acar. Kosucu her kosuya kendi gecici klasorunu verir
// (TEMP/TMP/TMPDIR), kosu bitince onu siler ve gercek gecici klasorde kosu sirasinda yeni "mihenk-*" kalmissa kosuyu basarisiz sayar.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = dirname(fileURLToPath(import.meta.url)); // dist/test
const KAYNAK = join(DIST, '..', '..', 'test');
const KOSU_ONEKI = 'mihenk-kosu-';

export function takimlar(): { bilgi: string[]; engel: string[] } {
  const bilgi = (JSON.parse(readFileSync(join(KAYNAK, 'takimlar.json'), 'utf8')) as { bilgi: string[] }).bilgi;
  const hepsi = readdirSync(KAYNAK).filter((d) => d.endsWith('.test.ts')).sort();
  return { bilgi: hepsi.filter((d) => bilgi.includes(d)), engel: hepsi.filter((d) => !bilgi.includes(d)) };
}

const mihenkler = (dizin: string) => new Set(readdirSync(dizin).filter((d) => d.startsWith('mihenk-') && !d.startsWith(KOSU_ONEKI)));

/** Test dosyalarini kendi gecici klasorunde kosar; sonra siler ve gercek gecici klasorde artik arar. */
export function yalitikKos(dosyalar: string[], o: { gercek?: string; stdio?: 'inherit' | 'pipe'; env?: NodeJS.ProcessEnv } = {}): { kod: number; artik: string[]; silinemedi: boolean } {
  const gercek = o.gercek ?? tmpdir();
  const once = mihenkler(gercek);
  const ozel = mkdtempSync(join(gercek, KOSU_ONEKI));
  const env: NodeJS.ProcessEnv = { ...process.env, ...o.env, TEMP: ozel, TMP: ozel, TMPDIR: ozel };
  delete env.NODE_TEST_CONTEXT; // bir testin icinden cagrilinca ic kosu kendi basina calissin
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...dosyalar], { stdio: o.stdio ?? 'inherit', env });
  try {
    rmSync(ozel, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // kilitli dosya: asagida "silinemedi" olarak bildirilir
  }
  const artik = [...mihenkler(gercek)].filter((d) => !once.has(d)).sort();
  const silinemedi = existsSync(ozel);
  return { kod: r.status ?? 1, artik, silinemedi };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ad = process.argv[2];
  if (ad !== 'bilgi' && ad !== 'engel' && ad !== 'hepsi') {
    console.error('kullanim: node dist/test/takim.js bilgi|engel|hepsi');
    process.exit(2);
  }
  const t = takimlar();
  const secim = ad === 'hepsi' ? [...t.bilgi, ...t.engel].sort() : t[ad];
  const r = yalitikKos(secim.map((d) => join(DIST, d.replace(/\.ts$/, '.js'))));
  if (r.artik.length > 0) console.error(`ARTIK: testler gercek gecici klasorde ${r.artik.length} klasor birakti: ${r.artik.slice(0, 5).join(', ')}`);
  if (r.silinemedi) console.error('ARTIK: kosunun gecici klasoru silinemedi (kilitli dosya; acik kalan bir surec olabilir).');
  process.exit(r.kod !== 0 ? r.kod : r.artik.length > 0 || r.silinemedi ? 1 : 0);
}
