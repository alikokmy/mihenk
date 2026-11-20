// Pencerenin tek sayfasi (Asama 16). Dis kaynak yok; veriler /api'den gelir, metinler sunucunun gonderdigi katalogdan (iki dil).
// Kullanici verisi yalniz textContent ile yazilir (ajanin yazdigi metin sayfada kod olarak calisamaz).
export const PENCERE_SAYFASI = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>mihenk</title>
<style>
:root{--zemin:#f7f7f4;--kart:#fff;--yazi:#1d1d1b;--soluk:#62625c;--cizgi:#deddd6;--vurgu:#2f5d8a;--iyi:#1f7a3f;--kotu:#b3261e;--orta:#8a6100}
@media (prefers-color-scheme:dark){:root{--zemin:#151513;--kart:#1f1e1b;--yazi:#ecebe6;--soluk:#a4a39b;--cizgi:#34332f;--vurgu:#8ab4e0;--iyi:#5cc98a;--kotu:#ff8a80;--orta:#e0b44c}}
*{box-sizing:border-box} [hidden]{display:none!important} body{margin:0;background:var(--zemin);color:var(--yazi);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:14px 16px 0;max-width:900px;margin:0 auto} h1{font-size:1.3rem;margin:0 0 2px} .klasor{color:var(--soluk);font-size:.85rem;word-break:break-all}
nav{display:flex;gap:4px;flex-wrap:wrap;margin-top:12px;border-bottom:1px solid var(--cizgi)}
nav button{background:none;border:0;border-bottom:3px solid transparent;padding:8px 12px;font:inherit;color:var(--soluk);cursor:pointer}
nav button[aria-selected=true]{color:var(--yazi);border-bottom-color:var(--vurgu);font-weight:600}
main{max-width:900px;margin:0 auto;padding:16px} section[hidden]{display:none}
.kart{background:var(--kart);border:1px solid var(--cizgi);border-radius:10px;padding:14px 16px;margin:0 0 12px}
.dugme{background:var(--vurgu);color:#fff;border:0;border-radius:7px;padding:8px 14px;font:inherit;cursor:pointer}
.dugme.ikincil{background:none;color:var(--vurgu);border:1px solid var(--vurgu)} .dugme.tehlike{background:var(--kotu)}
.dugme:disabled{opacity:.5;cursor:default} .satir{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.soluk{color:var(--soluk);font-size:.9rem} .not{color:var(--soluk);font-size:.85rem;margin:4px 0 0 0;padding-left:10px;border-left:2px solid var(--cizgi)}
.ayar{padding:10px 0;border-top:1px solid var(--cizgi)} .ayar:first-child{border-top:0} .ayar label{display:flex;gap:10px;align-items:flex-start;cursor:pointer}
.ayar .ad{font-family:ui-monospace,Consolas,monospace;font-size:.85rem;color:var(--soluk)}
select,input[type=number]{font:inherit;padding:4px 6px;border:1px solid var(--cizgi);border-radius:6px;background:var(--kart);color:var(--yazi)}
textarea{width:100%;min-height:260px;font:13px/1.4 ui-monospace,Consolas,monospace;border:1px solid var(--cizgi);border-radius:8px;padding:8px;background:var(--kart);color:var(--yazi)}
pre{white-space:pre-wrap;font:12.5px/1.45 ui-monospace,Consolas,monospace;margin:0;max-height:340px;overflow:auto}
.is{border-left:5px solid var(--orta)} .is.gecti{border-left-color:var(--iyi)} .is.kaldi{border-left-color:var(--kotu)}
.rozet{font-weight:600} .gecti .rozet{color:var(--iyi)} .kaldi .rozet{color:var(--kotu)} .belirsiz .rozet,.acik .rozet{color:var(--orta)}
.ileti{min-height:1.4em;font-size:.9rem;margin-top:6px} .ileti.hata{color:var(--kotu)}
</style></head><body>
<header><h1 id="baslik">mihenk</h1><div class="klasor" id="klasor"></div>
<nav role="tablist" id="sekmeler"></nav></header>
<main>
<section id="proje"></section><section id="liste" hidden></section><section id="defter" hidden></section>
<section id="ayarlar" hidden></section><section id="oneri" hidden></section>
</main>
<script>
const ANAHTAR = new URLSearchParams(location.search).get('anahtar') || '';
let M = {}; let D = null;
const $ = (id) => document.getElementById(id);
const el = (ad, ozellik = {}, ...cocuklar) => { const e = document.createElement(ad); for (const [k, v] of Object.entries(ozellik)) { if (k === 'metin') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of cocuklar) if (c) e.append(c); return e; };
const m = (k, d = {}) => (M[k] || k).replace(/\\{([a-z_]+)\\}/g, (_, a) => (a in d ? String(d[a]) : '{' + a + '}'));
async function api(yol, govde) {
  const r = await fetch(yol, { method: govde === undefined ? 'GET' : 'POST', headers: { 'x-mihenk-anahtar': ANAHTAR, 'content-type': 'application/json' }, body: govde === undefined ? undefined : JSON.stringify(govde) });
  const j = await r.json(); if (!r.ok) throw new Error(j.hata || r.status); return j;
}
function ileti(yer, metin, hata) { yer.textContent = metin; yer.className = 'ileti' + (hata ? ' hata' : ''); }
const SEKMELER = [['proje', 'p_sekme_proje'], ['liste', 'p_sekme_liste'], ['defter', 'p_sekme_defter'], ['ayarlar', 'p_sekme_ayarlar'], ['oneri', 'p_sekme_oneri']];
let secili = 'proje';
function sekmeleriCiz() {
  const n = $('sekmeler'); n.replaceChildren();
  for (const [id, k] of SEKMELER) n.append(el('button', { role: 'tab', 'aria-selected': String(id === secili), 'data-sekme': id, metin: m(k), onclick: () => sekmeAc(id) }));
}
function sekmeAc(id) { secili = id; for (const [s] of SEKMELER) $(s).hidden = s !== id; sekmeleriCiz(); ciz(id); }
async function yukle() { D = await api('/api/durum'); M = D.metinler; document.documentElement.lang = D.dil; $('klasor').textContent = m('p_proje_klasoru') + ': ' + D.proje.kok; sekmeleriCiz(); ciz(secili); }
function ciz(id) { ({ proje: projeCiz, liste: listeCiz, defter: defterCiz, ayarlar: ayarlarCiz, oneri: oneriCiz })[id](); }

function projeCiz() {
  const s = $('proje'); const sonuc = el('div', { class: 'ileti' }); const o = D.ozet;
  const kaldirKutusu = el('div', { class: 'satir', hidden: '' });
  const dahil = el('input', { type: 'checkbox', id: 'defter-dahil' });
  kaldirKutusu.append(el('button', { class: 'dugme tehlike', 'data-eylem': 'kaldir-eminim', metin: m('p_eminim'), onclick: async () => { try { const r = await api('/api/kaldir', { onay: true, defter_dahil: dahil.checked }); ileti(sonuc, r.defter); await yukle(); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }),
    el('button', { class: 'dugme ikincil', metin: m('p_vazgec'), onclick: () => kaldirKutusu.hidden = true }), el('label', {}, dahil, document.createTextNode(' ' + m('p_defter_dahil'))));
  s.replaceChildren(
    el('div', { class: 'kart' }, el('p', { metin: D.proje.kurulu ? m('p_kurulu') : m('p_kurulu_degil') }),
      o ? el('p', { metin: m('p_ozet', o) }) : null, el('p', { class: 'soluk', metin: m('p_baglam', { token: D.baglam.toplam_token }) })),
    el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_kur_aciklama') }),
      el('button', { class: 'dugme', 'data-eylem': 'kur', metin: m('p_kur'), onclick: async () => { try { const r = await api('/api/kur', {}); ileti(sonuc, m('p_kaydedildi') + ' (' + r.yazilan + '/' + r.degismeyen + ')' + (r.uyarilar.length ? ' ' + r.uyarilar.join(' ') : '')); await yukle(); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } })),
    el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_kaldir_aciklama') }),
      el('button', { class: 'dugme ikincil', 'data-eylem': 'kaldir', metin: m('p_kaldir'), onclick: () => kaldirKutusu.hidden = false }), kaldirKutusu),
    sonuc);
}

async function listeCiz() {
  const s = $('liste'); const alan = el('textarea', { id: 'liste-metni', spellcheck: 'false' }); const sonuc = el('div', { class: 'ileti' }); const cikti = el('pre', { id: 'surucu-ciktisi' });
  const l = await api('/api/liste'); alan.value = l.icerik;
  const baslat = el('button', { class: 'dugme', 'data-eylem': 'baslat', metin: m('p_baslat') });
  const durdur = el('button', { class: 'dugme ikincil', metin: m('p_durdur'), onclick: () => api('/api/sur/durdur', {}) });
  baslat.onclick = async () => { try { await api('/api/liste', { icerik: alan.value }); await api('/api/sur', {}); izle(); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } };
  let izleyici;
  async function izle() { clearInterval(izleyici); const tur = async () => { const d = await api('/api/sur'); cikti.textContent = d.satirlar.join('\\n'); cikti.scrollTop = cikti.scrollHeight; baslat.disabled = d.calisiyor; ileti(sonuc, d.calisiyor ? m('p_calisiyor') : d.satirlar.length ? m('p_bitti') : ''); if (!d.calisiyor) clearInterval(izleyici); }; await tur(); izleyici = setInterval(tur, 1500); }
  s.replaceChildren(el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_liste_aciklama') }), alan,
    el('div', { class: 'satir' }, el('button', { class: 'dugme ikincil', 'data-eylem': 'liste-kaydet', metin: m('p_kaydet'), onclick: async () => { try { await api('/api/liste', { icerik: alan.value }); ileti(sonuc, m('p_kaydedildi')); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }), baslat, durdur), sonuc),
    el('div', { class: 'kart' }, cikti));
  izle();
}

async function defterCiz() {
  const s = $('defter'); const isler = await api('/api/isler');
  const ust = el('div', { class: 'satir' }, el('a', { class: 'dugme ikincil', href: '/rapor?anahtar=' + ANAHTAR, target: '_blank', metin: m('p_rapor_ac') }), el('button', { class: 'dugme ikincil', metin: m('p_yenile'), onclick: () => defterCiz() }));
  const kartlar = isler.length === 0 ? [el('div', { class: 'kart' }, el('p', { metin: m('p_defter_bos') }))] : isler.map((i) => {
    const sonuc = el('div', { class: 'ileti' });
    const k = el('div', { class: 'kart is ' + i.durum, 'data-is': String(i.id) },
      el('div', {}, el('span', { class: 'rozet', metin: m('p_durum_' + i.durum) }), document.createTextNode(' · ' + m('p_is', { id: i.id }))),
      el('p', { metin: i.soru }),
      i.gerekce ? el('p', { class: 'soluk', metin: m('p_neden') + ': ' + i.gerekce }) : null,
      i.supheler.length ? el('p', { class: 'soluk', metin: m('p_supheli') + ': ' + i.supheler.join('; ') }) : null,
      el('p', { class: 'soluk', metin: m('p_ayrinti', { sure: i.sure_sn === null ? '-' : i.sure_sn + ' s', maliyet: i.maliyet_usd === null ? m('p_bilinmiyor') : i.maliyet_usd + ' USD', ajan: i.ajan, deneme: i.deneme }) }),
      i.geri_alinabilir ? el('button', { class: 'dugme ikincil', 'data-eylem': 'geri-al', metin: m('p_geri_al'), onclick: async () => { try { const r = await api('/api/geri-al', { id: i.id }); ileti(sonuc, m('p_geri_alindi', { sayi: r.geri_yuklenen.length + r.silinen.length + r.geri_getirilen.length, cakisan: r.cakisan.length })); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }) : null,
      sonuc);
    return k;
  });
  s.replaceChildren(el('div', { class: 'kart' }, ust), ...kartlar);
}

function ayarlarCiz() {
  const s = $('ayarlar'); const notlar = D.ayarlar.find((a) => a.ad === 'bilgi_notlari').deger !== false; const sonuc = el('div', { class: 'ileti' });
  const degistir = async (ad, deger) => { try { const r = await api('/api/ayar', { ad, deger }); ileti(sonuc, r.mesaj); await yukle(); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); await yukle(); } };
  const goster = el('input', { type: 'checkbox', id: 'bilgi-notlari' }); goster.checked = notlar; goster.onchange = () => degistir('bilgi_notlari', goster.checked);
  const liste = el('div', { class: 'kart' });
  for (const a of D.ayarlar.filter((x) => x.ad !== 'bilgi_notlari')) {
    let girdi;
    if (a.secenekler) { girdi = el('select', { 'data-ayar': a.ad }); for (const sec of a.secenekler) { const o = el('option', { value: sec, metin: sec }); if (sec === a.deger) o.selected = true; girdi.append(o); } girdi.onchange = () => degistir(a.ad, girdi.value); }
    else if (a.sayi) { girdi = el('input', { type: 'number', min: String(a.sayi.en_az), max: String(a.sayi.en_cok), value: String(a.deger), 'data-ayar': a.ad }); girdi.onchange = () => degistir(a.ad, girdi.value); }
    else { girdi = el('input', { type: 'checkbox', 'data-ayar': a.ad }); girdi.checked = a.deger === true; girdi.onchange = () => degistir(a.ad, girdi.checked); }
    const blok = el('div', { class: 'ayar', 'data-ayar-blok': a.ad }, el('label', {}, girdi, el('div', {}, el('div', { metin: a.aciklama }), el('div', { class: 'ad', metin: a.ad }))));
    if (notlar) blok.append(...[el('p', { class: 'not', metin: m('p_amac') + ': ' + a.amac }), el('p', { class: 'not', metin: m('p_sonuc') + ': ' + a.sonuc }), el('p', { class: 'not', metin: m('p_varsayilan') + ' (' + String(a.varsayilan) + '): ' + a.varsayilan_aciklama }), a.etki === 'kurulum' ? el('p', { class: 'not', metin: m('p_degisiklik_kurulum') }) : null].filter(Boolean));
    liste.append(blok);
  }
  s.replaceChildren(el('div', { class: 'kart' }, el('label', { class: 'satir' }, goster, document.createTextNode(m('p_bilgi_goster')))), liste, sonuc);
}

async function oneriCiz() {
  const s = $('oneri'); const o = await api('/api/oneri');
  const k = o.kullanim; const top = k ? el('p', { metin: m('p_toplam_maliyet', { sure: k.ajan_sure_sn, maliyet: k.maliyet_usd === null ? m('p_bilinmiyor') : k.maliyet_usd + ' USD' }) }) : null;
  s.replaceChildren(el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_oneri_aciklama') }), top), el('div', { class: 'kart' }, el('pre', { id: 'oneri-metni', metin: o.metin })));
}
yukle().catch((e) => { document.body.textContent = String(e.message || e); });
</script></body></html>
`;
