// Takim kosucusu (Asama 37): "node dist/test/takim.js bilgi|engel|hepsi|dosya <ad...>". Takim listesi test/takimlar.json'dadir.
// Artik denetimi (2026-11-22): testler sahte proje klasorlerini gecici klasorde acar. Kullanici karari: isin gecici dosyalari sistemin
// gecici klasorune degil, projenin altindaki git-disi ".gecici/" klasorune yazilir (sistem gecici klasoru sisince bilgisayar acilmiyor).
// Kosucu her kosuya ".gecici/kosu-*" verir (TEMP/TMP/TMPDIR), kosu bitince siler; sistem gecici klasorunde kosu sirasinda yeni
// "mihenk-*" kalmissa ya da kosunun klasoru silinemezse kosuyu basarisiz sayar.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = dirname(fileURLToPath(import.meta.url)); // dist/test
const KAYNAK = join(DIST, '..', '..', 'test');
/** Projenin git-disi gecici klasoru. */
export const GECICI = join(DIST, '..', '..', '.gecici');
const KOSU_ONEKI = 'kosu-';
const BAYAT_MS = 6 * 3600_000;

export function takimlar(): { bilgi: string[]; engel: string[] } {
  const bilgi = (JSON.parse(readFileSync(join(KAYNAK, 'takimlar.json'), 'utf8')) as { bilgi: string[] }).bilgi;
  const hepsi = readdirSync(KAYNAK).filter((d) => d.endsWith('.test.ts')).sort();
  return { bilgi: hepsi.filter((d) => bilgi.includes(d)), engel: hepsi.filter((d) => !bilgi.includes(d)) };
}

/** Deponun butun dallarinin uclari ve stash; depo degilse bos. */
const depoBasi = (depo: string) =>
  spawnSync('git', ['-C', depo, 'for-each-ref', '--format=%(refname) %(objectname)'], { encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(depo) } }).stdout ?? '';

const mihenkler = (dizin: string) => new Set(readdirSync(dizin).filter((d) => d.startsWith('mihenk-')));

/** Test dosyalarini "yer" altinda kendi klasorunde kosar; sonra siler ve sistem gecici klasorunde ("gercek") artik arar. */
export function yalitikKos(
  dosyalar: string[],
  o: { gercek?: string; yer?: string; stdio?: 'inherit' | 'pipe'; env?: NodeJS.ProcessEnv } = {},
): { kod: number; artik: string[]; silinemedi: boolean; depo_degisti: boolean } {
  const gercek = o.gercek ?? tmpdir();
  const yer = o.yer ?? GECICI;
  mkdirSync(yer, { recursive: true });
  // Kalkan: sahte projeler mihenk deposunun altinda durur. Node ve npm en yakin package.json'u arar; bu bos dosya mihenk'inkini
  // ("type": "module", betikler) gizler, git'i de GIT_CEILING_DIRECTORIES durdurur. Sahte proje sistem gecici klasorundeymis gibi davranir.
  const kalkan = join(yer, 'package.json');
  if (!existsSync(kalkan)) writeFileSync(kalkan, JSON.stringify({ name: 'mihenk-gecici', private: true }) + '\n');
  // Yarida kesilmis eski kosularin klasorleri (6 saatten eski) temizlenir; ayni anda kosan baska kosuya dokunulmaz.
  for (const d of readdirSync(yer)) {
    const y = join(yer, d);
    try {
      if (d.startsWith(KOSU_ONEKI) && Date.now() - statSync(y).mtimeMs > BAYAT_MS) rmSync(y, { recursive: true, force: true });
    } catch {
      // kilitli: kalir
    }
  }
  const once = mihenkler(gercek);
  // Depo bekcisi: kalkan delinir de bir test ust klasordeki depoya (mihenk) commit atarsa kosu duser (2026-11-22'de tavansiz denemede oldu).
  const depo = dirname(yer);
  const basOnce = depoBasi(depo);
  const ozel = mkdtempSync(join(yer, KOSU_ONEKI));
  // GIT_CEILING_DIRECTORIES: sahte projeler mihenk deposunun altinda durur; git ust klasordeki mihenk deposunu bulmasin.
  const env: NodeJS.ProcessEnv = { ...process.env, ...o.env, TEMP: ozel, TMP: ozel, TMPDIR: ozel, GIT_CEILING_DIRECTORIES: ozel };
  delete env.NODE_TEST_CONTEXT; // bir testin icinden cagrilinca ic kosu kendi basina calissin
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...dosyalar], { stdio: o.stdio ?? 'inherit', env });
  try {
    rmSync(ozel, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // kilitli dosya: asagida "silinemedi" olarak bildirilir
  }
  const artik = [...mihenkler(gercek)].filter((d) => !once.has(d)).sort();
  return { kod: r.status ?? 1, artik, silinemedi: existsSync(ozel), depo_degisti: depoBasi(depo) !== basOnce };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ad = process.argv[2];
  const t = takimlar();
  let secim: string[];
  if (ad === 'hepsi') secim = [...t.bilgi, ...t.engel].sort();
  else if (ad === 'bilgi' || ad === 'engel') secim = t[ad];
  else if (ad === 'dosya' && process.argv.length > 3) {
    secim = process.argv.slice(3).map((a) => `${a.replace(/(\.test)?\.(ts|js)$/, '')}.test.ts`);
    const yok = secim.filter((d) => !existsSync(join(KAYNAK, d)));
    if (yok.length) {
      console.error(`test dosyasi yok: ${yok.join(', ')}`);
      process.exit(2);
    }
  } else {
    console.error('kullanim: node dist/test/takim.js bilgi|engel|hepsi|dosya <ad...>');
    process.exit(2);
  }
  const r = yalitikKos(secim.map((d) => join(DIST, d.replace(/\.ts$/, '.js'))));
  if (r.artik.length > 0) console.error(`ARTIK: testler sistem gecici klasorunde ${r.artik.length} klasor birakti: ${r.artik.slice(0, 5).join(', ')}`);
  if (r.depo_degisti) console.error('ARTIK: kosu sirasinda mihenk deposunun dallari degisti (bir test ust klasordeki depoya commit atti). git log ile bakin.');
  if (r.silinemedi) console.error('ARTIK: kosunun gecici klasoru silinemedi (kilitli dosya; acik kalan bir surec olabilir).');
  process.exit(r.kod !== 0 ? r.kod : r.artik.length > 0 || r.silinemedi || r.depo_degisti ? 1 : 0);
}
