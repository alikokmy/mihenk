// Temiz kaldirma olcutu (IS_PLANI "Temiz kaldirma"): kur ardindan kaldir sonrasi proje bayt bayt kurulum oncesi gibi;
// kurulumdan sonra kullanicinin ekledigi korunuyor; ikinci kaldirma bir sey degistirmiyor; yeniden kurulum calisiyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Defter } from '../src/defter.js';
import { kaldir } from '../src/kaldir.js';
import { kur } from '../src/kur.js';

const yeni = (): string => mkdtempSync(join(tmpdir(), 'mihenk-kaldir-'));
const arsiv = (): string => mkdtempSync(join(tmpdir(), 'mihenk-arsiv-'));

/** .git disindaki her dosyanin ozeti ve her dizin: projenin bayt bayt fotografi. */
function fotograf(kok: string, d = ''): Record<string, string> {
  const sonuc: Record<string, string> = {};
  for (const g of readdirSync(join(kok, d))) {
    if (d === '' && g === '.git') continue;
    const yol = d === '' ? g : `${d}/${g}`;
    if (statSync(join(kok, yol)).isDirectory()) {
      sonuc[yol + '/'] = 'dizin';
      Object.assign(sonuc, fotograf(kok, yol));
    } else {
      sonuc[yol] = createHash('sha256').update(readFileSync(join(kok, yol))).digest('hex');
    }
  }
  return sonuc;
}

function doluProje(): string {
  const kok = yeni();
  const yaz = (g: string, m: string): void => {
    mkdirSync(join(kok, g, '..'), { recursive: true });
    writeFileSync(join(kok, g), m);
  };
  yaz('AGENTS.md', '# Kendi kurallarim\r\n\r\nTestleri calistir.\r\n'); // CRLF ve sondaki satir sonu korunmali
  yaz('CLAUDE.md', 'Claude icin notum.'); // sonda satir sonu yok
  yaz('.gitignore', 'node_modules\n*.log');
  yaz('.claude/settings.json', JSON.stringify({ model: 'opus', hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo benim' }] }] } }));
  yaz('.codex/config.toml', 'model = "gpt"\n\n[mcp_servers.baska]\ncommand = "x"\n');
  yaz('.gemini/settings.json', '{\n    "theme": "koyu"\n}\n');
  yaz('opencode.json', '{"$schema":"https://opencode.ai/config.json"}');
  yaz('kilo.json', '{"model": "kilo/kilo-auto/free"}');
  yaz('src/kod.js', 'module.exports = 1;\n');
  for (const a of [['init', '-q'], ['config', 'user.email', 'k@ornek.test'], ['config', 'user.name', 'k'], ['config', 'core.autocrlf', 'false'], ['add', '-A'], ['commit', '-q', '-m', 'ilk']]) {
    spawnSync('git', a, { cwd: kok, windowsHide: true });
  }
  return kok;
}

test('KABUL: bos projede (git yok) kur + kaldir sonrasi proje bayt bayt ayni', () => {
  const kok = yeni();
  writeFileSync(join(kok, 'not.txt'), 'merhaba');
  const once = fotograf(kok);
  kur(kok);
  assert.ok(existsSync(join(kok, '.claude', 'skills')));
  const s = kaldir(kok, { arsivDizini: arsiv() });
  assert.deepEqual(fotograf(kok), once);
  assert.equal(s.defter, 'defter yoktu');
  assert.ok(s.silinen.includes('AGENTS.md') && s.silinen.includes('mihenk-kaldir.cmd'));
});

test('KABUL: dolu projede (kendi AGENTS.md, CLAUDE.md, kancasi, ayarlari) kur + kaldir sonrasi her dosya bayt bayt ayni, git temiz', () => {
  const kok = doluProje();
  const once = fotograf(kok);
  kur(kok);
  assert.notDeepEqual(fotograf(kok), once);
  const s = kaldir(kok, { arsivDizini: arsiv() });
  assert.deepEqual(fotograf(kok), once);
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: kok, encoding: 'utf8' }).stdout, '');
  assert.ok(s.geri_yuklenen.includes('AGENTS.md') && s.geri_yuklenen.includes('.claude/settings.json'));
  assert.deepEqual(s.ayiklanan, []);
});

test('kurulumdan sonra kullanicinin degisiklikleri korunur; yalniz mihenk parcasi cikar', () => {
  const kok = doluProje();
  kur(kok);
  writeFileSync(join(kok, 'AGENTS.md'), readFileSync(join(kok, 'AGENTS.md'), 'utf8') + '\nYeni kuralim.\n');
  const ayar = JSON.parse(readFileSync(join(kok, '.claude', 'settings.json'), 'utf8'));
  ayar.hooks.Stop.push({ hooks: [{ type: 'command', command: 'echo bitti' }] });
  ayar.tema = 'acik';
  writeFileSync(join(kok, '.claude', 'settings.json'), JSON.stringify(ayar));
  const s = kaldir(kok, { arsivDizini: arsiv() });
  assert.ok(s.ayiklanan.includes('AGENTS.md') && s.ayiklanan.includes('.claude/settings.json'));
  const agents = readFileSync(join(kok, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# Kendi kurallarim/);
  assert.match(agents, /Yeni kuralim\./);
  assert.doesNotMatch(agents, /mihenk/);
  const son = JSON.parse(readFileSync(join(kok, '.claude', 'settings.json'), 'utf8'));
  assert.equal(son.tema, 'acik');
  assert.equal(son.model, 'opus');
  assert.deepEqual(son.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo bitti' }] }]);
  assert.equal(son.hooks.PreToolUse.length, 1);
  assert.equal(son.hooks.SessionStart, undefined);
  assert.doesNotMatch(JSON.stringify(son), /kapi-bin/);
});

test('iki kurulum arasinda kullanicinin yaptigi degisiklik yedege donulerek silinmez', () => {
  const kok = doluProje();
  kur(kok);
  const ayar = JSON.parse(readFileSync(join(kok, '.claude', 'settings.json'), 'utf8'));
  ayar.tema = 'acik';
  writeFileSync(join(kok, '.claude', 'settings.json'), JSON.stringify(ayar));
  kur(kok); // dosyayi yeniden yazar (tema korunur); yedek artik gecersiz
  kaldir(kok, { arsivDizini: arsiv() });
  const son = JSON.parse(readFileSync(join(kok, '.claude', 'settings.json'), 'utf8'));
  assert.equal(son.tema, 'acik');
  assert.doesNotMatch(JSON.stringify(son), /kapi-bin/);
});

test('kullanilmis defter proje disina tasinir (proje temiz kalir); --defter-dahil ile silinir', () => {
  for (const defterDahil of [false, true]) {
    const kok = doluProje();
    const once = fotograf(kok);
    kur(kok);
    const defter = new Defter(kok);
    defter.isAc({ tur: 't', soru: 's', beklenti: 'b', yanlissa: 'y', dogrulama_komutu: 'node -v', ajan: 'a', model: 'm' });
    defter.kapat();
    const a = arsiv();
    const s = kaldir(kok, { arsivDizini: a, defterDahil });
    assert.deepEqual(fotograf(kok), once);
    const tasinan = readdirSync(a);
    if (defterDahil) {
      assert.equal(s.defter, 'defter silindi');
      assert.deepEqual(tasinan, []);
    } else {
      assert.match(s.defter, /defter proje disina tasindi/);
      assert.equal(tasinan.length, 1);
      assert.ok(existsSync(join(a, tasinan[0]!, 'defter.db')));
      assert.ok(!existsSync(join(a, tasinan[0]!, 'kurulum.json')));
    }
  }
});

test('kaldirma ikinci kez bir sey degistirmez; kaldirdiktan sonra yeniden kurulup yeniden temiz kaldirilir', () => {
  const kok = doluProje();
  const once = fotograf(kok);
  kur(kok);
  kaldir(kok, { arsivDizini: arsiv() });
  const ikinci = kaldir(kok, { arsivDizini: arsiv() });
  assert.deepEqual([ikinci.silinen, ikinci.geri_yuklenen, ikinci.ayiklanan], [[], [], []]);
  assert.deepEqual(fotograf(kok), once);
  kur(kok);
  assert.ok(existsSync(join(kok, '.codex', 'hooks.json')));
  kaldir(kok, { arsivDizini: arsiv() });
  assert.deepEqual(fotograf(kok), once);
});

test('cift tiklanan mihenk-kaldir.cmd (Windows): proje bayt bayt eski haline doner, kendini de siler, hata yazmaz', { skip: process.platform !== 'win32' }, () => {
  const kok = doluProje();
  const once = fotograf(kok);
  kur(kok);
  const env = { ...process.env, LOCALAPPDATA: arsiv() };
  const r = spawnSync('cmd.exe', ['/d', '/c', `"${join(kok, 'mihenk-kaldir.cmd')}" < nul`], { encoding: 'utf8', env, windowsVerbatimArguments: true });
  assert.doesNotMatch(r.stdout + r.stderr, /cannot be found|bulunamad/i);
  assert.match(r.stdout, /eski haline dondu/);
  assert.deepEqual(fotograf(kok), once);
});

test('kurulum kaydi olmayan eski kurulum: mihenk parcalari yine cikarilir', () => {
  const kok = doluProje();
  kur(kok);
  rmSync(join(kok, '.mihenk'), { recursive: true, force: true });
  const s = kaldir(kok, { arsivDizini: arsiv() });
  assert.ok(s.birakilan.some((b) => b.includes('kurulum kaydi yok')));
  assert.doesNotMatch(readFileSync(join(kok, 'AGENTS.md'), 'utf8'), /mihenk/);
  assert.match(readFileSync(join(kok, 'AGENTS.md'), 'utf8'), /Kendi kurallarim/);
  assert.ok(!existsSync(join(kok, '.claude', 'skills')));
  assert.ok(!existsSync(join(kok, 'mihenk-kaldir.cmd')));
  assert.doesNotMatch(readFileSync(join(kok, '.claude', 'settings.json'), 'utf8'), /kapi-bin/);
  assert.match(readFileSync(join(kok, '.claude', 'settings.json'), 'utf8'), /echo benim/);
});
