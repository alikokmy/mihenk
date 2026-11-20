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
.durum-satir{display:flex;gap:8px;padding:4px 0} .durum-etiket{font-weight:600;min-width:64px} .durum-tamam{color:var(--iyi)} .durum-sorun{color:var(--kotu)} .durum-bilgi{color:var(--soluk)}
.is{border-left:5px solid var(--orta)} .is.gecti{border-left-color:var(--iyi)} .is.kaldi{border-left-color:var(--kotu)}
.rozet{font-weight:600} .gecti .rozet{color:var(--iyi)} .kaldi .rozet{color:var(--kotu)} .belirsiz .rozet,.acik .rozet{color:var(--orta)}
.ileti{min-height:1.4em;font-size:.9rem;margin-top:6px} .ileti.hata{color:var(--kotu)}
.alan{display:block;margin:8px 0} .alan span{display:block;font-size:.88rem;color:var(--soluk);margin-bottom:3px}
.alan textarea,.alan input,.alan select{width:100%;font:inherit;padding:7px 9px;border:1px solid var(--cizgi);border-radius:7px;background:var(--kart);color:var(--yazi);min-height:0}
.satir.arasi{justify-content:space-between} .dugme.kucuk{padding:4px 10px;font-size:.85rem} .kart.uyari{border-color:var(--orta)}
.ayar-satir{display:flex;gap:12px;align-items:center;justify-content:space-between} .ayar-metin{flex:1;min-width:0} .ayar-baslik{font-weight:600}
.anahtar{display:flex;gap:6px;align-items:center;white-space:nowrap;cursor:pointer} .anahtar input{width:18px;height:18px} .sayi{width:80px}
.baglanti{background:none;border:0;padding:2px 0;margin-top:4px;color:var(--vurgu);font:inherit;font-size:.85rem;cursor:pointer;text-decoration:underline}
details summary{cursor:pointer;color:var(--soluk)}
</style></head><body>
<header><div class="satir arasi"><h1 id="baslik">mihenk</h1><button class="dugme ikincil kucuk" id="proje-degistir" hidden></button></div><div class="klasor" id="klasor"></div>
<nav role="tablist" id="sekmeler"></nav></header>
<main>
<section id="baslangic" hidden></section><section id="proje"></section><section id="liste" hidden></section><section id="defter" hidden></section>
<section id="ayarlar" hidden></section><section id="oneri" hidden></section>
</main>
<script>
const ANAHTAR = new URLSearchParams(location.search).get('anahtar') || '';
let M = {}; let D = null;
const $ = (id) => document.getElementById(id);
const koy = (yer, ...c) => yer.replaceChildren(...c.filter(Boolean)); // null ogeler sayfaya 'null' yazisi olarak dusmesin
const el = (ad, ozellik = {}, ...cocuklar) => { const e = document.createElement(ad); for (const [k, v] of Object.entries(ozellik)) { if (k === 'metin') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of cocuklar) if (c) e.append(c); return e; };
const m = (k, d = {}) => (M[k] || k).replace(/\\{([a-z_]+)\\}/g, (_, a) => (a in d ? String(d[a]) : '{' + a + '}'));
async function api(yol, govde) {
  const r = await fetch(yol, { method: govde === undefined ? 'GET' : 'POST', headers: { 'x-mihenk-anahtar': ANAHTAR, 'content-type': 'application/json' }, body: govde === undefined ? undefined : JSON.stringify(govde) });
  const j = await r.json(); if (!r.ok) throw new Error(j.hata || r.status); return j;
}
// Sayi kutusu: bos -> null; ondalik izinli ise adim 0.01 (Asama 30).
function sayiKutusu(deger, ondalik, ozellik) { const g = el('input', Object.assign({ type: 'number', step: ondalik ? '0.01' : '1' }, ozellik)); g.value = deger === null || deger === undefined ? '' : String(deger); return g; }
const sayiOku = (g) => g.value.trim() === '' ? null : Number(g.value);
function ileti(yer, metin, hata) { yer.textContent = metin; yer.className = 'ileti' + (hata ? ' hata' : ''); }
const SEKMELER = [['proje', 'p_sekme_proje'], ['liste', 'p_sekme_liste'], ['defter', 'p_sekme_defter'], ['ayarlar', 'p_sekme_ayarlar'], ['oneri', 'p_sekme_oneri']];
let secili = 'proje';
function sekmeleriCiz() {
  const n = $('sekmeler'); n.replaceChildren();
  for (const [id, k] of SEKMELER) n.append(el('button', { role: 'tab', 'aria-selected': String(id === secili), 'data-sekme': id, metin: m(k), onclick: () => sekmeAc(id) }));
}
function sekmeAc(id) { secili = id; for (const [s] of SEKMELER) $(s).hidden = s !== id; sekmeleriCiz(); ciz(id); }
async function yukle() {
  D = await api('/api/durum'); M = D.metinler; document.documentElement.lang = D.dil;
  // Baslangic ekrani (Asama 31): proje secilmemisse sekmeler gizlenir.
  const secim = D.secim === true; $('baslangic').hidden = !secim; $('sekmeler').hidden = secim; for (const [s] of SEKMELER) $(s).hidden = secim || s !== secili;
  const pd = $('proje-degistir'); pd.hidden = secim; pd.textContent = m('p_bs_proje_degistir');
  pd.onclick = async () => { try { await api('/api/proje', { kok: null }); await yukle(); } catch (e) { alert(e.message); } };
  if (secim) { $('klasor').textContent = ''; baslangicCiz(); return; }
  $('klasor').textContent = m('p_proje_klasoru') + ': ' + D.proje.kok; sekmeleriCiz(); ciz(secili);
}
// Sayfa acik oldukca sunucuya nabiz: sayfa kapaninca sunucu kendiliginden kapanir (liste calisirken kapanmaz).
setInterval(() => { api('/api/nabiz', {}).catch(() => {}); }, 15000);

function baslangicCiz() {
  const s = $('baslangic'); const sonuc = el('div', { class: 'ileti', id: 'baslangic-iletisi' }); const onay = el('div', { class: 'kart uyari', hidden: '' });
  const projeAc = async (kok, kur) => {
    try {
      const r = await api('/api/proje', { kok, kur: kur === true });
      if (!r.kurulu) {
        koy(onay, el('p', { metin: m('p_bs_kur_soru', { kok: r.kok }) }), el('div', { class: 'satir' },
          el('button', { class: 'dugme', 'data-eylem': 'kur-ve-ac', metin: m('p_bs_kur_ve_ac'), onclick: () => projeAc(r.kok, true) }),
          el('button', { class: 'dugme ikincil', metin: m('p_vazgec'), onclick: () => { onay.hidden = true; } })));
        onay.hidden = false; return;
      }
      secili = 'liste'; await yukle();
    } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); }
  };
  const son = el('div', { class: 'kart' }, el('b', { metin: m('p_bs_son') }));
  for (const p of D.son_projeler) son.append(el('div', { class: 'satir arasi', 'data-son-proje': p.kok },
    el('div', {}, el('div', { metin: p.ad + (p.kurulu ? '' : ' (' + m('p_bs_kurulmadi') + ')') }), el('div', { class: 'soluk', metin: p.kok })),
    el('div', { class: 'satir' }, el('button', { class: 'dugme kucuk', metin: m('p_bs_ac'), onclick: () => projeAc(p.kok) }),
      el('button', { class: 'dugme ikincil kucuk', metin: m('p_bs_cikar'), onclick: async () => { await api('/api/son-proje-cikar', { kok: p.kok }); await yukle(); } }))));
  const yolKutusu = el('input', { id: 'proje-yolu', placeholder: m('p_bs_yol') });
  const var_olan = el('div', { class: 'kart' }, el('b', { metin: m('p_bs_var_olan') }), el('div', { class: 'satir' },
    el('button', { class: 'dugme', 'data-eylem': 'klasor-sec', metin: m('p_bs_klasor_sec'), onclick: async () => { ileti(sonuc, m('p_bs_secici_bekle')); try { const r = await api('/api/klasor-sec', {}); ileti(sonuc, ''); if (r.kok) projeAc(r.kok); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } })),
    el('label', { class: 'alan' }, yolKutusu), el('button', { class: 'dugme ikincil', 'data-eylem': 'yolu-ac', metin: m('p_bs_ac'), onclick: () => { if (yolKutusu.value.trim()) projeAc(yolKutusu.value.trim().replace(/^"|"$/g, '')); } }));
  const ad = el('input', { id: 'yeni-proje-adi', placeholder: m('p_bs_yeni_ad') });
  const yeni = el('div', { class: 'kart' }, el('b', { metin: m('p_bs_yeni') }), el('p', { class: 'soluk', metin: m('p_bs_yeni_yer', { yol: D.projeler_koku }) }), el('label', { class: 'alan' }, ad),
    el('button', { class: 'dugme', 'data-eylem': 'yeni-proje', metin: m('p_bs_olustur'), onclick: async () => { try { const r = await api('/api/yeni-proje', { ad: ad.value }); await projeAc(r.kok); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }));
  const kisayol = D.kisayol ? el('button', { class: 'dugme ikincil kucuk', 'data-eylem': 'kisayol', metin: m('p_bs_kisayol'), onclick: async () => { try { await api('/api/kisayol', {}); ileti(sonuc, m('p_bs_kisayol_tamam')); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }) : null;
  koy(s, el('div', { class: 'kart' }, el('h2', { metin: m('p_bs_baslik') }), el('p', { class: 'soluk', metin: m('p_bs_aciklama') })), onay, sonuc,
    D.son_projeler.length ? son : null, yeni, var_olan, kisayol);
}
function ciz(id) { ({ proje: projeCiz, liste: listeCiz, defter: defterCiz, ayarlar: ayarlarCiz, oneri: oneriCiz })[id](); }

async function durumCiz(yer) {
  const satirlar = await api('/api/doktor'); const sonuc = el('div', { class: 'ileti' });
  const ad = { tamam: M.d_tamam || 'OK', sorun: M.d_sorun || '!', bilgi: M.d_bilgi || 'i' };
  koy(yer, el('b', { metin: m('p_durum_baslik') }), ...satirlar.map((x) => el('div', { class: 'durum-satir', 'data-durum': x.kimlik },
    el('span', { class: 'durum-etiket durum-' + x.durum, metin: x.durum === 'tamam' ? '✓' : x.durum === 'sorun' ? '✗' : 'ℹ' }),
    el('div', {}, el('div', { metin: x.metin }), x.cozum && x.durum !== 'tamam' ? el('div', { class: 'soluk', metin: x.cozum }) : null))),
    el('button', { class: 'dugme ikincil kucuk', 'data-eylem': 'hata-paketi', metin: m('p_hata_paketi'), onclick: async () => { try { const r = await api('/api/hata-paketi', {}); ileti(sonuc, r.yol); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }), sonuc);
}

function projeCiz() {
  const s = $('proje'); const sonuc = el('div', { class: 'ileti' }); const o = D.ozet; const durumKarti = el('div', { class: 'kart', id: 'durum' });
  const kaldirKutusu = el('div', { class: 'satir', hidden: '' });
  const dahil = el('input', { type: 'checkbox', id: 'defter-dahil' });
  kaldirKutusu.append(el('button', { class: 'dugme tehlike', 'data-eylem': 'kaldir-eminim', metin: m('p_eminim'), onclick: async () => { try { const r = await api('/api/kaldir', { onay: true, defter_dahil: dahil.checked }); ileti(sonuc, r.defter); await yukle(); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }),
    el('button', { class: 'dugme ikincil', metin: m('p_vazgec'), onclick: () => kaldirKutusu.hidden = true }), el('label', {}, dahil, document.createTextNode(' ' + m('p_defter_dahil'))));
  koy(s, 
    el('div', { class: 'kart' }, el('p', { metin: D.proje.kurulu ? m('p_kurulu') : m('p_kurulu_degil') }),
      o ? el('p', { metin: m('p_ozet', o) }) : null, el('p', { class: 'soluk', metin: m('p_baglam', { token: D.baglam.toplam_token }) })),
    el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_kur_aciklama') }),
      el('button', { class: 'dugme', 'data-eylem': 'kur', metin: m('p_kur'), onclick: async () => { try { const r = await api('/api/kur', {}); ileti(sonuc, m('p_kaydedildi') + ' (' + r.yazilan + '/' + r.degismeyen + ')' + (r.uyarilar.length ? ' ' + r.uyarilar.join(' ') : '')); await yukle(); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } })),
    el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_kaldir_aciklama') }),
      el('button', { class: 'dugme ikincil', 'data-eylem': 'kaldir', metin: m('p_kaldir'), onclick: () => kaldirKutusu.hidden = false }), kaldirKutusu),
    sonuc, durumKarti);
  durumCiz(durumKarti);
}

async function listeCiz() {
  const s = $('liste'); const sonuc = el('div', { class: 'ileti' }); const kayit = el('pre', { id: 'surucu-ciktisi' });
  const l = await api('/api/liste'); let isler = l.isler.length ? l.isler : [];
  const TURLER = [['hata_duzeltme', 'p_tur_hata'], ['ozellik', 'p_tur_ozellik'], ['belge', 'p_tur_belge'], ['diger', 'p_tur_diger']];
  const ajan = el('select', { id: 'ajan-sec' }); ajan.append(el('option', { value: '', metin: m('p_ajan_otomatik') }));
  { const o = el('option', { value: 'oneri', metin: m('p_ajan_oneri') }); if (l.ajan === 'oneri') o.selected = true; ajan.append(o); }
  for (const a of l.araclar) { const o = el('option', { value: a, metin: a }); if (a === l.ajan) o.selected = true; ajan.append(o); }
  const kutu = el('div', { id: 'isler' });
  const alanlar = [['soru', 'p_alan_soru'], ['beklenti', 'p_alan_beklenti'], ['yanlissa', 'p_alan_yanlissa'], ['dogrulama_komutu', 'p_alan_komut']];
  function isleriCiz() {
    kutu.replaceChildren();
    if (!isler.length) kutu.append(el('p', { class: 'soluk', metin: m('p_liste_bos') }));
    isler.forEach((is, n) => {
      const tur = el('select', { 'data-alan': 'tur' }); let bulundu = false;
      for (const [k, mt] of TURLER) { const o = el('option', { value: k, metin: m(mt) }); if (k === is.tur) { o.selected = true; bulundu = true; } tur.append(o); }
      if (!bulundu && is.tur) { const o = el('option', { value: is.tur, metin: is.tur }); o.selected = true; tur.append(o); }
      tur.onchange = () => { is.tur = tur.value; };
      const kart = el('div', { class: 'kart', 'data-is-formu': String(n) }, el('div', { class: 'satir arasi' }, el('b', { metin: m('p_is_no', { n: n + 1 }) }),
        el('button', { class: 'dugme ikincil kucuk', metin: m('p_is_sil'), onclick: () => { isler.splice(n, 1); isleriCiz(); } })));
      kart.append(el('label', { class: 'alan' }, el('span', { metin: m('p_alan_tur') }), tur));
      const zorluk = el('select', { 'data-alan': 'zorluk' });
      for (const [k, mt] of [['', 'p_zorluk_yok'], ['kolay', 'p_zorluk_kolay'], ['orta', 'p_zorluk_orta'], ['zor', 'p_zorluk_zor']]) { const o = el('option', { value: k, metin: m(mt) }); if (k === (is.zorluk || '')) o.selected = true; zorluk.append(o); }
      zorluk.onchange = () => { if (zorluk.value) is.zorluk = zorluk.value; else delete is.zorluk; };
      kart.append(el('label', { class: 'alan' }, el('span', { metin: m('p_alan_zorluk') }), zorluk));
      for (const [k, mt] of alanlar) {
        const g = el(k === 'dogrulama_komutu' ? 'input' : 'textarea', { 'data-alan': k, rows: '2' }); g.value = is[k] || ''; g.oninput = () => { is[k] = g.value; };
        kart.append(el('label', { class: 'alan' }, el('span', { metin: m(mt) }), g));
      }
      const isAjan = el('select', { 'data-alan': 'ajan' });
      for (const [k, metin] of [['', m('p_is_ajan_liste')], ['oneri', m('p_ajan_oneri')]].concat(l.araclar.map((a) => [a, a]))) { const o = el('option', { value: k, metin }); if (k === (is.ajan || '')) o.selected = true; isAjan.append(o); }
      if (is.ajan && !Array.from(isAjan.options).some((o) => o.value === is.ajan)) { const o = el('option', { value: is.ajan, metin: is.ajan }); o.selected = true; isAjan.append(o); }
      isAjan.onchange = () => { if (isAjan.value) is.ajan = isAjan.value; else delete is.ajan; };
      const zaman = sayiKutusu(is.zaman_asimi_sn, false, { 'data-alan': 'zaman_asimi_sn', min: '1' });
      zaman.onchange = () => { const v = sayiOku(zaman); if (v === null) delete is.zaman_asimi_sn; else is.zaman_asimi_sn = v; };
      kart.append(el('details', {}, el('summary', { metin: m('p_is_ozel') }),
        el('label', { class: 'alan' }, el('span', { metin: m('p_alan_is_ajan') }), isAjan),
        el('label', { class: 'alan' }, el('span', { metin: m('p_alan_zaman_asimi') }), zaman)));
      kutu.append(kart);
    });
  }
  isleriCiz();
  // Liste ayarlari (Asama 30): bos olan varsayilani kullanir.
  const la = Object.assign({}, l.liste_ayarlari || {});
  const laKart = el('details', { class: 'kart', id: 'liste-ayarlari' }, el('summary', { metin: m('p_liste_ayarlari') }), el('p', { class: 'soluk', metin: m('p_liste_ayarlari_aciklama') }));
  for (const a of l.liste_alanlari || []) {
    let g;
    if (a.tur === 'secim' || a.tur === 'evet_hayir') {
      g = el('select', { 'data-liste-ayar': a.ad });
      const secenekler = a.tur === 'secim' ? a.secenekler.map((s) => [s, (l.saklama_adlari && l.saklama_adlari[s]) || s]) : [['true', m('p_evet')], ['false', m('p_hayir')]];
      for (const [k, metin] of [['', m('p_ayardaki_deger')]].concat(secenekler)) { const o = el('option', { value: k, metin }); if (k === (la[a.ad] === null || la[a.ad] === undefined ? '' : String(la[a.ad]))) o.selected = true; g.append(o); }
      g.onchange = () => { la[a.ad] = g.value === '' ? null : a.tur === 'evet_hayir' ? g.value === 'true' : g.value; };
    } else if (a.tur === 'metin') {
      g = el('input', { 'data-liste-ayar': a.ad }); g.value = la[a.ad] || ''; g.oninput = () => { la[a.ad] = g.value.trim() === '' ? null : g.value; };
    } else {
      g = sayiKutusu(la[a.ad], a.tur === 'ondalik', { 'data-liste-ayar': a.ad, min: a.en_az === undefined ? '' : String(a.en_az) });
      g.onchange = () => { la[a.ad] = sayiOku(g); };
    }
    laKart.append(el('label', { class: 'alan' }, el('span', { metin: m('p_la_' + a.ad) }), g, el('span', { class: 'not', metin: m('p_la_' + a.ad + '_not') })));
  }
  const uyariKutusu = el('div', { class: 'kart uyari', id: 'liste-uyarilari' });
  const izinVer = async (program) => {
    try { const g = await api('/api/gelismis'); await api('/api/gelismis', { alan: 'izinli_programlar', deger: g.izinli_programlar.concat([program]) }); await kaydet(); ileti(sonuc, m('p_izin_verildi', { program })); }
    catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); }
  };
  const uyarilariGoster = (u) => { koy(uyariKutusu, ...(u && u.length ? [el('b', { metin: m('p_uyarilar') }), el('ul', {}, ...u.map((x) => el('li', { metin: m('p_uyari_satir', { n: x.is, uyari: x.uyari }) },
    x.program ? el('button', { class: 'dugme ikincil kucuk', 'data-izin-ver': x.program, metin: m('p_izin_ver', { program: x.program }), onclick: () => izinVer(x.program) }) : null)))] : [])); uyariKutusu.hidden = !(u && u.length); };
  uyarilariGoster(l.uyarilar);
  const kaydet = async () => { const r = await api('/api/liste', { isler, ajan: ajan.value, liste_ayarlari: la }); uyarilariGoster(r.uyarilar); };
  const baslat = el('button', { class: 'dugme', 'data-eylem': 'baslat', metin: m('p_baslat') });
  const durdur = el('button', { class: 'dugme ikincil', metin: m('p_durdur'), onclick: () => api('/api/sur/durdur', {}) });
  baslat.onclick = async () => { try { await kaydet(); await api('/api/sur', {}); izle(); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } };
  let izleyici;
  async function izle() { clearInterval(izleyici); const tur = async () => { const d = await api('/api/sur'); kayit.textContent = d.satirlar.join('\\n'); baslat.disabled = d.calisiyor; ileti(sonuc, d.calisiyor ? m('p_calisiyor') : d.satirlar.length ? m('p_bitti') : ''); if (!d.calisiyor) clearInterval(izleyici); }; await tur(); izleyici = setInterval(tur, 1500); }
  koy(s, 
    l.bozuk ? el('div', { class: 'kart uyari', metin: m('p_liste_bozuk') }) : null,
    uyariKutusu,
    el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_liste_aciklama') }), el('label', { class: 'alan' }, el('span', { metin: m('p_ajan_sec') }), ajan)),
    kutu,
    laKart,
    el('div', { class: 'kart' }, el('div', { class: 'satir' }, el('button', { class: 'dugme ikincil', metin: m('p_is_ekle'), onclick: () => { isler.push({ tur: 'hata_duzeltme', soru: '', beklenti: '', yanlissa: '', dogrulama_komutu: '' }); isleriCiz(); } }),
      el('button', { class: 'dugme ikincil', 'data-eylem': 'liste-kaydet', metin: m('p_kaydet'), onclick: async () => { try { await kaydet(); ileti(sonuc, m('p_kaydedildi')); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }), baslat, durdur), sonuc),
    el('details', { class: 'kart' }, el('summary', { metin: m('p_ayrintili_kayit') }), kayit));
  izle();
}

async function defterCiz() {
  const s = $('defter'); const isler = await api('/api/isler');
  const ust = el('div', { class: 'satir' }, el('a', { class: 'dugme ikincil', href: '/rapor?anahtar=' + ANAHTAR, target: '_blank', metin: m('p_rapor_ac') }), el('button', { class: 'dugme ikincil', metin: m('p_yenile'), onclick: () => defterCiz() }));
  const kartlar = isler.length === 0 ? [el('div', { class: 'kart' }, el('p', { metin: m('p_defter_bos') }))] : isler.map((i) => {
    const sonuc = el('div', { class: 'ileti' }); const onizleme = el('div', { class: 'onizleme', 'data-onizleme': String(i.id) });
    return el('div', { class: 'kart is ' + i.durum, 'data-is': String(i.id) },
      el('div', {}, el('span', { class: 'rozet', metin: m('p_durum_' + i.durum) }), document.createTextNode(' · ' + m('p_is', { id: i.id }) + (i.geri_alindi ? ' · ' + m('p_geri_alindi_rozet') : ''))),
      el('p', { metin: i.soru }),
      i.supheler.length ? el('p', { class: 'soluk', metin: m('p_supheli') + ': ' + i.supheler.join('; ') }) : null,
      el('p', { class: 'soluk', metin: m('p_ayrinti', { sure: i.sure_sn === null ? '-' : i.sure_sn + ' s', maliyet: i.maliyet_usd === null ? m('p_bilinmiyor') : i.maliyet_usd + ' USD', ajan: i.ajan, deneme: i.deneme }) }),
      i.geri_alinabilir ? el('button', { class: 'dugme ikincil', 'data-eylem': 'geri-al', metin: m('p_geri_al'), onclick: () => onizle(i.id, onizleme, sonuc) }) : null,
      onizleme, sonuc);
  });
  koy(s, el('div', { class: 'kart' }, ust), ...kartlar);
}

// Geri alma iki adimlidir: once neyin olacagi gosterilir (deneme), sonra "Eminim" ile uygulanir.
async function onizle(id, yer, sonuc) {
  try {
    const r = await api('/api/geri-al', { id, deneme: true });
    const satirlar = [...r.geri_yuklenen.map((y) => m('p_onizleme_yuklenecek', { yol: y })), ...r.silinen.map((y) => m('p_onizleme_silinecek', { yol: y })),
      ...r.geri_getirilen.map((y) => m('p_onizleme_gelecek', { yol: y })), ...r.cakisan.map((y) => m('p_onizleme_cakisan', { yol: y }))];
    const degisecek = r.geri_yuklenen.length + r.silinen.length + r.geri_getirilen.length;
    koy(yer, el('p', { metin: degisecek ? m('p_onizleme_baslik') : m('p_onizleme_bos') }), el('ul', {}, ...satirlar.map((s) => el('li', { metin: s }))),
      degisecek ? el('div', { class: 'satir' },
        el('button', { class: 'dugme tehlike', 'data-eylem': 'geri-al-eminim', metin: m('p_eminim_geri'), onclick: async () => { try { const s = await api('/api/geri-al', { id, onay: true }); koy(yer); ileti(sonuc, m('p_geri_alindi', { sayi: s.geri_yuklenen.length + s.silinen.length + s.geri_getirilen.length, cakisan: s.cakisan.length })); } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } } }),
        el('button', { class: 'dugme ikincil', metin: m('p_vazgec'), onclick: () => koy(yer) })) : null);
  } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); }
}

function ayarlarCiz() {
  const s = $('ayarlar'); const notlar = D.ayarlar.find((a) => a.ad === 'bilgi_notlari').deger !== false; const sonuc = el('div', { class: 'ileti', id: 'ayar-iletisi' });
  const degistir = async (ad, deger) => { try { const r = await api('/api/ayar', { ad, deger }); await yukle(); ileti($('ayar-iletisi') || sonuc, m('p_kaydedildi')); } catch (e) { await yukle(); ileti($('ayar-iletisi') || sonuc, m('p_hata', { hata: e.message }), true); } };
  const goster = el('input', { type: 'checkbox', id: 'bilgi-notlari' }); goster.checked = notlar; goster.onchange = () => degistir('bilgi_notlari', goster.checked);
  const liste = el('div', { class: 'kart' });
  for (const a of D.ayarlar.filter((x) => x.ad !== 'bilgi_notlari')) {
    let girdi;
    if (a.secenekler) { girdi = el('select', { 'data-ayar': a.ad }); for (const sec of a.secenekler) { const o = el('option', { value: sec, metin: (a.secenek_adlari && a.secenek_adlari[sec]) || sec }); if (sec === a.deger) o.selected = true; girdi.append(o); } girdi.onchange = () => degistir(a.ad, girdi.value); }
    else if (a.sayi) { girdi = el('input', { type: 'number', min: String(a.sayi.en_az), max: String(a.sayi.en_cok), value: String(a.deger), 'data-ayar': a.ad, class: 'sayi' }); girdi.onchange = () => degistir(a.ad, girdi.value); }
    else { const k = el('input', { type: 'checkbox', 'data-ayar': a.ad, role: 'switch' }); k.checked = a.deger === true; k.onchange = () => degistir(a.ad, k.checked); girdi = el('label', { class: 'anahtar' }, k, el('span', { metin: a.deger === true ? m('p_acik') : m('p_kapali') })); }
    const ac = el('button', { class: 'baglanti', 'data-dosya': a.ad, metin: m('p_dosyayi_ac'), onclick: async () => { try { const r = await api('/api/dosya-ac', { ayar: a.ad }); ileti($('ayar-iletisi') || sonuc, m('p_acildi', { yol: r.acilan })); } catch (e) { ileti($('ayar-iletisi') || sonuc, m('p_hata', { hata: e.message }), true); } } });
    const blok = el('div', { class: 'ayar', 'data-ayar-blok': a.ad },
      el('div', { class: 'ayar-satir' }, el('div', { class: 'ayar-metin' }, el('div', { class: 'ayar-baslik', metin: a.baslik }), el('div', { class: 'soluk', metin: a.aciklama })), girdi),
      ac);
    if (notlar) blok.append(...[el('p', { class: 'not', metin: m('p_amac') + ': ' + a.amac }), el('p', { class: 'not', metin: m('p_sonuc') + ': ' + a.sonuc }), el('p', { class: 'not', metin: m('p_varsayilan') + ': ' + a.varsayilan_aciklama }), a.etki === 'kurulum' ? el('p', { class: 'not', metin: m('p_degisiklik_kurulum') }) : null].filter(Boolean));
    liste.append(blok);
  }
  const gelismis = el('div', { id: 'gelismis' });
  koy(s, el('div', { class: 'kart' }, el('label', { class: 'satir' }, goster, document.createTextNode(m('p_bilgi_goster')))), sonuc, liste, gelismis);
  gelismisCiz(gelismis, notlar);
}

// Gelismis (Asama 30): mihenk.json'un ayar disi alanlari; dosya elle duzenlenmez.
async function gelismisCiz(yer, notlar, mesaj) {
  const g = await api('/api/gelismis'); const sonuc = el('div', { class: 'ileti', id: 'gelismis-iletisi' }); if (mesaj) ileti(sonuc, mesaj);
  const kaydet = async (alan, deger) => { try { await api('/api/gelismis', { alan, deger }); await gelismisCiz(yer, notlar, m('p_kaydedildi')); const d = yer.querySelector('details'); if (d) d.open = true; } catch (e) { ileti(sonuc, m('p_hata', { hata: e.message }), true); } };
  const not = (k) => notlar ? el('p', { class: 'not', metin: m(k) }) : null;
  // 1. Izinli programlar
  const yeni = el('input', { placeholder: m('p_gl_program_adi'), 'data-gelismis': 'izinli-yeni' });
  const izinli = el('div', { class: 'kart', 'data-gelismis': 'izinli_programlar' }, el('b', { metin: m('p_gl_izinli') }), not('p_gl_izinli_not'),
    el('div', { class: 'satir' }, ...g.izinli_programlar.map((p) => el('span', { class: 'satir' }, el('code', { metin: p }), el('button', { class: 'dugme ikincil kucuk', metin: m('p_gl_kaldir'), onclick: () => kaydet('izinli_programlar', g.izinli_programlar.filter((x) => x !== p)) })))),
    el('div', { class: 'satir' }, yeni, el('button', { class: 'dugme ikincil kucuk', metin: m('p_gl_ekle'), onclick: () => { if (yeni.value.trim()) kaydet('izinli_programlar', g.izinli_programlar.concat([yeni.value.trim()])); } }),
      el('button', { class: 'dugme ikincil kucuk', metin: m('p_gl_varsayilana_don'), onclick: () => kaydet('izinli_programlar', g.varsayilan_izinli) })));
  // 2. Kota ve 3. fiyat tablolari: satir satir; "Kaydet" butun tabloyu yazar.
  const tablo = (alan, baslik, aciklama, sutunlar, kayitlar, adAlani) => {
    const satirlar = Object.entries(kayitlar).map(([ad, d]) => Object.assign({ ad }, d));
    const govde = el('div', {});
    const ciz = () => { govde.replaceChildren(); satirlar.forEach((r, i) => {
      const adKutusu = adAlani(r); const kutular = sutunlar.map(([k, mt, ondalik]) => { const x = sayiKutusu(r[k], ondalik, { 'data-sutun': k, min: '0', title: m(mt) }); x.onchange = () => { r[k] = sayiOku(x); }; return el('label', { class: 'alan' }, el('span', { metin: m(mt) }), x); });
      govde.append(el('div', { class: 'satir', 'data-satir': String(i) }, adKutusu, ...kutular, el('button', { class: 'dugme ikincil kucuk', metin: m('p_gl_kaldir'), onclick: () => { satirlar.splice(i, 1); ciz(); } })));
    }); };
    ciz();
    return el('div', { class: 'kart', 'data-gelismis': alan }, el('b', { metin: m(baslik) }), not(aciklama), govde,
      el('div', { class: 'satir' }, el('button', { class: 'dugme ikincil kucuk', metin: m('p_gl_satir_ekle'), onclick: () => { satirlar.push({ ad: '' }); ciz(); } }),
        el('button', { class: 'dugme kucuk', metin: m('p_kaydet'), onclick: () => { const d = {}; for (const r of satirlar) { if (!r.ad) continue; const v = {}; for (const [k] of sutunlar) if (r[k] !== null && r[k] !== undefined) v[k] = r[k]; d[r.ad] = v; } kaydet(alan, d); } })));
  };
  const aracSec = (r) => { const s = el('select', { 'data-sutun': 'ad' }); for (const a of [''].concat(g.araclar)) { const o = el('option', { value: a, metin: a || '-' }); if (a === r.ad) o.selected = true; s.append(o); } if (r.ad && !g.araclar.includes(r.ad)) { const o = el('option', { value: r.ad, metin: r.ad }); o.selected = true; s.append(o); } s.onchange = () => { r.ad = s.value; }; return el('label', { class: 'alan' }, el('span', { metin: m('p_gl_arac') }), s); };
  const adYaz = (r) => { const s = el('input', { 'data-sutun': 'ad' }); s.value = r.ad || ''; s.oninput = () => { r.ad = s.value.trim(); }; return el('label', { class: 'alan' }, el('span', { metin: m('p_gl_fiyat_ad') }), s); };
  const kota = tablo('kota', 'p_gl_kota', 'p_gl_kota_not', [['pencere_saat', 'p_gl_pencere_saat', true], ['kapasite', 'p_gl_kapasite', false], ['pencere_usd', 'p_gl_pencere_usd', true]], g.kota, aracSec);
  const fiyat = tablo('fiyatlar', 'p_gl_fiyat', 'p_gl_fiyat_not', [['girdi', 'p_gl_girdi', true], ['cikti', 'p_gl_cikti', true], ['onbellek_okuma', 'p_gl_okuma', true], ['onbellek_yazma', 'p_gl_yazma', true]], g.fiyatlar, adYaz);
  // 4. Denetim sureleri
  const sureler = el('div', { class: 'kart', 'data-gelismis': 'sureler' }, el('b', { metin: m('p_gl_sureler') }));
  for (const x of g.sayilar) { const k = sayiKutusu(x.deger, false, { 'data-gelismis': x.ad, min: String(x.en_az), max: String(x.en_cok) }); k.onchange = () => kaydet(x.ad, sayiOku(k)); sureler.append(el('label', { class: 'alan' }, el('span', { metin: m('p_gl_' + x.ad) + ' (' + m('p_varsayilan') + ': ' + x.varsayilan + ')' }), k)); }
  koy(yer, el('details', { class: 'kart' }, el('summary', { metin: m('p_gelismis') }), el('p', { class: 'soluk', metin: m('p_gelismis_aciklama') }), sonuc, izinli, kota, fiyat, sureler));
}

async function oneriCiz() {
  const s = $('oneri'); const o = await api('/api/oneri');
  const k = o.kullanim; const kartlar = [el('div', { class: 'kart' }, el('p', { class: 'soluk', metin: m('p_oneri_aciklama') }), k ? el('p', { metin: m('p_toplam_maliyet', { sure: k.ajan_sure_sn, maliyet: k.maliyet_usd === null ? m('p_bilinmiyor') : k.maliyet_usd + ' USD' }) }) : null)];
  const ms = el('div', { class: 'ileti' });
  kartlar[0].append(el('button', { class: 'dugme ikincil kucuk', 'data-eylem': 'maliyet-topla', metin: m('p_maliyet_topla'), onclick: async () => { try { const r = await api('/api/maliyet-topla', {}); ileti(ms, r.eklenen + ' / ' + r.bos + ' / ' + r.zaten + ' · ' + r.mesaj); } catch (e) { ileti(ms, m('p_hata', { hata: e.message }), true); } } }), ms);
  if (!o.turler.length) kartlar.push(el('div', { class: 'kart' }, el('p', { metin: m('p_oneri_yok_veri') })));
  for (const t of o.turler) {
    const kart = el('div', { class: 'kart' }, el('b', { metin: m('p_oneri_tur', { tur: t.tur, sayi: t.is_sayisi }) }),
      el('p', { metin: t.oneri ? m('p_onerilen', { ajan: t.oneri.ajan }) : m('p_oneri_yok_veri') }));
    if (t.kesif && t.kesif.length) kart.append(el('p', { class: 'soluk', metin: m('p_kesif', { liste: t.kesif.map((k) => k.ajan + ' (' + k.is_sayisi + ')').join(', ') }) }));
    for (const x of t.secenekler) kart.append(el('p', { class: 'soluk', metin: m('p_oneri_satir', { ajan: x.ajan, gecen: x.gecen, toplam: x.is_sayisi, maliyet: x.maliyet_metni ? ', ' + x.maliyet_metni : '' }) }));
    kartlar.push(kart);
  }
  koy(s, ...kartlar);
}
yukle().catch((e) => { document.body.textContent = String(e.message || e); });
</script></body></html>
`;
