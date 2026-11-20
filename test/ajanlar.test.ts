// Ajan araclarinin cikti okuyuculari. Ornek satirlar 2026-11-20'deki gercek kosulardan alindi (kisaltildi):
// Claude Code 2.1.326 --output-format stream-json, Codex CLI 0.170.0 exec --json, OpenCode 2.3.2 run --format json.
// Arac surumu degisip alan adlari kayarsa bu test kalir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE, CLINE, CODEX, KILO, OPENCODE, QWEN } from '../src/ajanlar.js';

test('Cline: run_result toplam kullanimi, maliyeti ve modeli verir (gercek satir, Cline 3.0.74); MCP dosyasi proje icinden', () => {
  const satir = { type: 'run_result', finishReason: 'error', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 },
    aggregateUsage: { inputTokens: 1200, outputTokens: 80, cacheReadTokens: 300, cacheWriteTokens: 0, totalCost: 0.0123 }, durationMs: 268, text: 'Unauthorized', model: { id: 'anthropic/claude-sonnet-5.5', provider: 'cline' } };
  assert.deepEqual(CLINE.kullanimKatkisi?.(satir), {
    tur: 'toplam', girdi: 1200, onbellek_okuma: 300, onbellek_yazma: 0, cikti: 80, maliyet_usd: 0.0123, model: 'anthropic/claude-sonnet-5.5',
  });
  assert.equal(CLINE.metinOku(satir), 'Unauthorized');
  assert.match(CLINE.ortam!('C:/proje').CLINE_MCP_SETTINGS_PATH!, /proje[\\/]\.cline[\\/]mcp_settings\.json$/);
});

test('Qwen Code (DENENMEDI, belgeye gore): bassiz komut', () => {
  assert.deepEqual(QWEN.argumanlar('x'), ['-p', 'x', '--yolo', '--output-format', 'stream-json']);
});

test('Kilo Code: OpenCode bicimi; model adi step_finish icinden (gercek satir, Kilo CLI 7.8.27)', () => {
  const satir = { type: 'step_finish', part: { type: 'step-finish', reason: 'stop', model: { providerID: 'kilo', modelID: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
    cost: 0, tokens: { total: 20474, input: 20448, output: 3, reasoning: 23, cache: { read: 0, write: 0 } } } };
  assert.deepEqual(KILO.kullanimKatkisi?.(satir), {
    tur: 'artis', girdi: 20448, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 26, maliyet_usd: 0, model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  });
  assert.deepEqual(KILO.argumanlar('x').slice(0, 6), ['run', '--auto', '--format', 'json', '-m', 'kilo/kilo-auto/free']);
});

test('Claude Code: "result" olayi oturum toplamini, dolar maliyetini ve modeli verir', () => {
  const satir = {
    type: 'result', total_cost_usd: 0.20296779999999998,
    usage: { input_tokens: 14, cache_creation_input_tokens: 16263, cache_read_input_tokens: 255839, output_tokens: 1082 },
    modelUsage: { 'claude-opus-5-5': { costUSD: 0.20296779999999998 } },
  };
  assert.deepEqual(CLAUDE.kullanimKatkisi?.(satir), {
    tur: 'toplam', girdi: 14, onbellek_okuma: 255839, onbellek_yazma: 16263, cikti: 1082, maliyet_usd: 0.20296779999999998, model: 'claude-opus-5-5',
  });
  assert.deepEqual(CLAUDE.kullanimKatkisi?.({ type: 'system', subtype: 'init', model: 'claude-opus-5-5' }), { tur: 'artis', model: 'claude-opus-5-5' });
  assert.equal(CLAUDE.kullanimKatkisi?.({ type: 'assistant' }), undefined);
});

test('Codex: tur sonu kullanimi; girdiden onbellek ayrilir; maliyet bildirmez', () => {
  const satir = { type: 'turn.completed', usage: { input_tokens: 143225, cached_input_tokens: 133632, cache_write_input_tokens: 0, output_tokens: 1444, reasoning_output_tokens: 424 } };
  assert.deepEqual(CODEX.kullanimKatkisi?.(satir), { tur: 'artis', girdi: 9593, onbellek_okuma: 133632, onbellek_yazma: 0, cikti: 1444 });
});

test('OpenCode: adim sonu token ve maliyet; akil yurutme tokenlari ciktiya eklenir', () => {
  const satir = { type: 'step_finish', part: { type: 'step-finish', cost: 0, tokens: { input: 6671, output: 82, reasoning: 514, cache: { read: 3840, write: 0 } } } };
  assert.deepEqual(OPENCODE.kullanimKatkisi?.(satir), { tur: 'artis', girdi: 6671, onbellek_okuma: 3840, onbellek_yazma: 0, cikti: 596, maliyet_usd: 0 });
  assert.equal(OPENCODE.kullanimKatkisi?.({ type: 'text' }), undefined);
});
