// Surum 0.4 (Asama 25) kabul olcutu: internetsiz ortamda OpenCode + yerel OpenAI-uyumlu model (Qwen/DeepSeek yerine sahte sunucu).
// Kurulumun yazdigi opencode.json ile mihenk'in bes araci modele dogrudan arac olarak gider (Code Mode kapali); model mihenk_is_ac
// cagirinca kayit deftere duser. Dis istekler olu bir vekile yonlendirilir; gercek bir modele istem gonderilmez.
// OpenCode bu bilgisayarda yoksa test atlanir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OPENCODE } from '../src/ajanlar.js';
import { kur } from '../src/kur.js';

const oc = OPENCODE.komutBul();

test('KABUL OpenCode + yerel model, internet kesik: mihenk araclari dogrudan gider ve is_ac deftere yazar', { skip: oc ? false : 'OpenCode yok', timeout: 180_000 }, async () => {
  const istekler: { yol: string; govde: string }[] = [];
  const yaz = (r: ServerResponse, parcalar: unknown[]): void => {
    r.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const p of parcalar) r.write(`data: ${JSON.stringify(p)}\n\n`);
    r.end('data: [DONE]\n\n');
  };
  const parca = (delta: unknown, bitis: string | null) => ({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'qwen3-coder', choices: [{ index: 0, delta, finish_reason: bitis }], ...(bitis ? { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } : {}) });
  const sunucu = createServer((q: IncomingMessage, r) => {
    let g = '';
    q.on('data', (c) => (g += c));
    q.on('end', () => {
      istekler.push({ yol: q.url ?? '', govde: g });
      const govde = JSON.parse(g || '{}') as { tools?: { function?: { name?: string } }[]; messages?: { role?: string }[] };
      const araclar = (govde.tools ?? []).map((t) => t.function?.name);
      // Ilk asamada model mihenk_is_ac cagirir; aracin yaniti gelince "tamam" der.
      if (araclar.includes('mihenk_is_ac') && !(govde.messages ?? []).some((m) => m.role === 'tool')) {
        const args = JSON.stringify({ tur: 'deneme', soru: 'cevrimdisi deneme', beklenti: 'kayit acilir', yanlissa: 'kayit acilmaz', dogrulama_komutu: 'node --version', ajan: 'opencode', model: 'yerel/qwen3-coder' });
        yaz(r, [parca({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'mihenk_is_ac', arguments: args } }] }, null), parca({}, 'tool_calls')]);
      } else yaz(r, [parca({ role: 'assistant', content: 'tamam' }, null), parca({}, 'stop')]);
    });
  });
  await new Promise<void>((s) => sunucu.listen(0, '127.0.0.1', s));
  try {
    const port = (sunucu.address() as { port: number }).port;
    const proje = mkdtempSync(join(tmpdir(), 'mihenk-oc-yerel-'));
    const saglayici = { yerel: { npm: '@ai-sdk/openai-compatible', name: 'Yerel', options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: 'yok' }, models: { 'qwen3-coder': { name: 'Qwen3 Coder', tool_call: true } } } };
    writeFileSync(join(proje, 'opencode.json'), JSON.stringify({ provider: saglayici, model: 'yerel/qwen3-coder', small_model: 'yerel/qwen3-coder', share: 'disabled', autoupdate: false }));
    kur(proje, { araclar: ['opencode'] });

    const olu = 'http://127.0.0.1:9';
    const env = { ...process.env, HTTP_PROXY: olu, HTTPS_PROXY: olu, http_proxy: olu, https_proxy: olu, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_AUTOUPDATE: '1' };
    // stdin kapali olmali: acik kalirsa "opencode run" mesaji stdin'den bekler ve hic ilerlemez.
    const o = spawn(oc!.program, [...oc!.onEk, 'run', '--standalone', '--auto', '--format', 'json', '-m', 'yerel/qwen3-coder', 'merhaba'], { cwd: proje, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let cikti = '';
    o.stdout.on('data', (c) => (cikti += c));
    const kod = await new Promise<number | null>((s) => o.on('exit', s));
    assert.equal(kod, 0, cikti.slice(-500));

    const sohbet = istekler.filter((x) => x.yol.endsWith('/chat/completions'));
    assert.ok(sohbet.length >= 2, 'istekler yerel sunucuya gitti');
    const araclar = (JSON.parse(sohbet[0]!.govde).tools as { function: { name: string } }[]).map((t) => t.function.name);
    for (const a of ['is_ac', 'hukum_ver', 'kanit_ekle', 'karar_yaz', 'rapor']) assert.ok(araclar.includes(`mihenk_${a}`), `mihenk_${a} dogrudan arac`);

    const db = new DatabaseSync(join(proje, '.mihenk', 'defter.db'), { readOnly: true });
    const isler = db.prepare('select tur, ajan, istemci from isler').all() as { tur: string; ajan: string; istemci: string }[];
    db.close();
    assert.equal(isler.length, 1);
    assert.equal(isler[0]!.tur, 'deneme');
    assert.match(isler[0]!.istemci, /^opencode/);
  } finally {
    sunucu.close();
  }
});
