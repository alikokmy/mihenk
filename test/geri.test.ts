// Asama 13 kabul olcutu: "kaldi" kapanan isin degisiklikleri tek komutla geri aliniyor; baska islerin degisikliklerine dokunulmuyor;
// git'siz projede de calisiyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ayarYaz } from '../src/ayar.js';
import { Defter } from '../src/defter.js';
import { geriAl } from '../src/geri.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

function fotograf(kok: string, d = ''): Record<string, string> {
  const s: Record<string, string> = {};
  for (const g of readdirSync(join(kok, d))) {
    if (d === '' && (g === '.git' || g === '.mihenk')) continue;
    const yol = d === '' ? g : `${d}/${g}`;
    if (statSync(join(kok, yol)).isDirectory()) { s[yol + '/'] = 'dizin'; Object.assign(s, fotograf(kok, yol)); }
    else s[yol] = createHash('sha256').update(readFileSync(join(kok, yol))).digest('hex');
  }
  return s;
}

function proje(git = false): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-geri-'));
  writeFileSync(join(kok, 'a.js'), 'module.exports = 1;\r\n');
  writeFileSync(join(kok, 'b.js'), 'b\n');
  writeFileSync(join(kok, 'eski.js'), 'eski\n');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  if (git) {
    writeFileSync(join(kok, '.gitignore'), '.mihenk/\n');
    for (const a of [['init', '-q'], ['config', 'user.email', 'g@ornek.test'], ['config', 'user.name', 'g'], ['config', 'core.autocrlf', 'false'], ['add', '-A'], ['commit', '-q', '-m', 'ilk']]) {
      spawnSync('git', a, { cwd: kok, windowsHide: true });
    }
  }
  return kok;
}

const girdi = (komut: string) => ({ tur: 't', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: komut, ajan: 'taklit', model: 'm' });

/** Bir isi acar, degisiklikleri yapar, hukumle kapatir. */
async function is(kok: string, yap: () => void, sonuc: 'kaldi' | 'gecti' = 'kaldi'): Promise<number> {
  const defter = new Defter(kok);
  const i = defter.isAc(girdi(sonuc === 'kaldi' ? 'node kalir.js' : 'node gecer.js'));
  yap();
  await defter.hukumVer(sonuc === 'kaldi' ? { is_id: i.id, hukum: 'kaldi', gerekce: 'olmadi' } : { is_id: i.id });
  defter.kapat();
  return i.id;
}

const bozan = (kok: string) => (): void => {
  writeFileSync(join(kok, 'a.js'), 'module.exports = 2;\n');
  mkdirSync(join(kok, 'yeni', 'alt'), { recursive: true });
  writeFileSync(join(kok, 'yeni', 'alt', 'dosya.js'), 'x');
  rmSync(join(kok, 'eski.js'));
};

for (const git of [false, true]) {
  test(`KABUL (${git ? 'git deposu' : "git'siz"}): "kaldi" kapanan isin degistirdigi, ekledigi ve sildigi tek komutla geri alinir`, async () => {
    const kok = proje(git);
    const once = fotograf(kok);
    const id = await is(kok, bozan(kok));
    assert.notDeepEqual(fotograf(kok), once);
    const s = geriAl(kok, id);
    assert.deepEqual(fotograf(kok), once, 'proje isten onceki haline bayt bayt dondu');
    assert.deepEqual(s.geri_yuklenen, ['a.js']);
    assert.deepEqual(s.silinen, ['yeni/alt/dosya.js']);
    assert.deepEqual(s.geri_getirilen, ['eski.js']);
    assert.deepEqual(s.cakisan, []);
    if (git) assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: kok, encoding: 'utf8' }).stdout, '');
  });
}

test('KABUL baska islerin degisikliklerine dokunulmaz: sonraki isin dosyasi ve is bittikten sonra degisen dosya korunur', async () => {
  const kok = proje();
  const ilk = await is(kok, () => {
    writeFileSync(join(kok, 'a.js'), 'ilk is\n');
    writeFileSync(join(kok, 'eklenen.js'), 'ilk is ekledi\n');
  });
  await is(kok, () => {
    writeFileSync(join(kok, 'b.js'), 'ikinci is\n');
    writeFileSync(join(kok, 'eklenen.js'), 'ikinci is de degistirdi\n');
  }, 'gecti');
  const s = geriAl(kok, ilk);
  assert.equal(readFileSync(join(kok, 'a.js'), 'utf8'), 'module.exports = 1;\r\n', 'ilk isin yalniz kendi dosyasi geri alindi');
  assert.equal(readFileSync(join(kok, 'b.js'), 'utf8'), 'ikinci is\n', 'ikinci isin degisikligi duruyor');
  assert.equal(readFileSync(join(kok, 'eklenen.js'), 'utf8'), 'ikinci is de degistirdi\n', 'sonradan degisen dosyaya dokunulmadi');
  assert.deepEqual(s.cakisan, ['eklenen.js']);
});

test('deneme kipi hicbir seyi degistirmez; ikinci geri alma bir sey yapmaz; acik is ve kapali ayar anlasilir hata verir', async () => {
  const kok = proje();
  const id = await is(kok, bozan(kok));
  const sonra = fotograf(kok);
  const d = geriAl(kok, id, { deneme: true });
  assert.deepEqual(fotograf(kok), sonra);
  assert.deepEqual(d.geri_yuklenen, ['a.js']);
  geriAl(kok, id);
  const ikinci = geriAl(kok, id);
  assert.deepEqual([ikinci.geri_yuklenen, ikinci.silinen, ikinci.geri_getirilen, ikinci.cakisan], [[], [], [], []]);

  const defter = new Defter(kok);
  const acik = defter.isAc(girdi('node gecer.js'));
  defter.kapat();
  assert.throws(() => geriAl(kok, acik.id), /henuz kapanmadi/);
  const kok2 = proje();
  ayarYaz(kok2, { geri_alma: false });
  const id2 = await is(kok2, () => writeFileSync(join(kok2, 'a.js'), 'x'));
  assert.throws(() => geriAl(kok2, id2), /fotograf yok/);
  assert.ok(!existsSync(join(kok2, '.mihenk', 'geri')));
});

test('komut satiri: mihenk geri-al <is> sonucu duz dille yazar', async () => {
  const kok = proje();
  const id = await is(kok, bozan(kok));
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'geri-al', String(id), '--hedef', kok], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /eski haline dondu {3}a\.js/);
  assert.match(r.stdout, /3 dosya geri alindi/);
});

test('KABUL fotograf temizligi: yalniz son N kapanan isin fotografi kalir, kullanilmayan icerik silinir; 0 hicbirini tutmaz', async () => {
  const kok = proje();
  ayarYaz(kok, { geri_alma_sakla: 2 });
  const idler: number[] = [];
  for (let n = 0; n < 4; n++) idler.push(await is(kok, () => writeFileSync(join(kok, 'a.js'), `surum ${n}\n`)));
  const kalan = readdirSync(join(kok, '.mihenk', 'geri')).filter((x) => /-(bas|son)\.json$/.test(x)).sort();
  assert.deepEqual(kalan, [`is-${idler[2]}-bas.json`, `is-${idler[2]}-son.json`, `is-${idler[3]}-bas.json`, `is-${idler[3]}-son.json`]);
  assert.throws(() => geriAl(kok, idler[0]!), /fotograf eskidigi icin silindi/);
  // "surum 0" icerigi artik hicbir fotografta yok: silinmis olmali.
  const nesneler = readdirSync(join(kok, '.mihenk', 'nesneler'), { recursive: true }).filter((x) => String(x).length > 10);
  const icerikler = nesneler.map((x) => readFileSync(join(kok, '.mihenk', 'nesneler', String(x)), 'utf8'));
  assert.ok(!icerikler.includes('surum 0\n'));
  assert.ok(icerikler.includes('surum 3\n'));
  geriAl(kok, idler[3]!); // en sonuncu hala geri alinabilir
  assert.equal(readFileSync(join(kok, 'a.js'), 'utf8'), 'surum 2\n');

  const kok2 = proje();
  ayarYaz(kok2, { geri_alma_sakla: 0 });
  const id = await is(kok2, () => writeFileSync(join(kok2, 'a.js'), 'x'));
  assert.deepEqual(readdirSync(join(kok2, '.mihenk', 'geri')).filter((x) => /-(bas|son)\.json$/.test(x)), []);
  assert.throws(() => geriAl(kok2, id), /fotograf yok/);
});

test('baska bir git deposunun yok sayilan alt klasorundeki proje: fotograf dosyalari gorur, geri alma ve kapi calisir', async () => {
  const ust = mkdtempSync(join(tmpdir(), 'mihenk-ust-depo-'));
  for (const a of [['init', '-q'], ['config', 'user.email', 'u@ornek.test'], ['config', 'user.name', 'u']]) spawnSync('git', a, { cwd: ust });
  writeFileSync(join(ust, '.gitignore'), 'ic/\n');
  const kok = join(ust, 'ic');
  mkdirSync(kok);
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  writeFileSync(join(kok, 'a.txt'), 'once');
  const { kapiDenetimi, oturumBaslat, degisenDosyalar } = await import('../src/kapi.js');
  oturumBaslat(kok, 'o', 'claude', new Date(Date.now() - 1000));
  const id = await is(kok, () => writeFileSync(join(kok, 'a.txt'), 'sonra'));
  assert.deepEqual(degisenDosyalar(kok, 0).map((d) => d.yol).sort(), ['a.txt', 'kalir.js'], 'kapi da dosyalari goruyor');
  const s = geriAl(kok, id);
  assert.deepEqual(s.geri_yuklenen, ['a.txt']);
  assert.equal(readFileSync(join(kok, 'a.txt'), 'utf8'), 'once');
  assert.equal(typeof kapiDenetimi, 'function');
});
