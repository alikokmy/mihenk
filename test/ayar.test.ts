// Asama 9 kabul olcutu: her anahtar icin kapaliyken etkisi yok, acikken var; ac-kapa-ac dosyalari bayt bayt ayni birakiyor;
// menu yonetici izni istemeden calisiyor (duz node sureci). Baglam yuku olculen degerle uyusuyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ARAC_ADLARI, AYARLAR, ayarlariOku } from '../src/ayar.js';
import { ayarDegistir, baglamYuku, MCP_ARAC_TANIMI_KARAKTER } from '../src/ayar-cli.js';
import { kapiDenetimi, oturumBaslat } from '../src/kapi.js';
import { ARACLAR, kur } from '../src/kur.js';
import { saklamaKipiSec, uyanikIstendiMi } from '../src/surucu.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const yeni = (): string => mkdtempSync(join(tmpdir(), 'mihenk-ayar-'));

/** .git ve .mihenk disindaki her dosyanin ozeti ve her dizin. */
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

function kurulu(): string {
  const kok = yeni();
  writeFileSync(join(kok, 'AGENTS.md'), '# benim kurallarim\n');
  kur(kok, { esitle: true });
  return kok;
}

const ARAC_DOSYASI: Record<string, string> = {
  claude: '.mcp.json', codex: '.codex/config.toml', gemini: '.gemini/settings.json', antigravity: '.agents/plugins/mihenk/mcp_config.json',
  opencode: 'opencode.json', kilo: 'kilo.json', cline: '.cline/mcp_settings.json', qwen: '.qwen/settings.json',
};
const mihenkVar = (kok: string, g: string): boolean => existsSync(join(kok, g)) && readFileSync(join(kok, g), 'utf8').includes('mihenk');

test('ayar listesi her araci kapsiyor; varsayilanlar bugunku davranis', () => {
  assert.deepEqual(Object.keys(ARAC_ADLARI), [...ARACLAR]);
  const a = ayarlariOku(yeni());
  assert.equal(a.kapi, true);
  assert.equal(a.saklama, 'yerel');
  assert.equal(a.uyanik_tut, false);
  assert.ok(ARACLAR.every((x) => a[`arac_${x}`] === true));
});

test('KABUL: her arac anahtari: kapaliyken o aracin dosyasi yok, acikken var; ac-kapa-ac bayt bayt ayni', () => {
  const kok = kurulu();
  const once = fotograf(kok);
  for (const arac of ARACLAR) {
    assert.ok(mihenkVar(kok, ARAC_DOSYASI[arac]!), `${arac} acikken kurulu`);
    ayarDegistir(kok, `arac_${arac}`, false);
    assert.ok(!mihenkVar(kok, ARAC_DOSYASI[arac]!), `${arac} kapaliyken kurulu degil`);
    for (const baska of ARACLAR.filter((x) => x !== arac)) assert.ok(mihenkVar(kok, ARAC_DOSYASI[baska]!), `${arac} kapatilinca ${baska} etkilenmedi`);
    ayarDegistir(kok, `arac_${arac}`, true);
    assert.deepEqual(fotograf(kok), once, `${arac} ac-kapa-ac`);
  }
  assert.ok(!existsSync(join(kok, 'mihenk.json')), 'hepsi varsayilanda: mihenk.json kalmaz');
});

test('KABUL: skiller anahtari: kapaliyken hicbir skill dizininde mihenk skill\'i yok; ac-kapa-ac bayt bayt ayni', () => {
  const kok = kurulu();
  const once = fotograf(kok);
  const skillVar = (): boolean => ['.claude/skills', '.agents/skills', '.cline/skills'].some((d) => existsSync(join(kok, d)) && readdirSync(join(kok, d)).some((x) => x.startsWith('mihenk-')));
  assert.ok(skillVar());
  ayarDegistir(kok, 'skiller', false);
  assert.ok(!skillVar());
  assert.ok(mihenkVar(kok, '.mcp.json'), 'skill kapatmak defter baglantisina dokunmaz');
  ayarDegistir(kok, 'skiller', true);
  assert.deepEqual(fotograf(kok), once);
});

test('KABUL: yontem_metni anahtari: kapaliyken AGENTS.md kullanicinin hali, CLAUDE.md yok; ac-kapa-ac bayt bayt ayni', () => {
  const kok = kurulu();
  const once = fotograf(kok);
  ayarDegistir(kok, 'yontem_metni', false);
  assert.equal(readFileSync(join(kok, 'AGENTS.md'), 'utf8'), '# benim kurallarim\n');
  assert.ok(!existsSync(join(kok, 'CLAUDE.md')));
  assert.equal(baglamYuku(kok).yontem_metni, 0);
  ayarDegistir(kok, 'yontem_metni', true);
  assert.deepEqual(fotograf(kok), once);
});

test('KABUL: kapi anahtari: kapaliyken kanitsiz bitis gecer (ve kaydedilir), acikken reddedilir', () => {
  const kok = kurulu();
  const once = new Date(Date.now() - 3600_000);
  for (const d of readdirSync(kok, { recursive: true }) as string[]) {
    try { utimesSync(join(kok, d), once, once); } catch { /* dizin */ }
  }
  oturumBaslat(kok, 'o', 'claude', new Date(Date.now() - 1000));
  writeFileSync(join(kok, 'kod.js'), 'x');
  ayarDegistir(kok, 'kapi', false);
  assert.equal(kapiDenetimi(kok, 'o', 'claude', 'bitir').izin, true);
  assert.match(readFileSync(join(kok, '.mihenk', 'kapi.jsonl'), 'utf8'), /kapi_kapali/);
  ayarDegistir(kok, 'kapi', true);
  assert.equal(kapiDenetimi(kok, 'o', 'claude', 'bitir').izin, false);
});

test('KABUL: saklama ve uyanik_tut anahtarlari surucunun secimini degistirir; liste ve komut satiri onceliklidir', () => {
  const kok = kurulu();
  const liste = { isler: [] };
  assert.equal(saklamaKipiSec({ liste, kok }), 'yerel');
  assert.equal(uyanikIstendiMi({ bayrak: false, liste, kok }), false);
  ayarDegistir(kok, 'saklama', 'yok');
  ayarDegistir(kok, 'uyanik_tut', true);
  assert.equal(saklamaKipiSec({ liste, kok }), 'yok');
  assert.equal(uyanikIstendiMi({ bayrak: false, liste, kok }), true);
  assert.equal(saklamaKipiSec({ liste: { isler: [], saklama: 'yerel_gonder' }, kok }), 'yerel_gonder');
  assert.equal(saklamaKipiSec({ bayrak: 'yerel', liste, kok }), 'yerel');
  assert.equal(uyanikIstendiMi({ bayrak: false, liste: { isler: [], uyanik_tut: false }, kok }), false);
});

test('kullanicinin kendi mihenk.json\'u: ayar ac-kapa sonrasi kendi bicimiyle bayt bayt geri doner; ayar disi alanlara dokunulmaz', () => {
  const kok = yeni();
  const benim = '{ "izinli_programlar": ["node", "npm"] }';
  writeFileSync(join(kok, 'mihenk.json'), benim);
  kur(kok, { esitle: true });
  ayarDegistir(kok, 'kapi', false);
  assert.deepEqual(JSON.parse(readFileSync(join(kok, 'mihenk.json'), 'utf8')), { izinli_programlar: ['node', 'npm'], kapi: false });
  ayarDegistir(kok, 'kapi', true);
  assert.equal(readFileSync(join(kok, 'mihenk.json'), 'utf8'), benim);
});

test('menu (mihenk-ayarlar.cmd\'nin actigi): numara anahtari degistirir, Enter cikar; duz node sureci, yonetici izni yok', () => {
  const kok = kurulu();
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'ayar', '--hedef', kok, '--menu'], { input: '2\nabc\n\n', encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, / 2\. \[ACIK  \] skiller/);
  assert.match(r.stdout, /skiller: KAPALI \(kurulum guncellendi/);
  assert.match(r.stdout, /"abc" bir numara degil/);
  assert.match(r.stdout, /Ayarlar kaydedildi/);
  assert.equal(ayarlariOku(kok).skiller, false);
  assert.ok(!existsSync(join(kok, '.claude', 'skills')));
  if (process.platform === 'win32') assert.ok(existsSync(join(kok, 'mihenk-ayarlar.cmd')));
});

test('baglam yuku: defter araclarinin tanim boyutu gercek sunucudan olculenle %10 icinde', async () => {
  const kok = kurulu();
  const ayar = JSON.parse(readFileSync(join(kok, '.mcp.json'), 'utf8')).mcpServers.mihenk;
  const istemci = new Client({ name: 'baglam-olcumu', version: '1.0.0' });
  await istemci.connect(new StdioClientTransport({ command: ayar.command, args: ayar.args, stderr: 'pipe' }));
  try {
    const olculen = JSON.stringify((await istemci.listTools()).tools).length;
    assert.ok(Math.abs(olculen - MCP_ARAC_TANIMI_KARAKTER) <= olculen * 0.1, `olculen ${olculen}, sabit ${MCP_ARAC_TANIMI_KARAKTER}`);
  } finally {
    await istemci.close();
  }
  const y = baglamYuku(kok);
  assert.ok(y.yontem_metni > 0 && y.skill > 0 && y.mcp > 0);
  assert.equal(y.toplam_token, Math.round((y.yontem_metni + y.skill + y.mcp) / 4));
  assert.ok(AYARLAR.length >= 13);
});
