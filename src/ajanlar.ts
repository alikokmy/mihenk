// Ajan araclarinin bassiz (etkilesimsiz) kipleri: surucu isi bunlarla verir.
// Komutlar ve cikti alanlari her aracin kendi yardim ciktisindan ve gercek kosu ciktisindan dogrulandi
// (2026-11-20: Claude Code 2.1.326, Codex CLI 0.170.0, OpenCode 2.3.2). Yeni arac eklenirken ayni yol izlenir; ezberden yazilmaz.
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/**
 * Bir cikti satirinin oturum kullanimina katkisi. "artis": toplama eklenir (adim ya da tur basina bildiren araclar);
 * "toplam": oturumun nihai toplamidir, oncekilerin yerine gecer. girdi, onbellekten okunan tokenlari icermez.
 */
export interface KullanimKatkisi {
  tur: 'artis' | 'toplam';
  girdi?: number;
  onbellek_okuma?: number;
  onbellek_yazma?: number;
  cikti?: number;
  maliyet_usd?: number;
  model?: string;
}

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
  /** Ciktinin bir satirindan token ve maliyet katkisi (Asama 5). Tanimlanmamissa kullanim sifir ve maliyet bilinmiyor kalir. */
  kullanimKatkisi?(satir: unknown): KullanimKatkisi | undefined;
  /** Ajana verilecek ek ortam degiskenleri (or. projedeki MCP ayar dosyasinin yolu). */
  ortam?(cwd: string): Record<string, string>;
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

const sayi = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
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
  kullanimKatkisi(satir) {
    const s = nesne(satir);
    if (s?.type === 'system' && s.subtype === 'init' && typeof s.model === 'string') return { tur: 'artis', model: s.model };
    if (s?.type !== 'result') return undefined;
    const k = nesne(s.usage) ?? {};
    const modeller = Object.keys(nesne(s.modelUsage) ?? {});
    return {
      tur: 'toplam', girdi: sayi(k.input_tokens), onbellek_okuma: sayi(k.cache_read_input_tokens),
      onbellek_yazma: sayi(k.cache_creation_input_tokens), cikti: sayi(k.output_tokens),
      ...(typeof s.total_cost_usd === 'number' ? { maliyet_usd: s.total_cost_usd } : {}),
      ...(modeller[0] ? { model: modeller[0] } : {}),
    };
  },
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
  kullanimKatkisi(satir) {
    const s = nesne(satir);
    const k = s?.type === 'turn.completed' ? nesne(s.usage) : undefined;
    if (!k) return undefined;
    const okuma = sayi(k.cached_input_tokens);
    return { tur: 'artis', girdi: Math.max(0, sayi(k.input_tokens) - okuma), onbellek_okuma: okuma, onbellek_yazma: sayi(k.cache_write_input_tokens), cikti: sayi(k.output_tokens) };
  },
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
  kullanimKatkisi(satir) {
    const s = nesne(satir);
    const p = s?.type === 'step_finish' ? nesne(s.part) : undefined;
    const t = nesne(p?.tokens);
    if (!p || !t) return undefined;
    return {
      tur: 'artis', girdi: sayi(t.input), onbellek_okuma: sayi(nesne(t.cache)?.read), onbellek_yazma: sayi(nesne(t.cache)?.write),
      cikti: sayi(t.output) + sayi(t.reasoning), ...(typeof p.cost === 'number' ? { maliyet_usd: p.cost } : {}),
    };
  },
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

/**
 * Kilo Code CLI 7.8.27 (OpenCode'dan catallanmis): cikti bicimi OpenCode'la ayni, ayrica step_finish'te model adi var.
 * Oturum acmadan "kilo/kilo-auto/free" ucretsiz yonlendiricisiyle calisir (2026-11-20 denendi); varsayilan model odur.
 */
export const KILO: AjanTanimi = {
  ...OPENCODE,
  ad: 'kilo',
  istemci: /^(kilo|opencode)/i,
  komutBul() {
    // npm, Windows'ta kilo.cmd / kilo.ps1 sarmalayicisi kurar; kabuga girmemek icin asil betik node ile kosulur.
    const sarmalayici = yoldaBul(process.platform === 'win32' ? ['kilo.cmd'] : ['kilo']);
    if (!sarmalayici) return null;
    const betik = join(dirname(sarmalayici), 'node_modules', '@kilocode', 'cli', 'bin', 'kilo');
    if (existsSync(betik)) return { program: process.execPath, onEk: [betik] };
    return process.platform === 'win32' ? null : { program: sarmalayici, onEk: [] };
  },
  argumanlar: (istem) => ['run', '--auto', '--format', 'json', '-m', process.env.MIHENK_KILO_MODEL ?? 'kilo/kilo-auto/free', istem],
  kullanimKatkisi(satir) {
    const k = OPENCODE.kullanimKatkisi!(satir);
    const model = nesne(nesne(nesne(satir)?.part)?.model)?.modelID;
    return k && typeof model === 'string' ? { ...k, model } : k;
  },
};

/** npm'in kurdugu sarmalayicinin yanindaki paketin asil betigi (Windows'ta .cmd kabugu atlanir). */
function npmBetigi(sarmalayici: string, paketYolu: string[], betik: string): { program: string; onEk: string[] } | null {
  const s = yoldaBul(process.platform === 'win32' ? [`${sarmalayici}.cmd`] : [sarmalayici]);
  if (!s) return null;
  const yol = join(dirname(s), 'node_modules', ...paketYolu, betik);
  if (existsSync(yol)) return { program: process.execPath, onEk: [yol] };
  return process.platform === 'win32' ? null : { program: s, onEk: [] };
}

/**
 * Cline CLI 3.0.74. Komut ve "run_result" satiri (usage: inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalCost;
 * model.id) gercek bir kosudan goruldu (2026-11-20, oturum acilmadan "Unauthorized" ile biten kosu). Istem verilince kendiliginden
 * onayli kipte calisir. Cline'in proje duzeyinde MCP dosyasi yoktur: kayit proje icindeki .cline/mcp_settings.json'a yazilir ve
 * CLINE_MCP_SETTINGS_PATH ile gosterilir (belgede gecen degisken; kullanicinin kuresel ayarina dokunulmaz).
 */
export const CLINE: AjanTanimi = {
  ad: 'cline',
  istemci: /cline/i,
  komutBul: () => npmBetigi('cline', ['cline'], join('bin', 'cline')),
  argumanlar: (istem) => ['--json', '--auto-approve', 'true', istem],
  ortam: (cwd) => ({ CLINE_MCP_SETTINGS_PATH: join(cwd, '.cline', 'mcp_settings.json') }),
  kullanimKatkisi(satir) {
    const s = nesne(satir);
    if (s?.type !== 'run_result') return undefined;
    const k = nesne(s.aggregateUsage) ?? nesne(s.usage) ?? {};
    const model = nesne(s.model)?.id;
    return {
      tur: 'toplam', girdi: sayi(k.inputTokens), onbellek_okuma: sayi(k.cacheReadTokens), onbellek_yazma: sayi(k.cacheWriteTokens),
      cikti: sayi(k.outputTokens), ...(typeof k.totalCost === 'number' ? { maliyet_usd: k.totalCost } : {}),
      ...(typeof model === 'string' ? { model } : {}),
    };
  },
  kullanimOku(satir) {
    const s = nesne(satir);
    const k = s?.type === 'run_result' ? nesne(s.usage) : undefined;
    return k ? { baglam: sayi(k.inputTokens) + sayi(k.cacheReadTokens), cikti: sayi(k.outputTokens) } : undefined;
  },
  metinOku(satir) {
    const s = nesne(satir);
    return s?.type === 'run_result' && typeof s.text === 'string' ? s.text : undefined;
  },
};

/**
 * Qwen Code 0.28.0. DENENMEDI: ucretsiz katmani 2026-04-15'te kapandigi icin bu bilgisayarda calistirilamadi. Komut ve cikti
 * bicimi yalniz belgeden (qwenlm.github.io/qwen-code-docs .../headless): -p, --yolo, --output-format stream-json; olaylar Claude
 * Code'unkiyle ayni adlarla (system/init, assistant, result) ve result.usage icinde token. Gercek kosuda dogrulanana dek
 * kullanim okuyucusu Claude Code'unkidir.
 */
export const QWEN: AjanTanimi = {
  ...CLAUDE,
  ad: 'qwen',
  istemci: /qwen/i,
  komutBul: () => npmBetigi('qwen', ['@qwen-code', 'qwen-code'], 'cli-entry.js'),
  argumanlar: (istem) => ['-p', istem, '--yolo', '--output-format', 'stream-json'],
};

export const AJANLAR: Readonly<Record<string, AjanTanimi>> = { claude: CLAUDE, codex: CODEX, opencode: OPENCODE, kilo: KILO, cline: CLINE, qwen: QWEN };
