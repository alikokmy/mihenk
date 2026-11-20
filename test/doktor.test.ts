// Asama 19 kabul olcutu: kasitli bozulan dort kurulum dogru satirda SORUN veriyor; temiz kurulumda hepsi TAMAM; doktor dosya yazmiyor;
// hata paketinde ev dizini yolu, e-posta ve gizli anahtar deseni yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doktor, hataPaketi, temizle } from '../src/doktor.js';
import { kur } from '../src/kur.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

function fotograf(kok: string, d = ''): Record<string, string> {
  const s: Record<string, string> = {};
  if (!existsSync(join(kok, d))) return s;
  for (const g of readdirSync(join(kok, d))) {
    const yol = d === '' ? g : `${d}/${g}`;
    if (statSync(join(kok, yol)).isDirectory()) { s[yol + '/'] = 'dizin'; Object.assign(s, fotograf(kok, yol)); }
    else s[yol] = createHash('sha256').update(readFileSync(join(kok, yol))).digest('hex');
  }
  return s;
}

function kurulu(): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-doktor-'));
  kur(kok, { esitle: true });
  return kok;
}
const durum = (kok: string, kimlik: string, o = {}) => doktor(kok, o).find((x) => x.kimlik === kimlik)?.durum;

test('KABUL temiz kurulum: kurulum, her MCP kaydi ve her kanca TAMAM', () => {
  const kok = kurulu();
  const s = doktor(kok);
  for (const k of ['node', 'kurulum', 'mcp_claude', 'mcp_codex', 'mcp_kilo', 'mcp_opencode', 'kanca_claude', 'kanca_codex', 'kanca_qwen']) {
    assert.equal(s.find((x) => x.kimlik === k)?.durum, 'tamam', k);
  }
});

test('KABUL dort bozuk kurulum dogru satirda SORUN verir ve ne yapilacagini soyler', () => {
  // 1. MCP kaydi silinmis
  const a = kurulu();
  rmSync(join(a, '.mcp.json'));
  assert.equal(durum(a, 'mcp_claude'), 'sorun');
  assert.equal(durum(a, 'mcp_codex'), 'tamam', 'oteki araclar etkilenmez');
  // 2. kanca silinmis
  const b = kurulu();
  rmSync(join(b, '.codex', 'hooks.json'));
  assert.equal(durum(b, 'kanca_codex'), 'sorun');
  // 3. ajan araci yok
  const c = kurulu();
  assert.equal(durum(c, 'araclar', { ajanlar: {} }), 'sorun');
  assert.match(doktor(c, { ajanlar: {} }).find((x) => x.kimlik === 'araclar')!.cozum!, /npm install -g @kilocode\/cli/);
  // 4. eski Node
  assert.equal(durum(c, 'node', { nodeSurumu: '20.11.0' }), 'sorun');
  // ek: kaydin cagirdigi program yok (or. mihenk tasindi)
  const d = kurulu();
  const k = JSON.parse(readFileSync(join(d, 'kilo.json'), 'utf8'));
  k.mcp.mihenk.command[1] = 'C:/yok/bin.js';
  writeFileSync(join(d, 'kilo.json'), JSON.stringify(k));
  const satir = doktor(d).find((x) => x.kimlik === 'mcp_kilo')!;
  assert.equal(satir.durum, 'sorun');
  assert.match(satir.metin, /yok\/bin\.js/);
});

test('KABUL doktor hicbir dosya yazmaz (kurulu olmayan klasorde .mihenk bile olusturmaz)', () => {
  const kok = kurulu();
  const once = fotograf(kok);
  doktor(kok);
  assert.deepEqual(fotograf(kok), once);
  const bos = mkdtempSync(join(tmpdir(), 'mihenk-doktor-bos-'));
  assert.equal(durum(bos, 'kurulum'), 'sorun');
  assert.deepEqual(readdirSync(bos), []);
});

test('komut satiri: doktor sorun varsa 1, yoksa 0 ile cikar', () => {
  const bos = mkdtempSync(join(tmpdir(), 'mihenk-doktor-cli-'));
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'doktor', '--hedef', bos], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[SORUN\] mihenk bu projeye kurulu degil/);
  assert.match(r.stdout, /Ne yapmali: "mihenk kur"/);
});

test('KABUL hata paketi: ev dizini yolu, kullanici adi, e-posta ve anahtarlar temizlenir', () => {
  const kok = kurulu();
  mkdirSync(join(kok, '.mihenk'), { recursive: true });
  const ev = homedir();
  writeFileSync(join(kok, '.mihenk', 'log.jsonl'), [
    JSON.stringify({ yol: join(ev, 'projeler', 'gizli', 'a.js'), mesaj: 'ornek' }),
    JSON.stringify({ api_key: 'gercek-deger-123', token: 'abc', eposta: 'kisi@ornek.com' }),
    'anahtar sk-proj-1234567890abcdefghij ve ghp_abcdefghijklmnopqrstuvwxyz0123 ve AKIAABCDEFGHIJKLMNOP',
  ].join('\n'));
  const yol = hataPaketi(kok);
  const icerik = readFileSync(yol, 'utf8');
  assert.ok(!icerik.toLowerCase().includes(ev.toLowerCase()), 'ev dizini yolu yok');
  assert.ok(!icerik.includes(ev.replace(/\\/g, '/')), 'egik cizgili ev dizini yolu yok');
  for (const gizli of ['gercek-deger-123', 'kisi@ornek.com', 'sk-proj-1234567890abcdefghij', 'ghp_abcdefghijklmnopqrstuvwxyz0123', 'AKIAABCDEFGHIJKLMNOP']) {
    assert.ok(!icerik.includes(gizli), gizli);
  }
  assert.match(icerik, /== doktor ==/);
  assert.match(icerik, /~/);
  assert.equal(temizle('"password": "x"'), '"password": "<gizli>"');
});
