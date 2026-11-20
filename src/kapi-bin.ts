#!/usr/bin/env node
// Arac kancasinin girisi: node kapi-bin.js <arac> <olay> --kok <proje>
//   olay: oturum (SessionStart), bitir (Stop), arac (PreToolUse; yalniz git commit denetlenir)
// Girdi stdin'den aracin JSON'u; cikti aracin bekledigi bicimde. Claude Code ve Codex ayni bicimi kullanir
// (Stop: {"decision":"block","reason"}; PreToolUse: hookSpecificOutput.permissionDecision "deny").
// Kapinin kendi hatasi oturumu kilitlememek icin gecit verir ve .mihenk/kapi.jsonl'a "kapi_hatasi" yazar.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bilesikCommitMi, commitMi, kapiDenetimi, oturumBaslat } from './kapi.js';

const [arac = 'bilinmiyor', olay = ''] = process.argv.slice(2);
const i = process.argv.indexOf('--kok');
const girdi = ((): Record<string, any> => {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}') as Record<string, any>;
  } catch {
    return {};
  }
})();
const kok = resolve(i >= 0 ? process.argv[i + 1]! : process.env.CLAUDE_PROJECT_DIR ?? girdi.cwd ?? process.cwd());
const oturum = String(girdi.session_id ?? girdi.sessionId ?? 'adsiz');

try {
  if (process.env.MIHENK_SURUCU === '1') {
    // Surucu kipi: isi surucu dogrular ve kapatir; ajan kendisi hukum veremez (SURUCU_ISI). Kapi burada yalniz kaydeder.
    if (olay === 'bitir') {
      appendFileSync(join(kok, '.mihenk', 'kapi.jsonl'), JSON.stringify({ zaman: new Date().toISOString(), olay: 'surucu_kipi', arac, oturum }) + '\n');
    }
  } else if (olay === 'oturum') {
    oturumBaslat(kok, oturum, arac);
  } else if (olay === 'bitir') {
    const k = kapiDenetimi(kok, oturum, arac, 'bitir');
    if (!k.izin) process.stdout.write(JSON.stringify({ decision: 'block', reason: k.neden }));
  } else if (olay === 'arac') {
    const komut = girdi.tool_input?.command;
    const metin = Array.isArray(komut) ? komut.join(' ') : String(komut ?? '');
    if (commitMi(metin)) {
      const k = kapiDenetimi(kok, oturum, arac, 'commit', new Date(), bilesikCommitMi(metin));
      if (!k.izin) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: k.neden },
        }));
      }
    }
  }
} catch (e) {
  try {
    mkdirSync(join(kok, '.mihenk'), { recursive: true });
    appendFileSync(join(kok, '.mihenk', 'kapi.jsonl'),
      JSON.stringify({ zaman: new Date().toISOString(), olay: 'kapi_hatasi', arac, kanca: olay, hata: e instanceof Error ? e.message : String(e) }) + '\n');
  } catch {
    // yazilamadi
  }
}
process.exitCode = 0;
