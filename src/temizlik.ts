// Kullanim olcutuyle silme (Asama 39; metamorfik karari 8, 2026-11-20): veri, gunluk ve kopya yalniz bir is ya da is akisi onu kullandigi
// surece durur. .mihenk/ciktilar icinde:
//   - "gecti" kapanan isin ajan, dogrulama, tekrar, bilgi ve baslangic ciktilari silinir (isi bitti, hukmu defterde);
//   - "kaldi" ve "belirsiz" isinkiler kok neden icin durur; ayni isin (ayni etiket, yoksa ayni soru) sonradan gecen kaydi varsa silinir;
//   - acik isinkiler durur;
//   - hazirlik ciktisi, kaydi acilmis isin ise silinir (hazirlik basarisizsa kusurun kaniti olarak durur); planlama ciktisi silinir.
// Defterdeki atif kalir; rapor araci dosya yoksa "silindi" der. Ayar "cikti_temizligi" kapatir.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function ciktilariTemizle(kok: string): { silinen: string[]; kalan: number } {
  const dizin = join(kok, '.mihenk', 'ciktilar');
  const db = join(kok, '.mihenk', 'defter.db');
  if (!existsSync(dizin) || !existsSync(db)) return { silinen: [], kalan: 0 };
  const d = new DatabaseSync(db, { readOnly: true });
  let isler: Array<{ id: number; durum: string; etiket: string | null; anahtar: string; giderildi: number }>;
  try {
    isler = d.prepare(`SELECT i.id, i.durum, i.etiket, coalesce(i.etiket, i.soru) AS anahtar,
      EXISTS (SELECT 1 FROM isler j WHERE j.id > i.id AND j.durum = 'gecti' AND coalesce(j.etiket, j.soru) = coalesce(i.etiket, i.soru)) AS giderildi
      FROM isler i`).all() as typeof isler;
  } finally {
    d.close();
  }
  const durum = new Map(isler.map((i) => [i.id, i]));
  const acilanHazirlik = new Set(isler.filter((i) => i.etiket).map((i) => createHash('sha1').update(i.etiket!).digest('hex').slice(0, 8)));
  const silinen: string[] = [];
  let kalan = 0;
  for (const ad of readdirSync(dizin)) {
    let sil = false;
    const m = /^(?:ajan-)?is-(\d+)-/.exec(ad);
    if (m) {
      const is = durum.get(Number(m[1]));
      sil = !!is && (is.durum === 'gecti' || ((is.durum === 'kaldi' || is.durum === 'belirsiz') && is.giderildi === 1));
    } else if (/^planlama\.txt$/.test(ad)) sil = true;
    else {
      const h = /^hazirlik-([0-9a-f]{8})/.exec(ad);
      sil = !!h && acilanHazirlik.has(h[1]!);
    }
    if (sil) {
      try {
        rmSync(join(dizin, ad), { force: true });
        silinen.push(ad);
      } catch {
        kalan++;
      }
    } else kalan++;
  }
  return { silinen, kalan };
}
