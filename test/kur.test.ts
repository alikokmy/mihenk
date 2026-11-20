// Kurulum komutunun denetimleri: paket bir projeye dogru yerlere kurulur, var olani ezmez, ikinci kosuda degisiklik yapmaz.
// Yollar araclarin kendi belgelerinden dogrulandi (2026-11-19; kaynaklar IS_PLANI.md "Asama 2").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadSkills } from '@modelcontextprotocol/server/ext/skills/node';
import { kur } from '../src/kur.js';

function hedef(): string {
  return mkdtempSync(join(tmpdir(), 'mihenk-kur-'));
}

const oku = (...yol: string[]): string => readFileSync(join(...yol), 'utf8');

test('kur: skiller iki dizine kurulur ve resmi denetleyiciden gecer', async () => {
  const h = hedef();
  kur(h);
  // Claude Code yalniz .claude/skills okur; Codex, Gemini CLI ve Antigravity .agents/skills okur.
  for (const dizin of ['.claude/skills', '.agents/skills']) {
    const katalog = await loadSkills(join(h, dizin), { strict: true });
    assert.equal(katalog.entries.length, 7, dizin);
    assert.ok(existsSync(join(h, dizin, 'mihenk-is-kaydi', 'SKILL.md')));
  }
});

test('kur: kapi kancalari Claude Code ve Codex icin yazilir; baska kancalar korunur; ikinci kurulum cogaltmaz', () => {
  const h = hedef();
  mkdirSync(join(h, '.claude'));
  const baska = { matcher: 'Write', hooks: [{ type: 'command', command: 'echo baska' }] };
  writeFileSync(join(h, '.claude', 'settings.json'), JSON.stringify({ model: 'x', hooks: { PreToolUse: [baska] } }));
  kur(h, { araclar: ['claude', 'codex'] });
  const sonuc = kur(h, { araclar: ['claude', 'codex'] });
  assert.ok(sonuc.degismeyen.includes('.claude/settings.json') && sonuc.degismeyen.includes('.codex/hooks.json'));
  const claude = JSON.parse(oku(h, '.claude', 'settings.json'));
  assert.equal(claude.model, 'x');
  assert.deepEqual(claude.hooks.PreToolUse[0], baska);
  assert.equal(claude.hooks.PreToolUse.length, 2);
  for (const olay of ['SessionStart', 'Stop']) assert.equal(claude.hooks[olay].length, 1);
  const stop = claude.hooks.Stop[0].hooks[0];
  assert.equal(stop.command, 'node');
  assert.deepEqual(stop.args.slice(2, 4), ['claude', 'bitir']);
  const codex = JSON.parse(oku(h, '.codex', 'hooks.json'));
  assert.match(codex.hooks.Stop[0].hooks[0].command, /kapi-bin\.js" codex bitir --kok "/);
  assert.equal(codex.hooks.PreToolUse[0].matcher, '^Bash$');
  assert.ok(sonuc.uyarilar.some((u) => u.includes('/hooks')));
});

test('kur: Kilo Code kaydi proje icindeki kilo.json\'a, aracin kendi bicimiyle (mcp.<ad>, command dizisi) yazilir', () => {
  const h = hedef();
  kur(h, { araclar: ['kilo'] });
  const n = JSON.parse(oku(h, 'kilo.json'));
  assert.equal(n.mcp.mihenk.type, 'local');
  assert.equal(n.mcp.mihenk.command[0], 'node');
  assert.match(n.mcp.mihenk.command[1], /bin\.js$/);
  assert.ok(existsSync(join(h, '.agents', 'skills', 'mihenk-is-kaydi', 'SKILL.md')));
});

test('kur: Cline (skill .cline/skills, MCP proje icinde) ve Qwen Code (.qwen/settings.json: MCP ve kapi kancasi) kurulur ve temiz kaldirilir', async () => {
  const h = hedef();
  kur(h, { araclar: ['cline', 'qwen'] });
  assert.ok(existsSync(join(h, '.cline', 'skills', 'mihenk-is-kaydi', 'SKILL.md')));
  assert.match(JSON.parse(oku(h, '.cline', 'mcp_settings.json')).mcpServers.mihenk.args[0], /bin\.js$/);
  const q = JSON.parse(oku(h, '.qwen', 'settings.json'));
  assert.equal(q.mcpServers.mihenk.command, 'node');
  assert.match(q.hooks.Stop[0].hooks[0].command, /kapi-bin\.js" qwen bitir/);
  assert.equal(q.hooks.PreToolUse[0].matcher, 'run_shell_command');
  const { kaldir } = await import('../src/kaldir.js');
  kaldir(h, { arsivDizini: hedef() });
  assert.deepEqual(readdirSync(h), []);
});

test('kur: her aracin MCP ayari kendi dosyasina, kendi biciminde yazilir', () => {
  const h = hedef();
  kur(h);
  // Antigravity proje duzeyinde MCP'yi eklenti icinden okur: plugin.json isaret dosyasidir.
  assert.equal(JSON.parse(oku(h, '.agents/plugins/mihenk/plugin.json')).name, 'mihenk');
  for (const dosya of ['.mcp.json', '.gemini/settings.json', '.agents/plugins/mihenk/mcp_config.json']) {
    const sunucu = JSON.parse(oku(h, dosya)).mcpServers.mihenk;
    assert.equal(sunucu.command, 'node', dosya);
    assert.match(sunucu.args[0], /bin\.js$/, dosya);
    assert.deepEqual(sunucu.args.slice(1, 2), ['--kok'], dosya);
  }
  const toml = oku(h, '.codex/config.toml');
  assert.match(toml, /\[mcp_servers\.mihenk\]\ncommand = "node"\nargs = \[".*bin\.js", "--kok", ".*"\]/);
  // OpenCode 2.3.2: mcp.servers.<ad>, komut ve argumanlar tek dizide (aracin kendi "mcp add" ciktisindaki bicim).
  const oc = JSON.parse(oku(h, 'opencode.json')).mcp.servers.mihenk;
  assert.equal(oc.type, 'local');
  assert.equal(oc.command[0], 'node');
  assert.match(oc.command[1], /bin\.js$/);
  assert.equal(oc.command[2], '--kok');
});

test('kur: AGENTS.md blogu yazilir; Claude Code ve Gemini CLI AGENTS.md okuyacak sekilde ayarlanir', () => {
  const h = hedef();
  kur(h);
  assert.match(oku(h, 'AGENTS.md'), /<!-- mihenk:basla -->[\s\S]*`hukum_ver`[\s\S]*<!-- mihenk:bitti -->/);
  assert.match(oku(h, 'CLAUDE.md'), /^@AGENTS\.md$/m);
  assert.ok(JSON.parse(oku(h, '.gemini/settings.json')).context.fileName.includes('AGENTS.md'));
});

test('kur: var olan icerik korunur (baska MCP sunuculari, AGENTS.md metni, ayarlar, CLAUDE.md)', () => {
  const h = hedef();
  writeFileSync(join(h, '.mcp.json'), JSON.stringify({ mcpServers: { baska: { command: 'x' } } }));
  writeFileSync(join(h, 'AGENTS.md'), '# Benim kurallarim\n\n- Turkce yaz.\n');
  writeFileSync(join(h, 'CLAUDE.md'), '# Proje notlari\n');
  mkdirSync(join(h, '.gemini'));
  writeFileSync(join(h, '.gemini', 'settings.json'), JSON.stringify({ theme: 'koyu', context: { fileName: 'GEMINI.md' } }));
  mkdirSync(join(h, '.codex'));
  writeFileSync(join(h, '.codex', 'config.toml'), 'model = "x"\n\n[mcp_servers.baska]\ncommand = "y"\n');
  kur(h);
  const mcp = JSON.parse(oku(h, '.mcp.json')).mcpServers;
  assert.equal(mcp.baska.command, 'x');
  assert.equal(mcp.mihenk.command, 'node');
  assert.match(oku(h, 'AGENTS.md'), /^# Benim kurallarim\n\n- Turkce yaz\.\n[\s\S]*mihenk:basla/);
  assert.match(oku(h, 'CLAUDE.md'), /^# Proje notlari\n[\s\S]*@AGENTS\.md/);
  const gemini = JSON.parse(oku(h, '.gemini', 'settings.json'));
  assert.equal(gemini.theme, 'koyu');
  assert.deepEqual(gemini.context.fileName, ['GEMINI.md', 'AGENTS.md']);
  const toml = oku(h, '.codex', 'config.toml');
  assert.match(toml, /^model = "x"\n\n\[mcp_servers\.baska\]\ncommand = "y"\n/);
  assert.match(toml, /\[mcp_servers\.mihenk\]/);
});

test('kur: ikinci kosu hicbir dosyayi degistirmez (tekrarlanabilir), blok cogalmaz', () => {
  const h = hedef();
  const ilk = kur(h);
  assert.ok(ilk.yazilan.length > 0);
  const ikinci = kur(h);
  assert.deepEqual(ikinci.yazilan, []);
  assert.equal(oku(h, 'AGENTS.md').split('mihenk:basla').length - 1, 1);
  assert.equal(oku(h, '.codex/config.toml').split('[mcp_servers.mihenk]').length - 1, 1);
  assert.equal(oku(h, 'CLAUDE.md').split('@AGENTS.md').length - 1, 1);
});

test('kur: yalniz secilen araca kurar', () => {
  const h = hedef();
  kur(h, { araclar: ['claude'] });
  assert.ok(existsSync(join(h, '.claude/skills/mihenk-is-kaydi/SKILL.md')));
  assert.ok(existsSync(join(h, '.mcp.json')));
  assert.ok(!existsSync(join(h, '.agents')));
  assert.ok(!existsSync(join(h, '.codex')));
  assert.ok(!existsSync(join(h, '.gemini')));
  assert.ok(!existsSync(join(h, 'opencode.json')));
});

test('kur: yalniz hedef projenin icine yazar (kuresel ayar, yonetici izni gerektiren yer yok)', () => {
  const h = hedef();
  const sonuc = kur(h);
  for (const goreli of [...sonuc.yazilan, ...sonuc.degismeyen]) {
    assert.ok(!goreli.startsWith('..') && !/^([A-Za-z]:|[\\/])/.test(goreli), `proje disina yazildi: ${goreli}`);
    assert.ok(existsSync(join(h, goreli)), `yazildi denen dosya yok: ${goreli}`);
  }
});

test('kur: defter klasorunu .gitignore\'a ekler (var olani koruyarak), ornek is listesi ve Windows\'ta baslatma dosyasi yazar', async () => {
  const h = hedef();
  writeFileSync(join(h, '.gitignore'), 'node_modules/');
  kur(h, { araclar: ['codex'] });
  assert.equal(oku(h, '.gitignore'), 'node_modules/\n.mihenk/\n');
  // Ornek liste surucunun okuyabildigi bicimdedir.
  const { listeOku } = await import('../src/surucu.js');
  const ornek = listeOku(join(h, 'mihenk-isler.ornek.json'));
  assert.equal(ornek.isler.length, 1);
  assert.equal(ornek.saklama, 'yerel');
  if (process.platform === 'win32') {
    const baslat = oku(h, 'mihenk-baslat.cmd');
    assert.match(baslat, /node --disable-warning=ExperimentalWarning ".*cli\.js" sur --hedef "%~dp0\."/);
    assert.match(baslat, /pause/);
  }
  assert.deepEqual(kur(h, { araclar: ['codex'] }).yazilan, [], 'ikinci kosuda degisiklik olmamali');
});

test('kur: bozuk JSON ayar dosyasini ezmez, hata verir', () => {
  const h = hedef();
  writeFileSync(join(h, '.mcp.json'), '{ bozuk');
  assert.throws(() => kur(h, { araclar: ['claude'] }), /\.mcp\.json/);
  assert.equal(oku(h, '.mcp.json'), '{ bozuk');
});

test('kur: yazilan MCP ayariyla sunucu gercekten baslar ve bes araci sunar (uctan uca)', async () => {
  const h = hedef();
  kur(h, { araclar: ['claude'] });
  const ayar = JSON.parse(oku(h, '.mcp.json')).mcpServers.mihenk as { command: string; args: string[] };
  const istemci = new Client({ name: 'kurulum-denetimi', version: '1.0.0' });
  await istemci.connect(new StdioClientTransport({ command: ayar.command, args: ayar.args, stderr: 'pipe' }));
  try {
    assert.equal((await istemci.listTools()).tools.length, 5);
    const r = await istemci.callTool({ name: 'rapor', arguments: {} });
    assert.notEqual(r.isError, true);
    assert.ok(existsSync(join(h, '.mihenk', 'defter.db')), 'defter hedef projenin icinde acilmali');
  } finally {
    await istemci.close();
  }
});
