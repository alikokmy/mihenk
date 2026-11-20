// Duz dilde tek sayfa rapor (Asama 14): kodlama terimi bilmeyen birinin okuyacagi dilde ne yapildi, ne kaldi ve neden, sure, maliyet.
// Kaynak defterdir; sayilar defterin ozetinden gelir (test esitligini denetler). Sayfa kendi basina calisir: dis dosya, betik yok.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Defter, type IsGorunumu } from './defter.js';

const kacis = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function sure(sn: number | null): string {
  if (sn === null) return 'devam ediyor';
  const d = Math.floor(sn / 60);
  const s = Math.round(sn % 60);
  return d > 0 ? `${d} dk ${s} sn` : `${s} sn`;
}

function para(usd: number | null, bilinmeyen: number): string {
  if (usd === null) return bilinmeyen > 0 ? 'bilinmiyor (araç maliyet bildirmiyor)' : '-';
  return `${usd.toFixed(usd < 1 ? 4 : 2)} USD${bilinmeyen > 0 ? ' (bir kısmı bilinmiyor)' : ''}`;
}

const SONUC: Record<string, { metin: string; sinif: string }> = {
  gecti: { metin: 'Başarıyla bitti', sinif: 'iyi' },
  kaldi: { metin: 'Yapılamadı', sinif: 'kotu' },
  belirsiz: { metin: 'Emin olunamadı', sinif: 'orta' },
  acik: { metin: 'Henüz bitmedi', sinif: 'orta' },
};

/** Gerekceyi teknik onekinden arindirip duz cumleye cevirir. */
function neden(is: IsGorunumu): string {
  const g = is.gerekce ?? '';
  if (is.durum === 'gecti') return 'İşin kendi denetimi geçti; bunu yapay zekâ değil, mihenk kendisi doğruladı.';
  if (g.startsWith('butce:')) return `Harcama ya da süre sınırına ulaşıldı (${g.slice(7).trim()}).`;
  if (g.startsWith('kota:')) return 'Yapay zekâ hizmeti bir süre isteği kabul etmedi (kullanım sınırı); iş tamamlanamadı.';
  if (g.startsWith('kararsiz')) return 'Denetim aynı kodla bir geçti bir kaldı; sonuç güvenilir değil.';
  if (/gerileme/.test(g)) return 'İş kendi denetimini geçti ama projenin daha önce çalışan başka bir yerini bozdu.';
  if (/^takildi: dongu/.test(g)) return 'Yapay zekâ aynı hatayı tekrarladı, ilerleme olmadığı için durduruldu.';
  if (/proje disinda/.test(g)) return 'Yapay zekâ proje klasörünün dışında değişiklik yaptı; iş geçersiz sayıldı.';
  if (/^takildi:/.test(g)) return `Verilen deneme hakkında denetim geçmedi${g.includes('saniyede bitmedi') ? ' (yapay zekâ süresinde bitiremedi)' : ''}.`;
  return g === '' ? '-' : g;
}

export function raporHtml(kok: string, zaman = new Date()): { html: string; ozet: { toplam: number; gecti: number; kaldi: number; belirsiz: number; acik: number } } {
  const defter = new Defter(kok);
  try {
    const r = defter.rapor({ sinir: 100 });
    const isler = (r.isler ?? []).map((x) => defter.rapor({ is_id: x.id }).is!).reverse();
    const o = r.ozet;
    const k = r.kullanim;
    const satirlar = isler.map((is) => {
      const s = SONUC[is.durum]!;
      const supheler = is.supheler.length > 0
        ? `<p class="uyari">Dikkat: ${is.supheler.map((x) => kacis(x)).join('; ')}. İşi bir de siz kontrol edin.</p>` : '';
      const geriAl = is.durum !== 'gecti' && is.durum !== 'acik'
        ? `<p class="ipucu">Bu işin yarım kalan değişikliklerini geri almak için: <code>mihenk geri-al ${is.id}</code></p>` : '';
      return `<section class="is ${s.sinif}">
  <h2><span class="rozet">${s.metin}</span> İş ${is.id}</h2>
  <p class="soru">${kacis(is.soru)}</p>
  <p><b>Neden:</b> ${kacis(neden(is))}</p>
  ${supheler}
  <p class="kucuk">Süre: ${sure(is.sure_sn)} · Maliyet: ${para(is.kullanim_toplami.maliyet_usd, is.kullanim_toplami.maliyeti_bilinmeyen_oturum)} · Yapay zekâ aracı: ${kacis(is.ajan)} · Deneme: ${is.deneme_sayisi}</p>
  ${geriAl}
</section>`;
    }).join('\n');
    const ozetCumle = o.toplam === 0
      ? 'Bu projede henüz kaydedilmiş iş yok.'
      : `${o.toplam} işin ${o.gecti} tanesi başarıyla bitti, ${o.kaldi} tanesi yapılamadı, ${o.belirsiz} tanesinde emin olunamadı${o.acik ? `, ${o.acik} tanesi henüz bitmedi` : ''}.`;
    const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>mihenk raporu: ${kacis(basename(kok))}</title>
<style>
:root{--zemin:#fafaf7;--yazi:#1d1d1b;--soluk:#5f5f5a;--kart:#fff;--cizgi:#e3e2dc;--iyi:#1f7a3f;--kotu:#b3261e;--orta:#8a6100}
@media (prefers-color-scheme:dark){:root{--zemin:#161614;--yazi:#ecebe6;--soluk:#a5a49c;--kart:#201f1c;--cizgi:#34332f;--iyi:#5cc98a;--kotu:#ff8a80;--orta:#e0b44c}}
body{margin:0;background:var(--zemin);color:var(--yazi);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.5rem;margin:0 0 4px} .tarih{color:var(--soluk);margin:0 0 20px}
.ozet{background:var(--kart);border:1px solid var(--cizgi);border-radius:10px;padding:16px;margin-bottom:20px}
.ozet p{margin:4px 0} .is{background:var(--kart);border:1px solid var(--cizgi);border-left:5px solid var(--orta);border-radius:10px;padding:14px 16px;margin:12px 0}
.is.iyi{border-left-color:var(--iyi)} .is.kotu{border-left-color:var(--kotu)} .is h2{font-size:1.05rem;margin:0 0 6px}
.rozet{font-weight:600} .iyi .rozet{color:var(--iyi)} .kotu .rozet{color:var(--kotu)} .orta .rozet{color:var(--orta)}
.soru{margin:0 0 6px} .kucuk{color:var(--soluk);font-size:.9rem} .uyari{color:var(--orta);font-weight:500} .ipucu{font-size:.9rem}
code{background:var(--cizgi);padding:1px 5px;border-radius:4px}
</style></head><body><main>
<h1>Ne yapıldı: ${kacis(basename(kok))}</h1>
<p class="tarih">Rapor tarihi: ${zaman.toLocaleString('tr-TR')}</p>
<div class="ozet" id="ozet" data-toplam="${o.toplam}" data-gecti="${o.gecti}" data-kaldi="${o.kaldi}" data-belirsiz="${o.belirsiz}" data-acik="${o.acik}">
  <p><b>${ozetCumle}</b></p>
  <p>Yapay zekânın çalıştığı toplam süre: ${sure(k.ajan_sure_sn)} · Toplam maliyet: ${para(k.maliyet_usd, k.maliyeti_bilinmeyen_oturum)}</p>
  <p class="kucuk">"Başarıyla bitti", işin kendi denetiminin mihenk tarafından çalıştırılıp geçtiği anlamına gelir; yapay zekânın "bitti" demesi sayılmaz.</p>
</div>
${satirlar}
</main></body></html>
`;
    return { html, ozet: o };
  } finally {
    defter.kapat();
  }
}

/** Raporu .mihenk/rapor.html'e yazar ve yolunu doner. */
export function raporYaz(kok: string): string {
  const dizin = join(kok, '.mihenk');
  if (!existsSync(dizin)) mkdirSync(dizin, { recursive: true });
  const yol = join(dizin, 'rapor.html');
  writeFileSync(yol, raporHtml(kok).html);
  return yol;
}
