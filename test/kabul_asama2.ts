// Asama 2 kabul denemesi (elle kosulur; gercek ajan araci ve acik oturum ister, bu yuzden npm test'e dahil degil).
// Ne yapar: kucuk hatali ornek projeyi gecici dizine kopyalar, mihenk'i kurar, araci bassiz kipte calistirir ve
// SONUCU ARACIN BEYANINDAN DEGIL defterden ve testin kendisinden okur.
// Kullanim: node dist/test/kabul_asama2.js --arac claude [--komut <aracin calistirilabilir dosyasi>]
// Bassiz komut bicimi yalniz burada denenmis araclar icin yazilir; yeni arac eklenirken kendi yardim ciktisindan dogrulanir.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Defter } from '../src/defter.js';
import { kur, type Arac } from '../src/kur.js';

const DEPO = fileURLToPath(new URL('../../', import.meta.url));
const GOREV = 'Bu projede "npm test" kaliyor. Hatayi bul ve duzelt. Projenin AGENTS.md dosyasindaki calisma yontemine uy.';

const DEFTER_ARACLARI = ['is_ac', 'hukum_ver', 'kanit_ekle', 'karar_yaz', 'rapor'].map((a) => `mcp__mihenk__${a}`);

/** Arac basina bassiz komut. Bayraklar aracin kendi --help ciktisindan dogrulandi (Claude Code 2.1.326). */
const BASSIZ: Partial<Record<Arac, { komut: string; argumanlar: string[]; istemci: RegExp; skillDizini: string }>> = {
  claude: {
    komut: 'claude',
    argumanlar: ['-p', GOREV, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--no-session-persistence',
      '--max-budget-usd', '1', '--allowedTools', ...DEFTER_ARACLARI, 'Read', 'Edit', 'Glob', 'Grep'],
    istemci: /claude/i,
    skillDizini: '.claude/skills',
  },
};

const secenek = (ad: string): string | undefined => {
  const i = process.argv.indexOf(ad);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const arac = (secenek('--arac') ?? 'claude') as Arac;
const tanim = BASSIZ[arac];
if (!tanim) {
  console.error(`ATLANDI: "${arac}" icin bassiz komut henuz dogrulanip yazilmadi. Yazilanlar: ${Object.keys(BASSIZ).join(', ')}`);
  process.exit(2);
}

const proje = mkdtempSync(join(tmpdir(), `mihenk-kabul2-${arac}-`));
cpSync(join(DEPO, 'ornek', 'kucuk-gorev'), proje, { recursive: true });
const kurulum = kur(proje, { araclar: [arac] });
console.log(`proje: ${proje}`);
console.log(`kurulum: ${kurulum.yazilan.length} dosya yazildi; skill dizini ${existsSync(join(proje, tanim.skillDizini)) ? 'var' : 'YOK'}`);

const once = spawnSync(process.execPath, ['--test'], { cwd: proje, encoding: 'utf8' });
console.log(`baslangic: ornek projenin testi ${once.status === 0 ? 'GECIYOR (beklenmedik)' : 'kaliyor (beklenen)'}`);

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

// Hukum: defter ve testin kendisi.
const defter = new Defter(proje);
const rapor = defter.rapor({});
const isler = (rapor.isler ?? []).map((i) => defter.rapor({ is_id: i.id }).is);
defter.kapat();
const araclaAcilan = isler.filter((i) => i && tanim.istemci.test(i.istemci ?? ''));
const gecen = araclaAcilan.filter((i) => i?.durum === 'gecti');
const sonra = spawnSync(process.execPath, ['--test'], { cwd: proje, encoding: 'utf8' });

console.log(`defter: ${JSON.stringify(rapor.ozet)}; bu aracin actigi is: ${araclaAcilan.length}, "gecti" diye kapanan: ${gecen.length}`);
console.log(`bagimsiz denetim: ornek projenin testi ${sonra.status === 0 ? 'geciyor' : 'KALIYOR'}`);

const sonuclar: Array<[string, boolean]> = [
  ['arac deftere is acti', araclaAcilan.length > 0],
  ['is sunucunun kostugu dogrulamayla "gecti" diye kapandi', gecen.length > 0],
  ['test bagimsiz kosuda da geciyor', sonra.status === 0],
];
for (const [ad, tamam] of sonuclar) console.log(`  ${tamam ? 'tamam' : 'EKSIK'}: ${ad}`);
const hepsi = sonuclar.every(([, t]) => t);
console.log(hepsi ? `GECTI: ${arac} ayni kucuk gorevde defteri kullandi.` : `KALDI: ${arac} icin olcut saglanmadi.`);
console.log(`Not: skill'lerin aracta listelendigi elle bakilir (arac icinde /skills).`);
process.exit(hepsi ? 0 : 1);
