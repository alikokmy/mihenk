// Surum 0.4 (Asama 24) kabul olcutu: cevrimdisi paket, acildigi baska bir klasorde PATH'te Node yokken ve deponun node_modules'una
// erismeden calisir: kurulum, doktor, MCP sunucusu (bes arac); kurulumun yazdigi ayarlar paketin node.exe'sini cagirir; kodda internete
// giden cagri yoktur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { paketle, uretimPaketleri } from '../src/paketle.js';

const KAYNAK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const windows = process.platform !== 'win32';

test('kodda internete giden cagri yok (yalniz pencerenin kendi yerel sunucusu)', () => {
  for (const d of readdirSync(KAYNAK).filter((x) => x.endsWith('.ts'))) {
    const govde = readFileSync(join(KAYNAK, d), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/from 'node:https'|require\('https'\)|from 'node:net'|from 'node:dgram'|from 'node:tls'/.test(govde), `${d}: ag modulu`);
    if (d !== 'pencere-sayfa.ts') assert.ok(!/\bfetch\(/.test(govde), `${d}: fetch`);
    assert.ok(!/\bnpx\b|npm install/.test(govde.replace(/'[^']*npm install[^']*'/g, '')), `${d}: calisma aninda paket kurulumu`);
  }
});

test('uretim bagimliliklari kilit dosyasindan; gelistirme araclari pakete girmez', () => {
  const p = uretimPaketleri();
  assert.ok(p.includes('node_modules/@modelcontextprotocol/server') && p.includes('node_modules/zod'));
  assert.ok(!p.some((x) => /typescript|@types\/node|@modelcontextprotocol\/client/.test(x)), p.join(','));
});

test('KABUL: zip baska klasore acilinca PATH\'te Node yokken kurulum, doktor ve MCP sunucusu calisir', { skip: windows, timeout: 240_000 }, async () => {
  const cikis = mkdtempSync(join(tmpdir(), 'mihenk-paket-'));
  const p = paketle(cikis);
  assert.ok(p.zip && existsSync(p.zip), 'zip uretildi');
  // Zip'i depodan ve paketin yapildigi yerden ayri bir klasore ac.
  const acilan = mkdtempSync(join(tmpdir(), 'mihenk-acilan-'));
  assert.equal(spawnSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'), ['-x', '-f', p.zip!, '-C', acilan]).status, 0);
  const kok = join(acilan, readdirSync(acilan)[0]!);
  for (const g of ['node/node.exe', 'Mihenk-Ac.cmd', 'mihenk.cmd', 'Projeye-kur.cmd', 'KURULUM.txt', 'app/dist/src/cli.js', 'app/paket/AGENTS.md', 'app/node_modules/@modelcontextprotocol/server/package.json']) {
    assert.ok(existsSync(join(kok, g)), g);
  }
  // PATH'te node yok; Claude Code gibi ortamlarin koydugu arama degiskeni de yok (gercek kullanici ortami).
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows', Path: 'C:\\Windows\\System32;C:\\Windows' };
  delete env.NoDefaultCurrentDirectoryInExePath;
  delete env.NODE_OPTIONS;
  const proje = join(acilan, 'projem');
  mkdirSync(proje);
  const kur = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${join(kok, 'mihenk.cmd')}" kur --hedef "${proje}" --arac opencode,claude"`], { env, encoding: 'utf8', windowsVerbatimArguments: true });
  assert.equal(kur.status, 0, kur.stdout + kur.stderr);
  const oc = JSON.parse(readFileSync(join(proje, 'opencode.json'), 'utf8'));
  const komut = oc.mcp.servers.mihenk.command as string[];
  assert.ok(komut[0]!.toLowerCase().startsWith(kok.replace(/\\/g, '/').toLowerCase()), `MCP paketin node'unu cagirir: ${komut[0]}`);
  const doktor = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${join(kok, 'mihenk.cmd')}" doktor --hedef "${proje}""`], { env, encoding: 'utf8', windowsVerbatimArguments: true });
  assert.match(doktor.stdout, /\[TAMAM\] OpenCode: defter baglantisi/);
  // MCP sunucusu paketin node'u ve paketin bagimliliklariyla baslar ve bes araci sunar.
  const istemci = new Client({ name: 'cevrimdisi-deneme', version: '1.0.0' });
  await istemci.connect(new StdioClientTransport({ command: komut[0]!, args: komut.slice(1), env: env as Record<string, string>, stderr: 'pipe' }));
  try {
    assert.deepEqual((await istemci.listTools()).tools.map((x) => x.name).sort(), ['hukum_ver', 'is_ac', 'kanit_ekle', 'karar_yaz', 'rapor']);
  } finally {
    await istemci.close();
  }

  // Asama 31: tek giris dosyasi. Mihenk-Ac.cmd paketin node'u ile "ac" calistirir; baslangic ekranindan bos klasore kurulup acilir.
  const giris = readFileSync(join(kok, 'Mihenk-Ac.cmd'), 'utf8');
  assert.match(giris, /start "[^"]*" \/min "%~dp0node\\node\.exe" .*"%~dp0app\\dist\\src\\cli\.js" ac/);
  const veri = mkdtempSync(join(tmpdir(), 'mihenk-paket-veri-'));
  const sunucu = spawn(join(kok, 'node', 'node.exe'), ['--disable-warning=ExperimentalWarning', join(kok, 'app', 'dist', 'src', 'cli.js'), 'ac', '--acma', '--port', '47830'],
    { env: { ...env, MIHENK_VERI_DIZINI: veri }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    const url = await new Promise<URL>((ok, red) => {
      let s = '';
      sunucu.stdout.on('data', (p: Buffer) => { s += p.toString(); const m = /(http:\/\/127\.0\.0\.1:\d+\/\?anahtar=[0-9a-f]+)/.exec(s); if (m) ok(new URL(m[1]!)); });
      sunucu.on('exit', () => red(new Error('sunucu kapandi: ' + s)));
    });
    const api = async (yol: string, govde?: unknown) => {
      const r = await fetch(new URL(yol, url), { method: govde === undefined ? 'GET' : 'POST', headers: { 'x-mihenk-anahtar': url.searchParams.get('anahtar')!, 'content-type': 'application/json' }, ...(govde === undefined ? {} : { body: JSON.stringify(govde) }) });
      return r.json() as Promise<any>;
    };
    assert.equal((await api('/api/durum')).secim, true, 'baslangic ekrani');
    const yeni = join(acilan, 'fikrim');
    mkdirSync(yeni);
    assert.equal((await api('/api/proje', { kok: yeni, kur: true })).kurulu, true);
    assert.equal((await api('/api/durum')).proje.kok, yeni);
    const oc2 = JSON.parse(readFileSync(join(yeni, 'opencode.json'), 'utf8'));
    assert.ok(oc2.mcp.servers.mihenk.command[0].toLowerCase().startsWith(kok.replace(/\\/g, '/').toLowerCase()), 'paketin node.exe si');
    assert.ok(existsSync(join(veri, 'son-projeler.json')), 'son projeler kullanicinin uygulama verisinde');
  } finally {
    sunucu.kill();
  }
});
