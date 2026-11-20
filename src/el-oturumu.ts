// Elle acilan oturumlarin kullanimi (Asama 23). Kaynak: Claude Code'un kendi oturum kayitlari (~/.claude/projects/<proje>/*.jsonl);
// bicim bu bilgisayardaki gercek kayitlardan dogrulandi (2026-11-20): her yanit satirinda timestamp, message.id, message.model,
// message.usage {input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}. Ayni yanit birden cok satira
// bolunebilir: message.id basina bir kez sayilir. Kayitlar yalniz okunur. Claude Code dolar maliyeti yazmaz: maliyet yalniz projenin
// fiyat tablosu (mihenk.json "fiyatlar") varsa hesaplanir, yoksa "bilinmiyor" kalir (uydurulmaz).
// Plan CodeBurn / ccusage ciktisi diyordu; CodeBurn bu bilgisayarda kurulu degil ve oturum basina zaman damgali JSON bicimi belgelerde
// acikca yok. Codex'in oturum kayitlari bu asamada okunmuyor.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Defter, SURUCU_ISTEMCISI } from './defter.js';

export interface YanitKullanimi {
  zaman: number;
  model: string | null;
  girdi: number;
  onbellek_okuma: number;
  onbellek_yazma: number;
  cikti: number;
}

/** Claude Code'un proje klasorunu adlandirma bicimi: harf ve rakam disindaki her karakter "-". */
export function claudeKlasorAdi(kok: string): string {
  return resolve(kok).replace(/[^A-Za-z0-9]/g, '-');
}

/** Projenin Claude Code oturum kayitlarindaki yanitlar (message.id basina bir kez). */
export function claudeYanitlari(kok: string, ev = homedir()): YanitKullanimi[] {
  const dizin = join(ev, '.claude', 'projects', claudeKlasorAdi(kok));
  if (!existsSync(dizin)) return [];
  const yanitlar = new Map<string, YanitKullanimi>();
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
  for (const ad of readdirSync(dizin).filter((x) => x.endsWith('.jsonl'))) {
    for (const satir of readFileSync(join(dizin, ad), 'utf8').split('\n')) {
      if (!satir.includes('"usage"')) continue;
      try {
        const j = JSON.parse(satir) as { type?: string; timestamp?: string; message?: { id?: string; model?: string; usage?: Record<string, unknown> } };
        const u = j.message?.usage;
        if (j.type !== 'assistant' || !u || !j.timestamp) continue;
        const kimlik = j.message?.id ?? `${ad}:${j.timestamp}`;
        yanitlar.set(kimlik, {
          zaman: Date.parse(j.timestamp), model: j.message?.model ?? null,
          girdi: n(u.input_tokens), onbellek_okuma: n(u.cache_read_input_tokens), onbellek_yazma: n(u.cache_creation_input_tokens), cikti: n(u.output_tokens),
        });
      } catch {
        // bozuk satir atlanir
      }
    }
  }
  return [...yanitlar.values()].sort((a, b) => a.zaman - b.zaman);
}

export interface ToplamaSonucu {
  /** Kullanimi eklenen is sayisi. */
  eklenen: number;
  /** Zaman araliginda yaniti olmayan elle acilmis kapali is. */
  bos: number;
  /** Zaten kullanimi olan (surucu isi ya da daha once toplanmis) is. */
  zaten: number;
}

/**
 * Elle acilmis (surucunun acmadigi), kapanmis ve henuz kullanimi olmayan her ise, baslangic-bitis araligina dusen Claude Code
 * yanitlarini baglar. Tekrar calistirmak bir sey degistirmez (kullanimi olan is atlanir).
 */
export function elOturumlariniTopla(kok: string, o: { ev?: string } = {}): ToplamaSonucu {
  const yanitlar = claudeYanitlari(kok, o.ev);
  const defter = new Defter(kok);
  const s: ToplamaSonucu = { eklenen: 0, bos: 0, zaten: 0 };
  try {
    for (const ozet of defter.rapor({ sinir: 100 }).isler ?? []) {
      const r = defter.rapor({ is_id: ozet.id });
      const is = r.is!;
      if (is.durum === 'acik' || !is.bitis || is.istemci === SURUCU_ISTEMCISI) continue;
      if ((r.kullanimlar ?? []).length > 0) { s.zaten += 1; continue; }
      const bas = Date.parse(is.baslangic);
      const son = Date.parse(is.bitis);
      const icinde = yanitlar.filter((y) => y.zaman >= bas && y.zaman <= son);
      if (icinde.length === 0) { s.bos += 1; continue; }
      const top = icinde.reduce((t, y) => ({ girdi: t.girdi + y.girdi, onbellek_okuma: t.onbellek_okuma + y.onbellek_okuma, onbellek_yazma: t.onbellek_yazma + y.onbellek_yazma, cikti: t.cikti + y.cikti }),
        { girdi: 0, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 0 });
      const modeller = [...new Set(icinde.map((y) => y.model).filter((m): m is string => !!m))];
      defter.kullanimEkle({
        is_id: is.id, ajan: 'claude', model: modeller.length === 1 ? modeller[0]! : null, oturum: 1,
        sure_ms: Math.max(0, son - bas), ...top, maliyet_usd: null,
      });
      s.eklenen += 1;
    }
  } finally {
    defter.kapat();
  }
  return s;
}
