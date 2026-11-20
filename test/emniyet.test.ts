// Asama 12 kabul olcutu: tavan asilinca is "butce" gerekcesiyle kapaniyor ve liste duruyor; dongu taklidi erken kesiliyor
// (surucu.test.ts); yikici komut taklidi reddediliyor. Ajan yerine kucuk betikler kosar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { Defter } from '../src/defter.js';
import { yikiciKomut } from '../src/kapi.js';
import { listeyiYurut, type IsListesi } from '../src/surucu.js';

const KAPI_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'kapi-bin.js');
const BETIKLER = mkdtempSync(join(tmpdir(), 'mihenk-emniyet-ajan-'));
const sahte = (ad: string, govde: string): AjanTanimi => {
  const yol = join(BETIKLER, `${ad}.mjs`);
  writeFileSync(yol, `import { existsSync, readFileSync, writeFileSync } from 'node:fs';\nconst istem = process.argv[2] ?? '';\n${govde}\n`);
  return {
    ad, istemci: new RegExp(`^${ad}$`), komutBul: () => ({ program: process.execPath, onEk: [yol] }), argumanlar: (i) => [i],
    kullanimOku: () => undefined, metinOku: () => undefined,
    kullanimKatkisi: (s) => (s && typeof s === 'object' && 'kullanim' in s ? { tur: 'artis' as const, ...(s as { kullanim: object }).kullanim } : undefined),
  };
};

const AJANLAR: Record<string, AjanTanimi> = {
  // Her oturumda 0.4 USD harcar, isi hic yapmaz.
  savurgan: sahte('savurgan', `console.log(JSON.stringify({ kullanim: { girdi: 1000, cikti: 100, maliyet_usd: 0.4 } }));`),
  // Isini yapar ve 0.4 USD harcar.
  pahali: sahte('pahali', `console.log(JSON.stringify({ kullanim: { girdi: 1000, cikti: 100, maliyet_usd: 0.4 } })); writeFileSync('hedef.txt', 'x');`),
  // Ilk oturumda saglayici hiz siniri (gercek Kilo satiri bicimi), sonra isini yapar.
  kotali: sahte('kotali', `if (!existsSync('kota-gecti.txt')) { writeFileSync('kota-gecti.txt', '1'); console.log(JSON.stringify({ type: 'error', error: { name: 'APIError', data: { message: 'model is temporarily rate-limited upstream', statusCode: 429 } } })); } else { writeFileSync('hedef.txt', 'x'); }`),
  hephata: sahte('hephata', `console.log(JSON.stringify({ type: 'error', error: { data: { message: 'quota exceeded', statusCode: 429 } } }));`),
};

function proje(): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-emniyet-'));
  writeFileSync(join(kok, 'hedef-var.js'), "process.exit(require('node:fs').existsSync('hedef.txt') ? 0 : 1);");
  return kok;
}
const is = (soru: string) => ({ tur: 'ozellik', soru, beklenti: 'hedef.txt var', yanlissa: 'yok', dogrulama_komutu: 'node hedef-var.js' });

async function yurut(kok: string, l: IsListesi) {
  const satirlar: string[] = [];
  const r = await listeyiYurut({ kok, liste: l, saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: (s) => satirlar.push(s), denemeSiniri: 5, kotaBeklemeMs: 10 });
  const defter = new Defter(kok);
  const isler = r.isler.map((x) => defter.rapor({ is_id: x.is_id }).is!);
  defter.kapat();
  return { r, isler, satirlar };
}

test('KABUL is dolar tavani: tavan asilinca is "belirsiz (butce)" kapanir, liste sonraki isle surer', async () => {
  ayarYaz(BETIKLER, {}); // yalniz ayar okunur
  const kok = proje();
  ayarYaz(kok, { bekci_dongu: false });
  const { r, isler } = await yurut(kok, { ajan: 'savurgan', is_butce_usd: 1, isler: [is('bir'), { ...is('iki'), ajan: 'pahali' }] });
  assert.equal(isler[0]!.durum, 'belirsiz');
  assert.match(isler[0]!.gerekce ?? '', /^butce: is dolar tavani \(1 USD\) doldu \(harcanan 1\.2 USD\)/);
  assert.equal(r.isler[0]!.deneme, 3, '0.4 + 0.4 + 0.4 >= 1: dorduncu oturum acilmadi');
  assert.equal(isler[1]!.durum, 'gecti');
  assert.equal(r.durdu, undefined);
});

test('KABUL liste dolar tavani: tavan asilinca liste durur, kalan isler baslatilmaz, yeniden baslatinca kaldigi yerden', async () => {
  const kok = proje();
  const l: IsListesi = { ajan: 'pahali', butce_usd: 0.7, isler: [is('a'), is('b'), is('c')] };
  writeFileSync(join(kok, 'hedef-var.js'), "process.exit(require('node:fs').existsSync('hedef.txt') ? 0 : 1);");
  const { r, satirlar } = await yurut(kok, l);
  assert.match(r.durdu ?? '', /liste dolar tavani \(0\.7 USD\) doldu/);
  assert.equal(r.isler.length, 3 - 1, 'ucuncu is baslatilmadi');
  assert.equal(r.isler[0]!.durum, 'gecti');
  assert.equal(r.isler[1]!.durum, 'gecti');
  assert.ok(satirlar.some((s) => /LISTE DURDU: .*Baslatilmayan is: 1/.test(s)), satirlar.join('\n'));
});

test('is sure tavani: sure dolunca is "butce" gerekcesiyle kapanir', async () => {
  const kok = proje();
  ayarYaz(kok, { bekci_dongu: false });
  const { isler } = await yurut(kok, { ajan: 'savurgan', is_sure_tavani_dk: 0.000001, isler: [is('x')] });
  assert.equal(isler[0]!.durum, 'belirsiz');
  assert.match(isler[0]!.gerekce ?? '', /^butce: is sure tavani/);
});

test('kota: saglayici hiz siniri denemeden sayilmaz, beklenip yeniden denenir; hep reddederse "kota" gerekcesiyle kapanir', async () => {
  const kok = proje();
  const { r, isler, satirlar } = await yurut(kok, { ajan: 'kotali', isler: [is('k')] });
  assert.equal(isler[0]!.durum, 'gecti');
  assert.equal(r.isler[0]!.deneme, 1, 'kota beklemesi deneme sayilmadi');
  assert.ok(satirlar.some((s) => /model saglayicisi hatasi .*beklenip yeniden denenecek \(1\/4\)/.test(s)));

  const kok2 = proje();
  const b = await yurut(kok2, { ajan: 'hephata', kota_bekleme_sayisi: 2, isler: [is('h')] });
  assert.equal(b.isler[0]!.durum, 'belirsiz');
  assert.match(b.isler[0]!.gerekce ?? '', /^kota: model saglayicisi 2 beklemeden sonra da reddetti/);
});

test('KABUL yikici komut: proje disini / kokunu silen ve gecmisi ezen komutlar reddedilir; proje ici silme serbest', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-yikici-'));
  const red = [
    'rm -rf /', 'rm -rf ~', 'rm -rf ..', 'rm -fr ../baska', 'rm -r -f .', 'rm -rf $HOME/x', 'rm -rf C:\\Windows',
    'Remove-Item -Recurse -Force C:\\Users', 'Remove-Item -Path .. -Recurse', 'rd /s /q C:\\', 'del /s /q ..\\*',
    'git reset --hard', 'git reset --hard HEAD~3', 'git push --force', 'git push -f origin main', 'git clean -fd', 'git clean -fdx',
    'cd alt; rm -rf ../..', '"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command "Remove-Item -Recurse -Force ..\\\\x"',
    'format C:',
  ];
  for (const k of red) assert.ok(yikiciKomut(k, kok), `reddedilmeliydi: ${k}`);
  const serbest = [
    'rm -rf dist', 'rm -rf ./node_modules', 'rm dosya.txt', 'Remove-Item -Recurse build', 'git reset --soft HEAD~1', 'git push',
    'git push --force-with-lease', 'git clean -n', 'npm test', 'rm -rf src/eski', 'git status',
  ];
  for (const k of serbest) assert.equal(yikiciKomut(k, kok), null, `serbest olmaliydi: ${k}`);
});

test('KABUL yikici komut kancada reddedilir; surucu kipinde de; anahtar kapaliyken gecer', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-yikici-kanca-'));
  const kos = (komut: string, env: Record<string, string> = {}): string =>
    spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', KAPI_BIN, 'claude', 'arac', '--kok', kok],
      { input: JSON.stringify({ session_id: 's', tool_name: 'Bash', tool_input: { command: komut } }), encoding: 'utf8', env: { ...process.env, ...env } }).stdout;
  const red = JSON.parse(kos('rm -rf ..')) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
  assert.equal(red.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(red.hookSpecificOutput.permissionDecisionReason, /yikici komut reddedildi: rm \.\.: proje kokunu ya da proje disini siler/);
  assert.match(kos('git reset --hard', { MIHENK_SURUCU: '1' }), /"deny"/);
  assert.equal(kos('rm -rf dist'), '');
  assert.match(readFileSync(join(kok, '.mihenk', 'kapi.jsonl'), 'utf8'), /yikici_engel/);
  ayarYaz(kok, { bekci_yikici: false });
  assert.equal(kos('rm -rf ..'), '');
  assert.ok(existsSync(join(kok, 'mihenk.json')));
});
