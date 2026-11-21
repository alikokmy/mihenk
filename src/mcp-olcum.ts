// MCP baglanti olcumu (2026-11-21, kullanici: "simdilik olcmekle yetinelim"). Yuk altinda OpenCode, mihenk MCP sunucusu baglanmadan ilk
// istegi modele gonderebiliyor (Asama 33 bulgusu). Surucu her ajan oturumunda olcer: aracin MCP istemcisi deftere oturum basindan kac ms
// sonra baglandi ve aracin ilk ciktisi ne zaman geldi. Baglanti yoksa ya da ilk ciktidan sonra geldiyse oturum "gec" sayilir.
// Sinir: modele giden ilk istegin ani disaridan gorunmez; "ilk cikti" yaklasik isarettir. Onlem (baglantiyi beklemek) olcume gore karar.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BaglantiOlcumu {
  /** Oturum basindan aracin defter baglantisina dek gecen sure; baglanmadiysa null. */
  mcp_baglanti_ms: number | null;
  /** Oturum basindan aracin ilk ciktisina dek gecen sure; cikti yoksa null. */
  ilk_cikti_ms: number | null;
  /** Baglanti yok ya da ilk ciktidan sonra. */
  mcp_gec: boolean;
}

/** log.jsonl'den bu oturumun (baslangic-bitis arasi, istemci adi uyan) ilk baglanti satirini bulur. */
export function baglantiOlc(kok: string, o: { baslangic: number; bitis: number; istemci: RegExp; ilkCiktiMs: number | null }): BaglantiOlcumu {
  let baglanti: number | null = null;
  const yol = join(kok, '.mihenk', 'log.jsonl');
  if (existsSync(yol)) {
    for (const s of readFileSync(yol, 'utf8').split('\n')) {
      if (!s.includes('"baglanti"')) continue;
      try {
        const l = JSON.parse(s) as { zaman?: string; islem?: string; girdi?: { istemci?: string } };
        if (l.islem !== 'baglanti' || !l.zaman) continue;
        const z = Date.parse(l.zaman);
        // 1 sn pay: istemci saatinin oturum basindan hemen once yazilmis olabilir; sure yine oturum basina gore olculur.
        if (z < o.baslangic - 1000 || z > o.bitis || !o.istemci.test(l.girdi?.istemci ?? '')) continue;
        if (z < o.baslangic) { baglanti = 0; continue; }
        baglanti = Math.min(baglanti ?? Infinity, z - o.baslangic);
      } catch {
        // bozuk satir atlanir
      }
    }
  }
  return { mcp_baglanti_ms: baglanti, ilk_cikti_ms: o.ilkCiktiMs, mcp_gec: baglanti === null || (o.ilkCiktiMs !== null && baglanti > o.ilkCiktiMs) };
}

/** Surucu olay kaydindaki son n oturumun ozeti (doktor gosterir). */
export function baglantiOzeti(kok: string, n = 50): { oturum: number; gec: number; baglanmayan: number } {
  const yol = join(kok, '.mihenk', 'surucu.jsonl');
  if (!existsSync(yol)) return { oturum: 0, gec: 0, baglanmayan: 0 };
  const satirlar = readFileSync(yol, 'utf8').split('\n').filter((s) => s.includes('"oturum_bitti"') && s.includes('"mcp_gec"'));
  const son = satirlar.slice(-n).flatMap((s) => { try { return [JSON.parse(s) as { mcp_gec?: boolean; mcp_baglanti_ms?: number | null }]; } catch { return []; } });
  return { oturum: son.length, gec: son.filter((x) => x.mcp_gec === true).length, baglanmayan: son.filter((x) => x.mcp_baglanti_ms === null).length };
}
