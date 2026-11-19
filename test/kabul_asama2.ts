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
const GOREV = 'Bu projede "npm test" kaliyor. Hatayi bul ve duzelt. Projenin AGENTS.md dosyasindaki calisma yontemine uy.';
const DEFTER_ARACLARI = ['is_ac', 'hukum_ver', 'kanit_ekle', 'karar_yaz', 'rapor'].map((a) => `mcp__mihenk__${a}`);
/** Bu deponun kendi test istemcileri: bir ajan araci sayilmazlar. */
const TEST_ISTEMCISI = /bagimsiz-test-istemcisi|kurulum-denetimi|birinci-arac|ikinci-arac/;

/** Arac basina bassiz komut. Bayraklar aracin kendi --help ciktisindan dogrulandi (Claude Code 2.1.326). */
const BASSIZ: Partial<Record<Arac, { komut: string; argumanlar: string[] }>> = {
  claude: {
    komut: 'claude',
    argumanlar: ['-p', GOREV, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--no-session-persistence',
      '--max-budget-usd', '1', '--allowedTools', ...DEFTER_ARACLARI, 'Read', 'Edit', 'Glob', 'Grep'],
  },
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
const proje = mkdtempSync(join(tmpdir(), `mihenk-kabul2-${arac}-`));
hazirla(proje);
const kosu = spawnSync(secenek('--komut') ?? tanim.komut, tanim.argumanlar, {
  cwd: proje, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000,
});
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
  // JSON degilse ham metin kalir.
}
console.log(`aracin beyani (kanit sayilmaz): ${beyan.slice(0, 300).replace(/\s+/g, ' ')}`);
if (/not logged in/i.test(beyan)) {
  console.error('ATLANDI: aracta oturum acik degil. Oturum acildiktan sonra yeniden kosun.');
  process.exit(2);
}
denetle(proje);
