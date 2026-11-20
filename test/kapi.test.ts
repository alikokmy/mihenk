// Asama 7 kabul olcutu 1: "kanitsiz 'bitti' denemesi reddediliyor". Kapinin her kuralinin karsisinda bir test (Ilke 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Defter } from '../src/defter.js';
import { bilesikCommitMi, commitMi, ENGEL_SINIRI, kapiDenetimi, oturumBaslat } from '../src/kapi.js';

const KAPI_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'kapi-bin.js');

function proje(): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-kapi-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  writeFileSync(join(kok, '.gitignore'), '.mihenk/\ndist/\n');
  for (const a of [['init', '-q'], ['config', 'user.email', 'k@ornek.test'], ['config', 'user.name', 'k'], ['add', '-A'], ['commit', '-q', '-m', 'ilk']]) {
    spawnSync('git', a, { cwd: kok, windowsHide: true });
  }
  // Kurulum dosyalari oturumdan once yazilmis sayilsin.
  const once = new Date(Date.now() - 3600_000);
  for (const d of ['gecer.js', 'kalir.js', '.gitignore']) utimesSync(join(kok, d), once, once);
  return kok;
}

const gecmis = (): Date => new Date(Date.now() - 2000);
const girdi = (komut: string) => ({ tur: 'hata_duzeltme', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: komut, ajan: 'claude', model: 'm' });
const olaylar = (kok: string): string[] => readFileSync(join(kok, '.mihenk', 'kapi.jsonl'), 'utf8').trim().split('\n').map((s) => (JSON.parse(s) as { olay: string }).olay);

test('degisiklik yoksa bitirmeye izin var (soru yanitlayan oturum)', () => {
  const kok = proje();
  oturumBaslat(kok, 'o1', 'claude', gecmis());
  assert.equal(kapiDenetimi(kok, 'o1', 'claude', 'bitir').izin, true);
});

test('dosya degisti, defter kaydi yok: bitirme reddedilir ve ne yapilacagi soylenir', () => {
  const kok = proje();
  oturumBaslat(kok, 'o1', 'claude', gecmis());
  writeFileSync(join(kok, 'kod.js'), 'module.exports = 1;');
  const k = kapiDenetimi(kok, 'o1', 'claude', 'bitir');
  assert.equal(k.izin, false);
  assert.deepEqual(k.degisen, ['kod.js']);
  assert.match(k.neden, /Kanitsiz "bitti" kabul edilmez: is_ac/);
});

test('git yok saydigi dosya (dist/) ve .mihenk degisiklik sayilmaz', () => {
  const kok = proje();
  oturumBaslat(kok, 'o1', 'claude', gecmis());
  mkdirSync(join(kok, 'dist'));
  writeFileSync(join(kok, 'dist', 'cikti.js'), 'x');
  assert.equal(kapiDenetimi(kok, 'o1', 'claude', 'bitir').izin, true);
});

test('son degisiklikten sonra hukum_ver ile kapanan kayit varsa izin var; "kaldi" da yeter', async () => {
  const kok = proje();
  oturumBaslat(kok, 'o1', 'claude', gecmis());
  writeFileSync(join(kok, 'kod.js'), 'module.exports = 1;');
  const defter = new Defter(kok);
  const is = defter.isAc(girdi('node kalir.js'));
  await defter.hukumVer({ is_id: is.id, hukum: 'kaldi', gerekce: 'cozulemedi' });
  assert.equal(kapiDenetimi(kok, 'o1', 'claude', 'bitir').izin, true);

  // Kapanistan sonra yeni degisiklik: kanit eskidi, yine engel.
  await new Promise((r) => setTimeout(r, 20));
  writeFileSync(join(kok, 'kod.js'), 'module.exports = 2;');
  assert.equal(kapiDenetimi(kok, 'o1', 'claude', 'bitir').izin, false);
  const is2 = defter.isAc(girdi('node gecer.js'));
  await defter.hukumVer({ is_id: is2.id });
  defter.kapat();
  assert.equal(kapiDenetimi(kok, 'o1', 'claude', 'bitir').izin, true);
});

test('oturumda acilip kapanmamis is varsa bitirme reddedilir', () => {
  const kok = proje();
  oturumBaslat(kok, 'o1', 'claude', gecmis());
  const defter = new Defter(kok);
  const is = defter.isAc(girdi('node gecer.js'));
  defter.kapat();
  const k = kapiDenetimi(kok, 'o1', 'claude', 'bitir');
  assert.equal(k.izin, false);
  assert.deepEqual(k.acik_isler, [is.id]);
  assert.match(k.neden, /hukum_ver ile kapatin/);
});

test(`ust uste ${ENGEL_SINIRI} engelden sonra gecit verilir ve "kapi_atlandi" kaydedilir`, () => {
  const kok = proje();
  oturumBaslat(kok, 'o1', 'claude', gecmis());
  writeFileSync(join(kok, 'kod.js'), 'x');
  for (let n = 0; n < ENGEL_SINIRI; n++) assert.equal(kapiDenetimi(kok, 'o1', 'claude', 'bitir').izin, false);
  const k = kapiDenetimi(kok, 'o1', 'claude', 'bitir');
  assert.equal(k.izin, true);
  assert.equal(k.atlandi, true);
  assert.ok(olaylar(kok).includes('kapi_atlandi'));
});

test('mihenk.json "kapi": false kapiyi kapatir ve her gecis kaydedilir', () => {
  const kok = proje();
  oturumBaslat(kok, 'o1', 'claude', gecmis());
  writeFileSync(join(kok, 'mihenk.json'), '{"kapi": false}');
  assert.equal(kapiDenetimi(kok, 'o1', 'claude', 'bitir').izin, true);
  assert.ok(olaylar(kok).includes('kapi_kapali'));
});

test('oturum basi kaydi yoksa onceki degisiklikler bu oturuma yuklenmez', () => {
  const kok = proje();
  writeFileSync(join(kok, 'eski.js'), 'x');
  const az = new Date(Date.now() - 1000); // dosya sistemi saati Node saatinden birkac ms ileride olabilir
  utimesSync(join(kok, 'eski.js'), az, az);
  assert.equal(kapiDenetimi(kok, 'yeni', 'claude', 'bitir').izin, true);
});

test('commit komutu taninir', () => {
  for (const k of ['git commit -m x', 'git -C . commit -am "x"', 'git.exe commit', 'cd a; git commit -m x', 'git --no-pager commit', 'git -c a=b commit']) assert.ok(commitMi(k), k);
  for (const k of ['git status', 'git log --grep commit', 'echo commit', 'npm test', 'git show HEAD:commit.txt']) assert.ok(!commitMi(k), k);
});

test('degisiklikle ayni satirdaki commit reddedilir (Codex denemesindeki gercek komut); yalniz git add ile birlikte olan kabul', () => {
  const codex = '"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command "Set-Content -LiteralPath .\\\\topla.js -Value \\"x\\"; git add -- topla.js; git commit -m \\"Fix\\""';
  assert.ok(bilesikCommitMi(codex));
  assert.ok(bilesikCommitMi('sed -i s/a/b/ x.js && git commit -am x'));
  for (const k of ['git commit -m x', 'git add -A && git commit -m x', 'cd alt; git add x; git commit -m y',
    '"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command "git add -- topla.js; git commit -m \\"Fix\\""']) {
    assert.ok(!bilesikCommitMi(k), k);
  }
  const kok = proje();
  oturumBaslat(kok, 'o1', 'codex', gecmis());
  const k = kapiDenetimi(kok, 'o1', 'codex', 'commit', new Date(), true);
  assert.equal(k.izin, false);
  assert.match(k.neden, /ayni satirda calistirilamaz/);
});

test('kanca girisi (Claude Code / Codex bicimi): Stop engeli, commit reddi, baska komuta sessizlik', () => {
  const kok = proje();
  const kos = (olay: string, veri: object): string =>
    spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', KAPI_BIN, 'claude', olay, '--kok', kok], { input: JSON.stringify(veri), encoding: 'utf8' }).stdout;
  assert.equal(kos('oturum', { session_id: 's1', hook_event_name: 'SessionStart' }), '');
  // Oturum basi ile degisiklik ayni milisaniyeye dusmesin.
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},30)']);
  writeFileSync(join(kok, 'kod.js'), 'x');
  const dur = JSON.parse(kos('bitir', { session_id: 's1', stop_hook_active: false })) as { decision: string; reason: string };
  assert.equal(dur.decision, 'block');
  assert.match(dur.reason, /^mihenk kapisi: is bitmis sayilmadi/);
  const red = JSON.parse(kos('arac', { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } })) as any;
  assert.equal(red.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(red.hookSpecificOutput.permissionDecisionReason, /commit engellendi/);
  assert.equal(kos('arac', { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm test' } }), '');
  // Surucu kipinde isi surucu kapatir: kapi engellemez, yalniz kaydeder.
  const surucu = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', KAPI_BIN, 'claude', 'bitir', '--kok', kok],
    { input: JSON.stringify({ session_id: 's2' }), encoding: 'utf8', env: { ...process.env, MIHENK_SURUCU: '1' } });
  assert.equal(surucu.stdout, '');
  assert.ok(olaylar(kok).includes('surucu_kipi'));
});
