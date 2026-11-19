// Asama 2 kabul denemesi (gercek ajan araci ve acik oturum ister, bu yuzden npm test'e dahil degil).
// Kucuk hatali ornek projeyi hazirlar, mihenk'i kurar, araca gorevi verir ve SONUCU ARACIN BEYANINDAN DEGIL
// defterden ve testin kendisinden okur.
//
// Bassiz kipi olan arac (tek komut):
//   node dist/test/kabul_asama2.js --arac claude [--komut <aracin calistirilabilir dosyasi>]
// Bassiz kipi olmayan arac (or. Antigravity masaustu uygulamasi): iki adim, arada gorevi kullanici verir:
//   node dist/test/kabul_asama2.js --arac antigravity --asama hazirla
//   node dist/test/kabul_asama2.js --arac antigravity --asama denetle
//
// Bassiz komut bicimi yalniz burada denenmis araclar icin yazilir; yeni arac eklenirken kendi yardim ciktisindan dogrulanir.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Defter } from '../src/defter.js';
import { ARACLAR, kur, type Arac } from '../src/kur.js';

const DEPO = fileURLToPath(new URL('../../', import.meta.url));
// Gorev metninde tirnak ve kabuk karakteri yok: Windows'ta .cmd sarmalayicili araclara kabuk uzerinden guvenle gecer.
const GOREV = 'Bu projede npm test kaliyor. Hatayi bul ve duzelt. Projenin AGENTS.md dosyasindaki calisma yontemine uy.';
const DEFTER_ARACLARI = ['is_ac', 'hukum_ver', 'kanit_ekle', 'karar_yaz', 'rapor'].map((a) => `mcp__mihenk__${a}`);
/** Bu deponun kendi test istemcileri: bir ajan araci sayilmazlar. */
const TEST_ISTEMCISI = /bagimsiz-test-istemcisi|kurulum-denetimi|birinci-arac|ikinci-arac/;

/**
 * Arac basina bassiz komut. Bayraklar her aracin kendi --help ciktisindan dogrulandi ve bu makinede denendi
 * (2026-11-20: Claude Code 2.1.326, Codex CLI 0.170.0, OpenCode 2.3.2).
 * sabit: proje gecici dizin yerine deneme/<arac> altinda kurulur (Codex proje basina guven kaydi tutar; her kosuda yeni kayit birikmesin).
 */
const BASSIZ: Partial<Record<Arac, { komut: string; argumanlar: string[]; sabit?: boolean }>> = {
  claude: {
    komut: 'claude',
    argumanlar: ['-p', GOREV, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--no-session-persistence',
      '--max-budget-usd', '1', '--allowedTools', ...DEFTER_ARACLARI, 'Read', 'Edit', 'Glob', 'Grep'],
  },
  // --trust olmadan Codex projedeki MCP kaydini okumaz; --approve-for-me olmadan bassiz kipte arac cagrisi onay bekleyip reddedilir.
  codex: { komut: 'codex', argumanlar: ['exec', '--trust', '--approve-for-me', '--json', GOREV], sabit: true },
  // OpenCode'da komut satiri araci masaustu uygulamasinin icindedir (resources/opencode-cli.exe); PATH'te yoksa --komut ile verilir.
  opencode: { komut: 'opencode', argumanlar: ['run', '--standalone', '--auto', '--format', 'json', GOREV] },
};

const secenek = (ad: string): string | undefined => {
  const i = process.argv.indexOf(ad);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const arac = (secenek('--arac') ?? 'claude') as Arac;
if (!ARACLAR.includes(arac)) {
  console.error(`bilinmeyen arac: ${arac}. Gecerli: ${ARACLAR.join(', ')}`);
  process.exit(2);
}
const asama = secenek('--asama') ?? 'hepsi';
// Elle kosulan denemede proje, kullanicinin acabilecegi sabit bir yerde durur (git disi: deneme/).
const sabitDizin = join(DEPO, 'deneme', arac);

function hazirla(proje: string): void {
  cpSync(join(DEPO, 'ornek', 'kucuk-gorev'), proje, { recursive: true });
  const kurulum = kur(proje, { araclar: [arac] });
  // Kendi deposu olsun: arac kural ve skill ararken ust dizindeki mihenk deposuna cikmasin.
  if (!existsSync(join(proje, '.git'))) spawnSync('git', ['init', '-q'], { cwd: proje });
  const once = spawnSync(process.execPath, ['--test'], { cwd: proje, encoding: 'utf8' });
  console.log(`proje: ${proje}`);
  console.log(`kurulum: ${kurulum.yazilan.length} dosya yazildi`);
  console.log(`baslangic: ornek projenin testi ${once.status === 0 ? 'GECIYOR (beklenmedik)' : 'kaliyor (beklenen)'}`);
}

function denetle(proje: string): never {
  if (!existsSync(join(proje, '.mihenk', 'defter.db'))) {
    console.log('defter: yok. Arac mihenk sunucusunu hic baslatmamis (MCP kaydi okunmamis ya da onaylanmamis olabilir).');
  }
  const defter = new Defter(proje);
  const rapor = defter.rapor({});
  const isler = (rapor.isler ?? []).map((i) => defter.rapor({ is_id: i.id }).is);
  defter.kapat();

  const logYolu = join(proje, '.mihenk', 'log.jsonl');
  const baglananlar = existsSync(logYolu)
    ? [...new Set(readFileSync(logYolu, 'utf8').trim().split('\n').filter(Boolean).map((s) => JSON.parse(s) as { islem: string; girdi?: { istemci?: string } })
        .filter((l) => l.islem === 'baglanti').map((l) => String(l.girdi?.istemci)))]
    : [];
  const araclaAcilan = isler.filter((i) => i && !TEST_ISTEMCISI.test(i.istemci ?? ''));
  const gecen = araclaAcilan.filter((i) => i?.durum === 'gecti');
  const sonra = spawnSync(process.execPath, ['--test'], { cwd: proje, encoding: 'utf8' });

  console.log(`deftere baglanan istemciler: ${baglananlar.length > 0 ? baglananlar.join(', ') : 'yok'}`);
  console.log(`defter: ${JSON.stringify(rapor.ozet)}`);
  for (const i of araclaAcilan) {
    console.log(`  is ${i?.id}: durum=${i?.durum} deneme=${i?.deneme_sayisi} ajan=${i?.ajan} model=${i?.model} istemci=${i?.istemci} komut="${i?.dogrulama_komutu}"`);
  }
  const sonuclar: Array<[string, boolean]> = [
    ['arac deftere baglandi', baglananlar.some((b) => !TEST_ISTEMCISI.test(b))],
    ['arac deftere is acti', araclaAcilan.length > 0],
    ['is sunucunun kostugu dogrulamayla "gecti" diye kapandi', gecen.length > 0],
    ['ornek projenin testi bagimsiz kosuda da geciyor', sonra.status === 0],
  ];
  for (const [ad, tamam] of sonuclar) console.log(`  ${tamam ? 'tamam' : 'EKSIK'}: ${ad}`);
  const hepsi = sonuclar.every(([, t]) => t);
  console.log(hepsi ? `GECTI: ${arac} kucuk gorevde defteri kullandi.` : `KALDI: ${arac} icin olcut saglanmadi.`);
  console.log(`Not: skill'lerin aracta listelendigine arac icinden elle bakilir.`);
  process.exit(hepsi ? 0 : 1);
}

if (asama === 'hazirla') {
  rmSync(sabitDizin, { recursive: true, force: true });
  mkdirSync(sabitDizin, { recursive: true });
  hazirla(sabitDizin);
  console.log('\nSimdi sizin adiminiz:');
  console.log(`  1. Aracta su klasoru acin: ${sabitDizin}`);
  console.log(`  2. Sohbete sunu yazin: ${GOREV}`);
  console.log(`  3. Arac "bitti" deyince: node dist/test/kabul_asama2.js --arac ${arac} --asama denetle`);
  process.exit(0);
}

if (asama === 'denetle') denetle(sabitDizin);

const tanim = BASSIZ[arac];
if (!tanim) {
  console.error(`"${arac}" icin dogrulanmis bassiz komut yok. Elle deneme icin: --asama hazirla, sonra --asama denetle.`);
  process.exit(2);
}
let proje: string;
if (tanim.sabit) {
  proje = sabitDizin;
  rmSync(proje, { recursive: true, force: true });
  mkdirSync(proje, { recursive: true });
} else {
  proje = mkdtempSync(join(tmpdir(), `mihenk-kabul2-${arac}-`));
}
hazirla(proje);
const komut = secenek('--komut') ?? tanim.komut;
// Windows'ta npm ile kurulan araclar (codex) .cmd sarmalayicisidir ve ancak kabukla kosar; .exe dogrudan kosar.
const kabukla = process.platform === 'win32' && !/\.exe$/i.test(komut);
// OLAY (2026-11-20): bu betik depo dizininden baslatildi; OpenCode calisma dizinini surecin gercek dizininden degil miras kalan
// PWD ortam degiskeninden aldi ve ornek proje yerine mihenk deposunun kendisinde calisip dosya degistirdi. Bu yuzden:
//   1) cocuk surece PWD acikca proje dizini olarak verilir (cwd tek basina yetmez);
//   2) kosudan once ve sonra deponun durumu karsilastirilir; degismisse sonuc gecersiz sayilir.
const ortam = { ...process.env, PWD: proje };
delete (ortam as Record<string, string | undefined>).OLDPWD;
delete (ortam as Record<string, string | undefined>).INIT_CWD;
const depoDurumu = (): string =>
  ['status', 'diff'].map((alt) => spawnSync('git', alt === 'status' ? ['status', '--porcelain'] : ['diff'], { cwd: DEPO, encoding: 'utf8' }).stdout).join('\n---\n');
const depoOnce = depoDurumu();
const ortak = { cwd: proje, env: ortam, encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 };
const kosu = kabukla
  ? spawnSync([komut, ...tanim.argumanlar].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '), { ...ortak, shell: true })
  : spawnSync(komut, tanim.argumanlar, ortak);
if (depoDurumu() !== depoOnce) {
  console.error('GECERSIZ: arac ornek proje yerine mihenk deposunda dosya degistirdi. "git status" ile bakin; bu kosunun sonucu sayilmaz.');
  process.exit(3);
}
if (kosu.error) {
  console.error(`ATLANDI: arac baslatilamadi (${kosu.error.message}). Kurulu degilse --komut ile yolunu verin.`);
  process.exit(2);
}
let beyan = kosu.stdout.trim();
try {
  const j = JSON.parse(beyan) as { result?: string; total_cost_usd?: number; num_turns?: number };
  beyan = String(j.result ?? '');
  console.log(`arac: ${j.num_turns ?? '?'} tur, maliyet ${j.total_cost_usd ?? '?'} USD`);
} catch {
  // Tek JSON degilse satir satir JSON olabilir (Codex, OpenCode): son metin iletisi beyandir.
  const metinler: string[] = [];
  for (const satir of beyan.split(String.fromCharCode(10))) {
    try {
      const o = JSON.parse(satir) as { item?: { type?: string; text?: string }; part?: { type?: string; text?: string } };
      if (o.item?.type === 'agent_message' && o.item.text) metinler.push(o.item.text);
      else if (o.part?.type === 'text' && o.part.text) metinler.push(o.part.text);
    } catch {
      // JSON olmayan satir atlanir.
    }
  }
  if (metinler.length > 0) beyan = metinler[metinler.length - 1] as string;
}
console.log(`aracin beyani (kanit sayilmaz): ${beyan.slice(0, 300).replace(/\s+/g, ' ')}`);
if (/not logged in/i.test(beyan)) {
  console.error('ATLANDI: aracta oturum acik degil. Oturum acildiktan sonra yeniden kosun.');
  process.exit(2);
}
denetle(proje);
