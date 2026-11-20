// Asama 17 kabul olcutu: kanca, proje kokune konmus sahte node.cmd'yi calistirmaz; PATH'te node yokken de calisir;
// her SKILL.md boyut sinirinin altinda (Claude Code sikistirmada uzun skill'i keser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kur } from '../src/kur.js';

const PAKET = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'paket');
const windows = process.platform !== 'win32';
// Gercek kosul: Claude Code gibi bazi ortamlar NoDefaultCurrentDirectoryInExePath=1 tanimlar ve cmd'nin calisilan klasorde aramasini kapatir;
// kullanicinin cift tikladigi normal ortamda bu degisken yoktur. Testler onu kaldirarak kosar.
const gercekOrtam = (ek: Record<string, string> = {}): NodeJS.ProcessEnv => { const e: NodeJS.ProcessEnv = { ...process.env, ...ek }; delete e.NoDefaultCurrentDirectoryInExePath; return e; };

function tuzakliProje(): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-saglamlik-'));
  kur(kok, { araclar: ['codex', 'claude'] });
  // Saldirgan proje kokune sahte node koyar: calisirsa isaret dosyasi birakir.
  writeFileSync(join(kok, 'node.cmd'), '@echo off\r\necho sahte> "%~dp0sahte-node-calisti.txt"\r\n');
  writeFileSync(join(kok, 'node.bat'), '@echo off\r\necho sahte> "%~dp0sahte-node-calisti.txt"\r\n');
  return kok;
}

test('saldiri gercek: yalniz adiyla "node" cagiran kabuk komutu projedeki sahte node.cmd\'yi calistirir', { skip: windows }, () => {
  const kok = tuzakliProje();
  spawnSync('cmd.exe', ['/d', '/s', '/c', '"node -v"'], { cwd: kok, windowsVerbatimArguments: true, encoding: 'utf8', env: gercekOrtam() });
  assert.ok(existsSync(join(kok, 'sahte-node-calisti.txt')), 'beklenen: cmd once calisilan klasorde arar');
});

test('KABUL: Codex kancasi (kabukta kosan dizge komut) sahte node.cmd\'yi calistirmaz', { skip: windows }, () => {
  const kok = tuzakliProje();
  const komut = JSON.parse(readFileSync(join(kok, '.codex', 'hooks.json'), 'utf8')).hooks.SessionStart[0].hooks[0].command as string;
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `"${komut}"`], { cwd: kok, windowsVerbatimArguments: true, encoding: 'utf8', input: JSON.stringify({ session_id: 's1' }), env: gercekOrtam() });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(kok, 'sahte-node-calisti.txt')), 'sahte node calismadi');
  assert.match(readFileSync(join(kok, '.mihenk', 'kapi.jsonl'), 'utf8'), /oturum_basladi/, 'gercek kanca calisti');
});

test('KABUL: PATH\'te node yokken de kanca calisir (mutlak yol)', { skip: windows }, () => {
  const kok = tuzakliProje();
  const komut = JSON.parse(readFileSync(join(kok, '.codex', 'hooks.json'), 'utf8')).hooks.SessionStart[0].hooks[0].command as string;
  const env = gercekOrtam({ PATH: 'C:\\Windows\\System32', Path: 'C:\\Windows\\System32' });
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `"${komut}"`], { cwd: join(kok, '.codex'), windowsVerbatimArguments: true, encoding: 'utf8', input: JSON.stringify({ session_id: 's2' }), env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(kok, '.mihenk', 'kapi.jsonl'), 'utf8'), /"oturum":"s2"/);
});

test('KABUL: Claude Code kancasi ve MCP kaydi da node\'u mutlak yolla cagirir; cift tiklanan dosyalar da', () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-saglamlik-'));
  kur(kok, { araclar: ['claude'] });
  const ayar = JSON.parse(readFileSync(join(kok, '.claude', 'settings.json'), 'utf8'));
  for (const olay of ['SessionStart', 'Stop', 'PreToolUse']) assert.match(ayar.hooks[olay][0].hooks[0].command, /[\\/]node(\.exe)?$/i);
  assert.match(JSON.parse(readFileSync(join(kok, '.mcp.json'), 'utf8')).mcpServers.mihenk.command, /[\\/]node(\.exe)?$/i);
  if (process.platform === 'win32') {
    for (const cmd of readdirSync(kok).filter((x) => x.endsWith('.cmd'))) {
      assert.doesNotMatch(readFileSync(join(kok, cmd), 'utf8'), /^node /m, `${cmd}: node yalniz adiyla cagrilmamali`);
    }
  }
});

test('KABUL: her SKILL.md 20.000 baytin altinda', () => {
  const skiller = readdirSync(join(PAKET, 'skills'));
  assert.ok(skiller.length >= 7);
  for (const s of skiller) {
    const boy = statSync(join(PAKET, 'skills', s, 'SKILL.md')).size;
    assert.ok(boy < 20_000, `${s}: ${boy} bayt`);
  }
});
