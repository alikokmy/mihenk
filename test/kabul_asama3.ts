// Asama 3 kabul denemesi (gercek ajan araclari ister; npm test'e dahil degil).
// On kucuk hatali islevi olan bir proje kurar, on islik liste yazar ve surucuyu KULLANICININ CALISTIRACAGI KOMUTLA,
// girdi vermeden baslatir. Sonucu surucunun soylediginden degil defterden, testlerden ve git gecmisinden okur.
// Kullanim: node dist/test/kabul_asama3.js [--ajanlar codex,opencode] [--is-sayisi 10]
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Defter } from '../src/defter.js';
import { kur, type Arac } from '../src/kur.js';
import { depoDurumu } from '../src/saklama.js';

const DEPO = fileURLToPath(new URL('../../', import.meta.url));
const secenek = (ad: string): string | undefined => {
  const i = process.argv.indexOf(ad);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ajanlar = (secenek('--ajanlar') ?? 'codex,opencode').split(',').map((a) => a.trim()).filter(Boolean);
const isSayisi = Number(secenek('--is-sayisi') ?? 10);

// Her biri tek satirlik hatasi olan on islev: [ad, hatali govde, test ifadesi, beklenen].
const ISLEVLER: Array<[string, string, string, string]> = [
  ['topla', '(a, b) => a - b', 'topla(2, 3)', '5'],
  ['carp', '(a, b) => a + b', 'carp(4, 5)', '20'],
  ['enBuyuk', '(dizi) => Math.min(...dizi)', 'enBuyuk([3, 9, 4])', '9'],
  ['tersCevir', '(metin) => metin', "tersCevir('abc')", "'cba'"],
  ['ciftMi', '(n) => n % 2 === 1', 'ciftMi(10)', 'true'],
  ['faktoriyel', '(n) => { let s = 1; for (let i = 1; i < n; i++) s *= i; return s; }', 'faktoriyel(5)', '120'],
  ['buyukHarf', '(metin) => metin.toLowerCase()', "buyukHarf('mihenk')", "'MIHENK'"],
  ['sonEleman', '(dizi) => dizi[0]', 'sonEleman([1, 2, 3])', '3'],
  ['mutlak', '(n) => n', 'mutlak(-7)', '7'],
  ['ortalama', '(dizi) => dizi.reduce((a, b) => a + b, 0) / dizi.length', 'ortalama([])', '0'],
];

const proje = join(DEPO, 'deneme', `asama3-${ajanlar.join('-')}`);
rmSync(proje, { recursive: true, force: true });
mkdirSync(join(proje, 'src'), { recursive: true });
mkdirSync(join(proje, 'test'), { recursive: true });
writeFileSync(join(proje, 'package.json'), JSON.stringify({ name: 'on-is', private: true, type: 'module' }, null, 2) + '\n');
const isler = ISLEVLER.slice(0, isSayisi).map(([ad, govde, ifade, beklenen], i) => {
  writeFileSync(join(proje, 'src', `${ad}.js`), `export const ${ad} = ${govde};\n`);
  writeFileSync(
    join(proje, 'test', `${ad}.test.js`),
    `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${ad} } from '../src/${ad}.js';\n\ntest('${ad}', () => assert.equal(${ifade}, ${beklenen}));\n`,
  );
  return {
    kimlik: `is-${i + 1}`,
    tur: 'hata_duzeltme',
    soru: `src/${ad}.js icindeki ${ad} islevi hatali; test/${ad}.test.js gecmiyor. Islevi duzelt, testi degistirme.`,
    beklenti: `test/${ad}.test.js gecer.`,
    yanlissa: `test/${ad}.test.js yine kalir.`,
    dogrulama_komutu: `node --test test/${ad}.test.js`,
    ajan: ajanlar[i % ajanlar.length],
  };
});
writeFileSync(join(proje, 'mihenk-isler.json'), JSON.stringify({ saklama: 'yerel', isler }, null, 2) + '\n');
kur(proje, { araclar: ajanlar.filter((a) => a !== 'sahte') as Arac[] });
for (const a of [['init', '-q'], ['config', 'user.email', 'mihenk@ornek.test'], ['config', 'user.name', 'mihenk deneme'], ['add', '-A'], ['commit', '-q', '-m', 'baslangic: on hatali islev']]) {
  spawnSync('git', a, { cwd: proje });
}
const once = spawnSync(process.execPath, ['--test'], { cwd: proje, encoding: 'utf8' });
const kalanOnce = Number((/# fail (\d+)/.exec(once.stdout) ?? /ℹ fail (\d+)/.exec(once.stdout) ?? [])[1] ?? -1);
console.log(`proje: ${proje}`);
console.log(`baslangic: ${isler.length} is, kalan test sayisi ${kalanOnce}`);

const depoOnce = depoDurumu(DEPO);
const t0 = Date.now();
// Kullanicinin calistiracagi komut; stdin kapali: kullanici girisi yok.
const kosu = spawnSync(process.execPath, [join(DEPO, 'dist', 'src', 'cli.js'), 'sur', '--hedef', proje, '--uyanik-tut', '--oturum-sn', '600'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
});
const dakika = ((Date.now() - t0) / 60000).toFixed(1);
console.log('--- surucunun ciktisi:');
console.log(kosu.stdout.trim());
if (kosu.stderr.trim() !== '') console.log(`--- surucu stderr: ${kosu.stderr.trim().split('\n').filter((s) => !/ExperimentalWarning|trace-warnings/.test(s)).join(' | ').slice(0, 500)}`);

// Hukum: defter, testler, git.
const defter = new Defter(proje);
const ozet = defter.rapor({}).ozet;
const ayrinti = (defter.rapor({ sinir: 100 }).isler ?? []).reverse();
defter.kapat();
const sonra = spawnSync(process.execPath, ['--test'], { cwd: proje, encoding: 'utf8' });
const commit = Number(spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: proje, encoding: 'utf8' }).stdout.trim());
const uzak = spawnSync('git', ['remote'], { cwd: proje, encoding: 'utf8' }).stdout.trim();
const testDegisti = spawnSync('git', ['diff', '--stat', 'HEAD~' + (commit - 1), '--', 'test'], { cwd: proje, encoding: 'utf8' }).stdout.trim();

console.log(`--- denetim (${dakika} dakika):`);
console.log(`defter: ${JSON.stringify(ozet)}`);
for (const i of ayrinti) console.log(`  is ${i.id}: ${i.durum} ajan=${i.ajan} deneme=${i.deneme_sayisi} sure=${i.sure_sn}s`);
const sonuclar: Array<[string, boolean]> = [
  [`liste kullanici girisi olmadan bitti (${ozet.toplam} is kayitli)`, kosu.status !== null && ozet.toplam === isler.length && ozet.acik === 0],
  [`butun isler "gecti" (${ozet.gecti}/${isler.length})`, ozet.gecti === isler.length],
  ['testler bagimsiz kosuda geciyor', sonra.status === 0],
  ['ajan testleri degistirmedi', testDegisti === ''],
  [`yerel kip: gecen is basina bir commit (${commit - 1}), uzak depo yok`, commit - 1 === ozet.gecti && uzak === ''],
  ['mihenk deposu degismedi (ajan proje disina cikmadi)', depoDurumu(DEPO) === depoOnce],
];
for (const [ad, tamam] of sonuclar) console.log(`  ${tamam ? 'tamam' : 'EKSIK'}: ${ad}`);
const hepsi = sonuclar.every(([, t]) => t);
console.log(hepsi ? 'GECTI: on islik liste kullanici girisi olmadan bitti.' : 'KALDI: olcut saglanmadi.');
process.exit(hepsi ? 0 : 1);
