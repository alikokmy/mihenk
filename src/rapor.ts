// Duz dilde tek sayfa rapor (Asama 14): kodlama terimi bilmeyen birinin okuyacagi dilde ne yapildi, ne kaldi ve neden, sure, maliyet.
// Kaynak defterdir; sayilar defterin ozetinden gelir (test esitligini denetler). Sayfa kendi basina calisir: dis dosya, betik yok.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Defter, type IsGorunumu } from './defter.js';
import { hangiDil, t } from './dil.js';
import { geriAlinanIsler } from './geri.js';

const kacis = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function sure(sn: number | null): string {
  if (sn === null) return t('r_devam');
  const d = Math.floor(sn / 60);
  const s = Math.round(sn % 60);
  return d > 0 ? t('r_dk_sn', { dk: d, sn: s }) : t('r_sn', { sn: s });
}

function para(usd: number | null, bilinmeyen: number): string {
  if (usd === null) return bilinmeyen > 0 ? t('r_maliyet_bilinmiyor') : '-';
  return `${usd.toFixed(usd < 1 ? 4 : 2)} USD${bilinmeyen > 0 ? t('r_maliyet_kismen') : ''}`;
}

const SONUC: Record<string, { anahtar: 'r_sonuc_gecti' | 'r_sonuc_kaldi' | 'r_sonuc_belirsiz' | 'r_sonuc_acik'; sinif: string }> = {
  gecti: { anahtar: 'r_sonuc_gecti', sinif: 'iyi' },
  kaldi: { anahtar: 'r_sonuc_kaldi', sinif: 'kotu' },
  belirsiz: { anahtar: 'r_sonuc_belirsiz', sinif: 'orta' },
  acik: { anahtar: 'r_sonuc_acik', sinif: 'orta' },
};

/** Gerekceyi teknik onekinden arindirip duz cumleye cevirir. */
/** Isin sonucunun duz dille nedeni (rapor ve penceredeki "Islerin durumu"). */
export function isNedeni(is: IsGorunumu): string {
  return neden(is);
}

function neden(is: IsGorunumu): string {
  const g = is.gerekce ?? '';
  if (is.durum === 'gecti') return t('r_n_gecti');
  if (g.startsWith('butce:')) return t('r_n_butce', { ayrinti: g.slice(7).trim() });
  if (g.startsWith('kota:')) return t('r_n_kota');
  if (g.startsWith('kararsiz')) return t('r_n_kararsiz');
  if (/gerileme/.test(g)) return t('r_n_gerileme');
  if (/^takildi: dongu/.test(g)) return t('r_n_dongu');
  if (/proje disinda/.test(g)) return t('r_n_disari');
  if (/^takildi:/.test(g)) return t('r_n_takildi', { sure: g.includes('saniyede bitmedi') ? t('r_n_takildi_sure') : '' });
  return g === '' ? '-' : g;
}

export function raporHtml(kok: string, zaman = new Date()): { html: string; ozet: { toplam: number; gecti: number; kaldi: number; belirsiz: number; acik: number } } {
  const defter = new Defter(kok);
  try {
    const r = defter.rapor({ sinir: 100 });
    const tam = (r.isler ?? []).map((x) => defter.rapor({ is_id: x.id })).reverse();
    const isler = tam.map((x) => x.is!);
    // Surucunun ajan secim notu (Asama 29-30): "oneri" kipinde bu is neden bu araca gitti.
    const secimNotu = new Map(tam.map((x) => [x.is!.id, (x.kanitlar ?? []).map((k) => k.icerik ?? '').find((c) => c.startsWith('[surucu] ajan secimi:'))?.slice('[surucu] ajan secimi: '.length) ?? '']));
    const geriAlinan = geriAlinanIsler(kok);
    const o = r.ozet;
    const k = r.kullanim;
    const satirlar = isler.map((is) => {
      const s = SONUC[is.durum]!;
      const supheler = is.supheler.length > 0
        ? `<p class="uyari">${kacis(t('r_dikkat', { metin: is.supheler.join('; ') }))}</p>` : '';
      const geriAlindi = geriAlinan.has(is.id) ? `<p class="uyari" data-geri-alindi="${is.id}">${kacis(t('r_geri_alindi'))}</p>` : '';
      const geriAl = !geriAlinan.has(is.id) && is.durum !== 'gecti' && is.durum !== 'acik'
        ? `<p class="ipucu">${kacis(t('r_geri'))} <code>mihenk geri-al ${is.id}</code></p>` : '';
      return `<section class="is ${s.sinif}">
  <h2><span class="rozet">${kacis(t(s.anahtar))}</span> ${kacis(t('r_is', { id: is.id }))}</h2>
  <p class="soru">${kacis(is.soru)}</p>
  <p><b>${kacis(t('r_neden'))}:</b> ${kacis(neden(is))}</p>
  ${supheler}
  ${geriAlindi}
  ${is.bilgi_notu ? `<p class="kucuk" data-bilgi-notu="${is.id}">${kacis(t('r_bilgi_notu', { not: is.bilgi_notu }))}</p>` : ''}
  ${secimNotu.get(is.id) ? `<p class="kucuk" data-ajan-secimi="${is.id}">${kacis(t('r_ajan_secimi', { not: secimNotu.get(is.id)! }))}</p>` : ''}
  <p class="kucuk">${kacis(t('r_satir', { sure: sure(is.sure_sn), maliyet: para(is.kullanim_toplami.maliyet_usd, is.kullanim_toplami.maliyeti_bilinmeyen_oturum), ajan: is.ajan, deneme: is.deneme_sayisi }))}</p>
  ${geriAl}
</section>`;
    }).join('\n');
    const kisitlar = defter.kisitKararlari();
    const ozetCumle = o.toplam === 0
      ? t('r_bos')
      : t('r_ozet', { toplam: o.toplam, gecti: o.gecti, kaldi: o.kaldi, belirsiz: o.belirsiz, acik: o.acik ? t('r_ozet_acik', { acik: o.acik }) : '' });
    const html = `<!doctype html>
<html lang="${hangiDil()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${kacis(t('r_sayfa_basligi', { proje: basename(kok) }))}</title>
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
<h1>${kacis(t('r_baslik', { proje: basename(kok) }))}</h1>
<p class="tarih">${kacis(t('r_tarih', { tarih: zaman.toLocaleString(hangiDil() === 'en' ? 'en-GB' : 'tr-TR') }))}</p>
<div class="ozet" id="ozet" data-toplam="${o.toplam}" data-gecti="${o.gecti}" data-kaldi="${o.kaldi}" data-belirsiz="${o.belirsiz}" data-acik="${o.acik}">
  <p><b>${kacis(ozetCumle)}</b></p>
  <p>${kacis(t('r_toplam', { sure: sure(k.ajan_sure_sn), maliyet: para(k.maliyet_usd, k.maliyeti_bilinmeyen_oturum) }))}</p>
  <p class="kucuk">${kacis(t('r_aciklama'))}</p>
</div>
${kisitlar.length ? `<section class="is" id="kisitlar" data-kisit-sayisi="${kisitlar.length}"><h2>${kacis(t('r_kisit_baslik', { sayi: kisitlar.length }))}</h2><ul>${kisitlar.map((k) => `<li>${kacis(t('r_kisit_satir', { id: k.is_id, konu: k.konu, secilen: k.secilen }))}</li>`).join('')}</ul></section>` : ''}
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
