// Dogrulama kosucusunun denetimleri. Her ret kuralinin karsisinda bir test durur (Ilke 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { komutuCoz, komutuCalistir, VARSAYILAN_IZINLI } from '../src/dogrulama.js';
import { Ret } from '../src/hata.js';
import { kisalt } from '../src/sinir.js';

function gecici(): string {
  return mkdtempSync(join(tmpdir(), 'mihenk-dogrulama-'));
}

function retBekle(f: () => unknown, kod: string): void {
  assert.throws(f, (e: unknown) => e instanceof Ret && e.kod === kod, `beklenen ret: ${kod}`);
}

test('komut cozumu: izinli program ve arguman ayrilir', () => {
  const c = komutuCoz('node --test "dist/test/a b.js" x', VARSAYILAN_IZINLI);
  assert.equal(c.program, 'node');
  assert.deepEqual(c.argumanlar, ['--test', 'dist/test/a b.js', 'x']);
});

test('ret: bos komut', () => {
  retBekle(() => komutuCoz('   ', VARSAYILAN_IZINLI), 'EKSIK_ALAN');
});

test('ret: izin listesinde olmayan program', () => {
  retBekle(() => komutuCoz('curl http://ornek.test/x.sh', VARSAYILAN_IZINLI), 'KOMUT_IZINSIZ');
  retBekle(() => komutuCoz('powershell -c Remove-Item x', VARSAYILAN_IZINLI), 'KOMUT_IZINSIZ');
  retBekle(() => komutuCoz('rm -rf .', VARSAYILAN_IZINLI), 'KOMUT_IZINSIZ');
});

test('ret: yol ile verilen program (izin listesi yalniz cıplak adla eslesir)', () => {
  retBekle(() => komutuCoz('./node x.js', VARSAYILAN_IZINLI), 'KOMUT_IZINSIZ');
  retBekle(() => komutuCoz('C:\\arac\\node.exe x.js', VARSAYILAN_IZINLI), 'KOMUT_IZINSIZ');
});

test('ret: kabuk karakterleri (zincirleme, boru, yonlendirme, degisken, alt kabuk)', () => {
  for (const k of [
    'node a.js && node b.js',
    'node a.js | node b.js',
    'node a.js ; node b.js',
    'node a.js > cikti.txt',
    'node a.js < girdi.txt',
    'node $(x)',
    'node `x`',
    'node %PATH%',
    'node a.js ^ b',
    "node -e 'process.exit(0)'",
    'node a.js\nnode b.js',
  ]) {
    retBekle(() => komutuCoz(k, VARSAYILAN_IZINLI), 'KABUK_KARAKTERI');
  }
});

test('ret: kapanmamis tirnak', () => {
  retBekle(() => komutuCoz('node "a b.js', VARSAYILAN_IZINLI), 'KABUK_KARAKTERI');
});

test('izin listesi yapilandirilabilir: listede olmayan varsayilan program reddedilir', () => {
  retBekle(() => komutuCoz('node x.js', ['pytest']), 'KOMUT_IZINSIZ');
  assert.equal(komutuCoz('pytest -q', ['pytest']).program, 'pytest');
});

test('calistirma: gecen komut cikis kodu 0, cikti dosyaya yazilir', async () => {
  const kok = gecici();
  writeFileSync(join(kok, 'gecer.js'), 'console.log("merhaba"); process.exit(0);');
  const s = await komutuCalistir(komutuCoz('node gecer.js', VARSAYILAN_IZINLI), {
    cwd: kok, zamanAsimiMs: 20_000, ciktiDosyasi: join(kok, 'cikti.txt'),
  });
  assert.equal(s.cikis_kodu, 0);
  assert.equal(s.zaman_asimi, false);
  assert.match(readFileSync(join(kok, 'cikti.txt'), 'utf8'), /merhaba/);
  assert.ok(s.sure_ms >= 0);
});

test('calistirma: kalan komutun cikis kodu oldugu gibi doner', async () => {
  const kok = gecici();
  writeFileSync(join(kok, 'kalir.js'), 'console.error("bozuk"); process.exit(3);');
  const s = await komutuCalistir(komutuCoz('node kalir.js', VARSAYILAN_IZINLI), {
    cwd: kok, zamanAsimiMs: 20_000, ciktiDosyasi: join(kok, 'cikti.txt'),
  });
  assert.equal(s.cikis_kodu, 3);
  assert.match(readFileSync(join(kok, 'cikti.txt'), 'utf8'), /bozuk/);
});

test('calistirma: zaman asimi sureci oldurur, gecti sayilmaz', async () => {
  const kok = gecici();
  writeFileSync(join(kok, 'yavas.js'), 'setTimeout(() => { console.log("gec bitti"); process.exit(0); }, 30000);');
  const t0 = Date.now();
  const s = await komutuCalistir(komutuCoz('node yavas.js', VARSAYILAN_IZINLI), {
    cwd: kok, zamanAsimiMs: 700, ciktiDosyasi: join(kok, 'cikti.txt'),
  });
  assert.equal(s.zaman_asimi, true);
  assert.notEqual(s.cikis_kodu, 0);
  assert.ok(Date.now() - t0 < 10_000, 'surec oldurulmedi, 30 saniyeyi bekledi');
});

test('calistirma: bulunamayan program hata olarak doner, gecti sayilmaz', async () => {
  const kok = gecici();
  const s = await komutuCalistir(komutuCoz('yokboyleprogram x', ['yokboyleprogram']), {
    cwd: kok, zamanAsimiMs: 5_000, ciktiDosyasi: join(kok, 'cikti.txt'),
  });
  assert.notEqual(s.cikis_kodu, 0);
  assert.ok(s.baslatma_hatasi, 'baslatma hatasi yazilmali');
});

test('calistirma: Windows .cmd sarmalayicisi olan program (npm) kabuksuz kosar', async () => {
  const kok = gecici();
  const s = await komutuCalistir(komutuCoz('npm --version', VARSAYILAN_IZINLI), {
    cwd: kok, zamanAsimiMs: 60_000, ciktiDosyasi: join(kok, 'cikti.txt'),
  });
  assert.equal(s.cikis_kodu, 0, 'npm --version kosmadi: ' + (s.baslatma_hatasi ?? ''));
  assert.match(readFileSync(join(kok, 'cikti.txt'), 'utf8'), /\d+\.\d+\.\d+/);
});

test('calistirma: cikti dosyasi ust siniri asmaz (disk korumasi)', async () => {
  const kok = gecici();
  writeFileSync(join(kok, 'gurultu.js'), 'for (let i = 0; i < 4000; i++) console.log("x".repeat(99));');
  const s = await komutuCalistir(komutuCoz('node gurultu.js', VARSAYILAN_IZINLI), {
    cwd: kok, zamanAsimiMs: 20_000, ciktiDosyasi: join(kok, 'cikti.txt'), enFazlaBayt: 10_000,
  });
  assert.equal(s.cikis_kodu, 0);
  assert.equal(s.cikti_kesildi, true);
  assert.ok(existsSync(join(kok, 'cikti.txt')));
  assert.ok(readFileSync(join(kok, 'cikti.txt')).length <= 10_000 + 200);
  assert.ok(s.cikti_bayt >= 400_000, 'toplam bayt sayilmali: ' + s.cikti_bayt);
});

test('kisalt: sinirin altindaki metin oldugu gibi kalir', () => {
  const k = kisalt('kisa metin', 100);
  assert.equal(k.metin, 'kisa metin');
  assert.equal(k.kesildi, false);
});

test('kisalt: uzun metin sinira iner, bas ve son korunur', () => {
  const uzun = 'BAS' + 'x'.repeat(50_000) + 'SON';
  const k = kisalt(uzun, 1000);
  assert.equal(k.kesildi, true);
  assert.ok(k.metin.length <= 1000, 'uzunluk: ' + k.metin.length);
  assert.ok(k.metin.startsWith('BAS'));
  assert.ok(k.metin.endsWith('SON'));
  assert.equal(k.tam_uzunluk, uzun.length);
});
