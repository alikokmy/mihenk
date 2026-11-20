// Cevrimdisi kurulum paketi (Surum 0.4, Asama 24). Internetsiz ve yonetici izni olmayan ortam icin tek klasor / tek zip:
//   node\node.exe            tasinabilir Node.js (paketi yapan bilgisayardaki surum; ayrica Node kurulmasi gerekmez)
//   app\dist\src, app\paket   mihenk
//   app\node_modules          yalniz uretim bagimliliklari (package-lock.json'dan; npm install gerekmez)
//   Mihenk-Ac.cmd             TEK GIRIS (Asama 31): cift tiklayinca pencere acilir; proje orada secilir ya da yeni proje acilir
//   mihenk.cmd                komut satiri:   mihenk.cmd kur --hedef <proje>   (gelistirici icin)
//   Projeye-kur.cmd           proje klasorunu ustune surukle-birak (istege bagli)
//   KURULUM.txt               duz dille kurulum
// Kurulumun yazdigi ayarlar (MCP, kanca, .cmd) paketin node.exe'sini mutlak yolla cagirir: paket acildigi yerde kalmalidir.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** package-lock.json'daki uretim paketleri (dev isaretli olmayanlar). */
export function uretimPaketleri(depo = DEPO): string[] {
  const kilit = JSON.parse(readFileSync(join(depo, 'package-lock.json'), 'utf8')) as { packages: Record<string, { dev?: boolean; devOptional?: boolean }> };
  return Object.entries(kilit.packages)
    .filter(([yol, p]) => yol.startsWith('node_modules/') && !p.dev && !p.devOptional)
    .map(([yol]) => yol);
}

export interface PaketSonucu {
  klasor: string;
  zip: string | null;
  paket_sayisi: number;
  boyut_mb: number;
}

function dizinBoyutu(d: string): number {
  let t = 0;
  const yuru = (x: string): void => {
    const s = statSync(x);
    if (s.isDirectory()) for (const g of readdirSync(x)) yuru(join(x, g));
    else t += s.size;
  };
  yuru(d);
  return t;
}

export function paketle(cikis: string, o: { zip?: boolean; depo?: string } = {}): PaketSonucu {
  const depo = o.depo ?? DEPO;
  const surum = (JSON.parse(readFileSync(join(depo, 'package.json'), 'utf8')) as { version: string }).version;
  const ad = `mihenk-${surum}-${process.platform}-${process.arch}`;
  const klasor = resolve(cikis, ad);
  rmSync(klasor, { recursive: true, force: true });
  mkdirSync(join(klasor, 'node'), { recursive: true });

  // 1. Node.js: calisan node.exe ve lisansi.
  cpSync(process.execPath, join(klasor, 'node', process.platform === 'win32' ? 'node.exe' : 'node'));
  const nodeLisans = join(dirname(process.execPath), 'LICENSE');
  if (existsSync(nodeLisans)) cpSync(nodeLisans, join(klasor, 'node', 'LICENSE'));

  // 2. mihenk: derlenmis kod (testler haric), yontem paketi, belgeler.
  const app = join(klasor, 'app');
  cpSync(join(depo, 'dist', 'src'), join(app, 'dist', 'src'), { recursive: true });
  cpSync(join(depo, 'paket'), join(app, 'paket'), { recursive: true });
  for (const b of ['README.md', 'README.en.md']) if (existsSync(join(depo, b))) cpSync(join(depo, b), join(app, b));
  const pj = JSON.parse(readFileSync(join(depo, 'package.json'), 'utf8')) as Record<string, unknown>;
  delete pj.devDependencies;
  delete pj.scripts;
  writeFileSync(join(app, 'package.json'), JSON.stringify(pj, null, 2) + '\n');

  // 3. Uretim bagimliliklari (npm install gerekmez; internet gerekmez).
  const paketler = uretimPaketleri(depo);
  for (const p of paketler) cpSync(join(depo, p), join(app, p), { recursive: true });

  // 4. Cift tiklanan dosyalar (yonetici izni yok; paket nereye acildiysa oradan calisir).
  const nodeYolu = '"%~dp0node\\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\\dist\\src\\cli.js"';
  writeFileSync(join(klasor, 'mihenk.cmd'), ['@echo off', `${nodeYolu} %*`, ''].join('\r\n'));
  // Tek giris: sunucu kucultulmus ayri bir konsolda calisir, bu dosya hemen kapanir; tarayici kapaninca sunucu kendiliginden kapanir.
  writeFileSync(join(klasor, 'Mihenk-Ac.cmd'), [
    '@echo off',
    'rem mihenk: cift tiklayin. Tarayicida mihenk penceresi acilir; projenizi orada secin ya da yeni proje acin.',
    'start "mihenk (pencereyi kapatinca kendiliginden kapanir)" /min "%~dp0node\\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\\dist\\src\\cli.js" ac',
    '',
  ].join('\r\n'));
  writeFileSync(join(klasor, 'Projeye-kur.cmd'), [
    '@echo off',
    'rem mihenk: bir projeye kurar. Proje klasorunu bu dosyanin ustune surukleyip birakin ya da cift tiklayip klasoru yazin.',
    'set "PROJE=%~1"',
    'if "%PROJE%"=="" set /p "PROJE=Proje klasorunu yazin (ya da bu pencereye surukleyip birakin), sonra Enter: "',
    'set "PROJE=%PROJE:"=%"',
    'if not exist "%PROJE%\\" ( echo Klasor bulunamadi: %PROJE% & pause & exit /b 1 )',
    `${nodeYolu} kur --hedef "%PROJE%"`,
    'echo.',
    'echo Kurulum bitti. Proje klasorundeki mihenk-pencere.cmd ile pencereyi acabilirsiniz.',
    'pause',
    '',
  ].join('\r\n'));
  writeFileSync(join(klasor, 'KURULUM.txt'), [
    `mihenk ${surum}`,
    '',
    'Bu klasorde mihenk icin gereken her sey var (Node.js dahil). Internet, kurulum programi ve yonetici izni gerekmez.',
    '',
    '1. Bu klasoru kalici bir yere tasiyin (or. Belgeler\\mihenk) ve sonra yerini degistirmeyin.',
    '2. "Mihenk-Ac.cmd" dosyasina cift tiklayin. Tarayicinizda mihenk penceresi acilir.',
    '3. Pencerede projenizi secin ya da fikriniz icin yeni bir proje acin. Isleri orada yazar, orada takip edersiniz.',
    '   Bir dahaki sefere kolay acmak icin pencerede "Masaustune kisayol koy" dugmesine basabilirsiniz.',
    '',
    'Tarayici penceresini kapatinca mihenk birkac dakika icinde kendiliginden kapanir (is listesi calisiyorsa bitmesini bekler).',
    '',
    'OpenCode ve yerel model (Qwen, DeepSeek): kurulum projedeki opencode.json dosyasina yalniz "mihenk" kaydini ekler;',
    'sizin saglayici (provider) ve model ayarlariniza dokunmaz. Ayrinti: app\\README.md, "Internetsiz ortam ve yerel model".',
    '',
    'Kaldirmak: penceredeki Proje sekmesinde "Kaldir" (ya da proje klasorunde "mihenk-kaldir.cmd"). Bu klasoru silmek mihenk\'i',
    'bilgisayardan kaldirir; son projeler listesi %LOCALAPPDATA%\\mihenk klasorundedir.',
    '',
  ].join('\r\n'));

  // 5. Tek zip (Windows 10+ tar.exe; yonetici izni gerekmez).
  let zip: string | null = null;
  if (o.zip !== false) {
    zip = `${klasor}.zip`;
    rmSync(zip, { force: true });
    const r = spawnSync('tar', ['-a', '-c', '-f', zip, '-C', resolve(cikis), ad], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) zip = null;
  }
  return { klasor, zip, paket_sayisi: paketler.length, boyut_mb: Math.round(dizinBoyutu(klasor) / 1048576) };
}
