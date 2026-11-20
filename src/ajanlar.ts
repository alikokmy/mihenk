// Ajan araclarinin bassiz (etkilesimsiz) kipleri: surucu isi bunlarla verir.
// Komutlar ve cikti alanlari her aracin kendi yardim ciktisindan ve gercek kosu ciktisindan dogrulandi
// (2026-11-20: Claude Code 2.1.326, Codex CLI 0.170.0, OpenCode 2.3.2). Yeni arac eklenirken ayni yol izlenir; ezberden yazilmaz.
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

export interface Kullanim {
  /** O andaki baglam buyuklugu (token): son adimin girdisi + onbellekten okunan. */
  baglam?: number;
  /** Bu adimda uretilen cikti (token). */
  cikti?: number;
}

export interface AjanTanimi {
  ad: string;
  /** Aracin MCP baglantisinda kendini tanittigi ad (deftere 'istemci' olarak girer); denemelerde gorulen degerlerden. */
  istemci: RegExp;
  /** Calistirilacak program ve basa eklenecek argumanlar; bulunamazsa null. */
  komutBul(): { program: string; onEk: string[] } | null;
  argumanlar(istem: string): string[];
  /** Ciktinin bir satirindan (JSON ise cozulmus hali, degilse ham metin) kullanim bilgisi. */
  kullanimOku(satir: unknown): Kullanim | undefined;
  /** Ciktinin bir satirindan ajanin yazdigi metin (devir notu icin). */
  metinOku(satir: unknown): string | undefined;
}

type Kayit = Record<string, any>;
const nesne = (x: unknown): Kayit | undefined => (x && typeof x === 'object' ? (x as Kayit) : undefined);

function yoldaBul(adlar: string[]): string | null {
  for (const dizin of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ad of adlar) {
      const aday = join(dizin, ad);
      if (existsSync(aday)) return aday;
    }
  }
  return null;
}

function enYeniAltDizin(kok: string): string | null {
  if (!existsSync(kok)) return null;
  const adlar = readdirSync(kok, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  adlar.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return adlar[0] ? join(kok, adlar[0]) : null;
}

const DEFTER_ARACLARI = ['is_ac', 'hukum_ver', 'kanit_ekle', 'karar_yaz', 'rapor'].map((a) => `mcp__mihenk__${a}`);

export const CLAUDE: AjanTanimi = {
  ad: 'claude',
  istemci: /^claude-code/,
  komutBul() {
    const yolda = yoldaBul(process.platform === 'win32' ? ['claude.exe'] : ['claude']);
    if (yolda) return { program: yolda, onEk: [] };
    // Masaustu uygulamasi ikiliyi kendi veri klasorunde tutar: Claude-Data/<paket>/claude-code/<surum>/<kimlik>/claude.exe
    const veri = join(process.env.LOCALAPPDATA ?? '', 'Claude-Data');
    if (!existsSync(veri)) return null;
    for (const paket of readdirSync(veri, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const surum = enYeniAltDizin(join(veri, paket.name, 'claude-code'));
      const kimlik = surum ? enYeniAltDizin(surum) : null;
      if (kimlik && existsSync(join(kimlik, 'claude.exe'))) return { program: join(kimlik, 'claude.exe'), onEk: [] };
    }
    return null;
  },
  argumanlar: (istem) => ['-p', istem, '--max-budget-usd', '1', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    '--no-session-persistence', '--allowedTools', ...DEFTER_ARACLARI, 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  kullanimOku(satir) {
    const k = nesne(nesne(nesne(satir)?.message)?.usage);
    if (!k) return undefined;
    return {
      baglam: (k.input_tokens ?? 0) + (k.cache_read_input_tokens ?? 0) + (k.cache_creation_input_tokens ?? 0),
      cikti: k.output_tokens ?? 0,
    };
  },
  metinOku(satir) {
    const s = nesne(satir);
    if (s?.type === 'result' && typeof s.result === 'string') return s.result;
    const icerik = nesne(s?.message)?.content;
    if (s?.type !== 'assistant' || !Array.isArray(icerik)) return undefined;
    const metin = icerik.filter((p: Kayit) => p?.type === 'text').map((p: Kayit) => String(p.text)).join('\n');
    return metin === '' ? undefined : metin;
  },
};

export const CODEX: AjanTanimi = {
  ad: 'codex',
  istemci: /^codex-mcp-client/,
  komutBul() {
    // npm, Windows'ta codex.cmd sarmalayicisi kurar; .cmd kabuk ister. Kabuga girmemek icin asil betik node ile kosulur.
    const sarmalayici = yoldaBul(process.platform === 'win32' ? ['codex.cmd'] : ['codex']);
    if (!sarmalayici) return null;
    const betik = join(dirname(sarmalayici), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(betik)) return { program: process.execPath, onEk: [betik] };
    return process.platform === 'win32' ? null : { program: sarmalayici, onEk: [] };
  },
  // --trust olmadan projedeki MCP kaydi okunmaz; --approve-for-me olmadan bassiz kipte arac cagrisi reddedilir.
  argumanlar: (istem) => ['exec', '--trust', '--approve-for-me', '--json', istem],
  kullanimOku(satir) {
    // Codex kullanimi yalniz tur sonunda ve toplam olarak verir; canli baglam olcumu yoktur (surucu cikti hacminden tahmin eder).
    const s = nesne(satir);
    const k = s?.type === 'turn.completed' ? nesne(s.usage) : undefined;
    return k ? { cikti: k.output_tokens ?? 0 } : undefined;
  },
  metinOku(satir) {
    const oge = nesne(nesne(satir)?.item);
    return oge?.type === 'agent_message' && typeof oge.text === 'string' ? oge.text : undefined;
  },
};

export const OPENCODE: AjanTanimi = {
  ad: 'opencode',
  istemci: /^opencode/,
  komutBul() {
    const yolda = yoldaBul(process.platform === 'win32' ? ['opencode.exe'] : ['opencode']);
    if (yolda) return { program: yolda, onEk: [] };
    // Masaustu uygulamasi komut satiri aracini kendi icinde tasir.
    const paketli = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'ai.opencode.desktop', 'resources', 'opencode-cli.exe');
    return existsSync(paketli) ? { program: paketli, onEk: [] } : null;
  },
  argumanlar: (istem) => ['run', '--standalone', '--auto', '--format', 'json', istem],
  kullanimOku(satir) {
    const s = nesne(satir);
    const t = s?.type === 'step_finish' ? nesne(nesne(s.part)?.tokens) : undefined;
    if (!t) return undefined;
    return { baglam: (t.input ?? 0) + (nesne(t.cache)?.read ?? 0), cikti: (t.output ?? 0) + (t.reasoning ?? 0) };
  },
  metinOku(satir) {
    const s = nesne(satir);
    const p = s?.type === 'text' ? nesne(s.part) : undefined;
    return typeof p?.text === 'string' ? p.text : undefined;
  },
};

export const AJANLAR: Readonly<Record<string, AjanTanimi>> = { claude: CLAUDE, codex: CODEX, opencode: OPENCODE };
