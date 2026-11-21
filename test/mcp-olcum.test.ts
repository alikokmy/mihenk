// MCP baglanti olcumu (2026-11-21): surucu her oturumda aracin deftere ne zaman baglandigini olcer; doktor ozetler. Onlem yok, yalniz olcum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { doktor } from '../src/doktor.js';
import { listeyiYurut } from '../src/surucu.js';

const BETIKLER = mkdtempSync(join(tmpdir(), 'mihenk-mcp-olcum-ajan-'));
const BAGLAN = (ad: string) => `appendFileSync('.mihenk/log.jsonl', JSON.stringify({ zaman: new Date().toISOString(), islem: 'baglanti', asama: 'olay', girdi: { istemci: '${ad} 1.0' } }) + '\\n');`;
const BEKLE = 'await new Promise((r) => setTimeout(r, 400));';
const YAP = "const m = /dosya-\\w+/.exec(process.argv[2] ?? ''); if (m) writeFileSync(m[0] + '.txt', 'x');";
const sahte = (ad: string, govde: string): AjanTanimi => {
  const yol = join(BETIKLER, `${ad}.mjs`);
  writeFileSync(yol, `import { appendFileSync, writeFileSync } from 'node:fs';\n${govde}\n${YAP}\n`);
  return { ad, istemci: new RegExp(`^${ad}`), komutBul: () => ({ program: process.execPath, onEk: [yol] }), argumanlar: (i) => [i], kullanimOku: () => undefined, metinOku: () => undefined };
};
const AJANLAR = {
  zamaninda: sahte('zamaninda', `${BAGLAN('zamaninda')} ${BEKLE} console.log('basladim');`),
  gec: sahte('gec', `console.log('basladim'); ${BEKLE} ${BAGLAN('gec')}`),
  hic: sahte('hic', `console.log('basladim');`),
};

test('KABUL surucu her oturumda baglanti zamanini olcer: zamaninda / ilk ciktidan sonra / hic; doktor ozetler', { timeout: 120_000 }, async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-mcp-olcum-'));
  writeFileSync(join(kok, 'var.js'), "process.exit(require('node:fs').existsSync(process.argv[2] + '.txt') ? 0 : 1);");
  ayarYaz(kok, { bekci_dongu: false });
  const is = (ajan: string) => ({ tur: 'ozellik', soru: `dosya-${ajan} yaz`, beklenti: 'var', yanlissa: 'yok', dogrulama_komutu: `node var.js dosya-${ajan}`, ajan });
  await listeyiYurut({ kok, liste: { isler: [is('zamaninda'), is('gec'), is('hic')] }, saklama: 'yok', ajanlar: AJANLAR, korunanDizinler: [], yaz: () => {} });
  const oturumlar = readFileSync(join(kok, '.mihenk', 'surucu.jsonl'), 'utf8').split('\n').filter((s) => s.includes('"oturum_bitti"')).map((s) => JSON.parse(s) as { ajan: string; mcp_gec: boolean; mcp_baglanti_ms: number | null; ilk_cikti_ms: number | null });
  const b = Object.fromEntries(oturumlar.map((o) => [o.ajan, o]));
  assert.equal(b.zamaninda!.mcp_gec, false);
  assert.ok(b.zamaninda!.mcp_baglanti_ms! < b.zamaninda!.ilk_cikti_ms!);
  assert.equal(b.gec!.mcp_gec, true);
  assert.ok(b.gec!.mcp_baglanti_ms! > b.gec!.ilk_cikti_ms!);
  assert.deepEqual([b.hic!.mcp_gec, b.hic!.mcp_baglanti_ms], [true, null]);
  const satir = doktor(kok).find((x) => x.kimlik === 'mcp_baglanti')!;
  assert.equal(satir.durum, 'bilgi');
  assert.match(satir.metin, /Son 3 surucu oturumunun 2 tanesinde .* \(1 tanesinde hic baglanmadi\)/);
});
