#!/usr/bin/env node
// mihenk komut satiri.
//   mihenk kur [--hedef <proje>] [--arac claude,codex,gemini,antigravity,opencode,kilo]   paketi projeye kurar
//   mihenk sur [--hedef <proje>] [--liste <dosya>] [--ajan <ad>] [--saklama yok|yerel|yerel_gonder] [--uyanik-tut]
//              [--deneme <n>] [--oturum-sn <n>] [--baglam-esigi <n>]                 is listesini yurutur
// Iletiler kisa ve duzdur; Windows konsolunda bozulmamasi icin Turkce'ye ozgu harfler kullanilmaz.
import { join, resolve } from 'node:path';
import { AJANLAR } from './ajanlar.js';
import { ARACLAR, kur, type Arac } from './kur.js';
import { SAKLAMA_KIPLERI, type SaklamaKipi } from './saklama.js';
import { listeOku, listeyiYurut, uyanikIstendiMi } from './surucu.js';
import { uyanikTut, uykuAyariniOku, uykuUyarisi } from './uyanik.js';
import { KONTROL_ACIKLAMASI, raporMetni, SENARYOLAR, senaryoKostur, uyumOzeti, type SenaryoSonucu } from './uyum.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Defter } from './defter.js';
import { kaldir } from './kaldir.js';
import { geriAl } from './geri.js';
import { raporYaz } from './rapor.js';
import { pencereAc, VARSAYILAN_PORT } from './pencere.js';
import { doktor, doktorMetni, hataPaketi } from './doktor.js';
import { elOturumlariniTopla } from './el-oturumu.js';
import { listeDenetimi, listeDenetimMetni } from './liste-denetim.js';
import { spawnSync } from 'node:child_process';
import { ayarKomutu } from './ayar-cli.js';
import { ayarlariOku } from './ayar.js';
import { dilAyarla, sistemDili, t } from './dil.js';
import { oneriHesapla, oneriMetni, VARSAYILAN_ONERI_AYARLARI, type OneriAyarlari } from './oneri.js';

const [komut, ...gerisi] = process.argv.slice(2);
// Dil: projenin "dil" ayari (sistem / tr / en). Proje --hedef ile verilir, yoksa calisilan klasor.
{
  const i = gerisi.indexOf('--hedef');
  const d = ayarlariOku(resolve(i >= 0 ? gerisi[i + 1]! : process.cwd())).dil;
  dilAyarla(d === 'en' || d === 'tr' ? d : sistemDili());
}
const secenek = (ad: string): string | undefined => {
  const i = gerisi.indexOf(ad);
  return i >= 0 ? gerisi[i + 1] : undefined;
};
const sayi = (ad: string): number | undefined => {
  const d = secenek(ad);
  if (d === undefined) return undefined;
  const n = Number(d);
  if (!Number.isInteger(n) || n < 1) throw new Error(t('pozitif_tam_sayi', { ad, deger: d }));
  return n;
};

function kullanim(): void {
  for (const k of ['kullanim', 'kullanim_kur', 'kullanim_sur', 'kullanim_uyum', 'kullanim_ayar', 'kullanim_rapor', 'kullanim_geri', 'kullanim_kaldir', 'kullanim_oneri', 'kullanim_pencere', 'kullanim_doktor', 'kullanim_hata_paketi', 'kullanim_maliyet', 'kullanim_defter'] as const) {
    console.error(t(k));
  }
}

/**
 * Uyum testleri: her arac her senaryoda kendi basina (surucusuz) calisir; yonteme uyup uymadigi olculur.
 * Arac ya da model surumu degisince yeniden kosulur. Sonuc <cikis>/uyum-raporu.md ve .json.
 */
async function uyumKomutu(): Promise<number> {
  const istenen = (secenek('--arac') ?? Object.keys(AJANLAR).join(',')).split(',').map((a) => a.trim()).filter(Boolean);
  const senaryoAdlari = (secenek('--senaryo') ?? SENARYOLAR.map((s) => s.ad).join(',')).split(',').map((a) => a.trim());
  const cikis = resolve(secenek('--cikis') ?? join(process.cwd(), 'mihenk-uyum'));
  const sonuclar: SenaryoSonucu[] = [];
  for (const ad of istenen) {
    const tanim = AJANLAR[ad];
    if (!tanim) throw new Error(t('bilinmeyen_arac', { ad, gecerli: Object.keys(AJANLAR).join(', ') }));
    if (!tanim.komutBul()) {
      console.log(t('uyum_bulunamadi', { ad }));
      continue;
    }
    for (const s of SENARYOLAR.filter((x) => senaryoAdlari.includes(x.ad))) {
      console.log(t('uyum_basliyor', { ad, senaryo: s.ad }));
      const r = await senaryoKostur({ tanim, kurulacakArac: ad as Arac, senaryo: s, dizin: join(cikis, ad, s.ad), zamanAsimiSn: sayi('--oturum-sn') ?? 600 });
      const kalan = r.kontroller.filter((k) => !k.gecti).map((k) => KONTROL_ACIKLAMASI[k.ad]);
      const durum = r.gecersiz ? t('uyum_gecersiz', { neden: r.gecersiz }) : kalan.length === 0 ? t('uyum_uydu') : t('uyum_uymadi', { kurallar: kalan.join('; ') });
      console.log(t('uyum_satir', { ad, senaryo: s.ad, durum, yapildi: t(r.basari ? 'uyum_yapildi' : 'uyum_yapilmadi'), beyan: r.beyan ?? t('yok') }));
      sonuclar.push(r);
    }
  }
  mkdirSync(cikis, { recursive: true });
  writeFileSync(join(cikis, 'uyum-raporu.md'), raporMetni(sonuclar));
  writeFileSync(join(cikis, 'uyum-raporu.json'), JSON.stringify({ tarih: new Date().toISOString(), ozet: uyumOzeti(sonuclar), sonuclar }, null, 2) + '\n');
  for (const u of uyumOzeti(sonuclar)) console.log(t('uyum_ozet', { arac: u.arac, gecen: u.gecen, toplam: u.toplam, oran: Math.round(u.oran * 100), basarili: u.basarili_senaryo, senaryo: u.senaryo }));
  console.log(t('rapor_yolu', { yol: join(cikis, 'uyum-raporu.md') }));
  return 0;
}

/**
 * Oneri: projenin defterindeki kapanmis islerden is turu basina ajan onerisi. Yalniz okur, hicbir seyi degistirmez.
 * Uyum raporu varsa (varsayilan <hedef>/mihenk-uyum/uyum-raporu.json) arac basina uyum orani hesaba girer.
 */
function oneriKomutu(): number {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  if (!existsSync(join(kok, '.mihenk', 'defter.db'))) {
    console.log(t('defter_yok_oneri', { kok }));
    return 0;
  }
  const oran = (ad: string, varsayilan: number): number => {
    const d = secenek(ad);
    if (d === undefined) return varsayilan;
    const n = Number(d);
    if (!(n >= 0 && n <= 1)) throw new Error(t('oran_hatasi', { ad, deger: d }));
    return n;
  };
  const uyumYolu = resolve(secenek('--uyum') ?? join(kok, 'mihenk-uyum', 'uyum-raporu.json'));
  let uyum: OneriAyarlari['uyum'];
  if (existsSync(uyumYolu)) {
    const ozet = (JSON.parse(readFileSync(uyumYolu, 'utf8')) as { ozet?: Array<{ arac: string; gecen: number; toplam: number }> }).ozet ?? [];
    uyum = Object.fromEntries(ozet.map((u) => [u.arac, { gecen: u.gecen, toplam: u.toplam }]));
  }
  const ayarlar: Partial<OneriAyarlari> = {
    esik: oran('--esik', VARSAYILAN_ONERI_AYARLARI.esik), enAz: sayi('--en-az') ?? VARSAYILAN_ONERI_AYARLARI.enAz,
    ...(uyum ? { uyum } : {}),
  };
  const defter = new Defter(kok);
  const turler = oneriHesapla(defter.olcumler(), ayarlar);
  defter.kapat();
  if (gerisi.includes('--json')) console.log(JSON.stringify(turler, null, 2));
  else {
    if (uyum) console.log(t('uyum_raporu', { yol: uyumYolu }));
    console.log(oneriMetni(turler, ayarlar));
  }
  return 0;
}

/** Duz dilde tek sayfa rapor: .mihenk/rapor.html. --ac ile varsayilan tarayicida acilir. */
function raporKomutu(): number {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  if (!existsSync(join(kok, '.mihenk', 'defter.db'))) {
    console.log(t('defter_yok_rapor', { kok }));
    return 0;
  }
  const yol = raporYaz(kok);
  console.log(t('rapor_yolu', { yol }));
  if (gerisi.includes('--ac')) {
    if (process.platform === 'win32') spawnSync('cmd.exe', ['/d', '/c', 'start', '""', `"${yol}"`], { windowsHide: true, windowsVerbatimArguments: true });
    else spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [yol]);
  }
  return 0;
}

/** Bir isin dosya degisikliklerini geri alir; is bittikten sonra degisen dosyalara dokunmaz. */
function geriAlKomutu(): number {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  const id = Number(gerisi.find((x) => /^\d+$/.test(x)));
  if (!Number.isInteger(id) || id < 1) throw new Error(t('geri_kullanim'));
  const s = geriAl(kok, id, { deneme: gerisi.includes('--deneme') });
  const on = s.deneme ? t('geri_deneme_onek') : '';
  for (const d of s.geri_yuklenen) console.log(t('geri_yuklendi', { on, yol: d }));
  for (const d of s.silinen) console.log(t('geri_silindi', { on, yol: d }));
  for (const d of s.geri_getirilen) console.log(t('geri_getirildi', { on, yol: d }));
  for (const d of s.cakisan) console.log(t('geri_cakisan', { yol: d }));
  for (const d of s.atlanan) console.log(t('geri_atlanan', { yol: d }));
  const toplam = s.geri_yuklenen.length + s.silinen.length + s.geri_getirilen.length;
  console.log(toplam === 0 && s.cakisan.length === 0 ? t('geri_bos', { id }) : t('geri_ozet', { id, sayi: toplam, ne: t(s.deneme ? 'geri_alinacak' : 'geri_alindi'), cakisma: s.cakisan.length ? t('geri_cakisma_ek', { sayi: s.cakisan.length }) : '' }));
  if (!s.deneme && toplam > 0) console.log(t('geri_git_notu'));
  return s.cakisan.length > 0 ? 1 : 0;
}

function kaldirKomutu(): number {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  console.log(t('kaldir_basliyor', { kok }));
  const s = kaldir(kok, { defterDahil: gerisi.includes('--defter-dahil'), cmdDen: gerisi.includes('--cmd-den') });
  for (const d of s.silinen) console.log(t('kaldir_silindi', { yol: d }));
  for (const d of s.geri_yuklenen) console.log(t('kaldir_geri', { yol: d }));
  for (const d of s.ayiklanan) console.log(t('kaldir_ayiklandi', { yol: d }));
  for (const d of s.birakilan) console.log(t('kaldir_dokunulmadi', { yol: d }));
  console.log(s.defter.charAt(0).toUpperCase() + s.defter.slice(1) + '.');
  console.log(t('kaldir_bitti'));
  return 0;
}

function kurKomutu(): number {
  const istenen = (secenek('--arac') ?? ARACLAR.join(',')).split(',').map((a) => a.trim()).filter(Boolean);
  const bilinmeyen = istenen.filter((a) => !ARACLAR.includes(a as Arac));
  if (bilinmeyen.length > 0) throw new Error(t('bilinmeyen_arac', { ad: bilinmeyen.join(', '), gecerli: ARACLAR.join(', ') }));
  // --arac verilmezse kurulum ayarlara (mihenk.json) esitlenir: kapatilmis ozelliklerin dosyalari geri alinir.
  const sonuc = secenek('--arac') === undefined
    ? kur(secenek('--hedef') ?? process.cwd(), { esitle: true })
    : kur(secenek('--hedef') ?? process.cwd(), { araclar: istenen as Arac[] });
  for (const d of sonuc.geri_alinan ?? []) console.log(t('kur_geri_alindi', { yol: d }));
  for (const d of sonuc.yazilan) console.log(t('kur_yazildi', { yol: d }));
  for (const u of sonuc.uyarilar) console.log(t('kur_uyari', { metin: u }));
  console.log(t('kur_ozet', { yazilan: sonuc.yazilan.length, degismeyen: sonuc.degismeyen.length }));
  return 0;
}

async function surKomutu(): Promise<number> {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  const listeYolu = resolve(secenek('--liste') ?? join(kok, 'mihenk-isler.json'));
  const liste = listeOku(listeYolu);
  const saklama = secenek('--saklama') as SaklamaKipi | undefined;
  if (saklama !== undefined && !SAKLAMA_KIPLERI.includes(saklama)) {
    throw new Error(t('saklama_hatasi', { gecerli: SAKLAMA_KIPLERI.join(', ') }));
  }

  // Ajan secimi: kullanici her zaman elle secebilir; secmediyse kurulu olan ilk arac (once ucretsiz calisabilenler).
  const bulunan = ['codex', 'opencode', 'kilo', 'claude'].filter((ad) => AJANLAR[ad]?.komutBul() != null);
  const ajan = secenek('--ajan') ?? liste.ajan ?? bulunan[0];
  console.log(t('sur_proje', { kok }));
  console.log(t('sur_liste', { yol: listeYolu, sayi: liste.isler.length }));
  console.log(t('sur_araclar', { bulunan: bulunan.length > 0 ? bulunan.join(', ') : t('yok'), varsayilan: ajan ?? t('yok') }));
  if (!ajan && liste.isler.some((i) => !i.ajan)) {
    throw new Error(t('sur_ajan_yok'));
  }

  // Baslamadan once liste denetimi (Asama 20): engellemez, uyarir.
  const uyarilar = listeDenetimi(kok, liste.isler, { ajan });
  if (uyarilar.length) console.log(listeDenetimMetni(uyarilar));
  const uyanikIstendi = uyanikIstendiMi({ bayrak: gerisi.includes('--uyanik-tut'), liste, kok });
  let durdur = (): void => undefined;
  if (uyanikIstendi) {
    const u = await uyanikTut();
    console.log(t(u.tamam ? 'sur_uyanik' : 'sur_uyari', { not: u.not }));
    durdur = () => u.tutucu.durdur();
  } else {
    const uyari = uykuUyarisi(uykuAyariniOku());
    if (uyari) console.log(uyari);
  }

  try {
    const denemeSiniri = sayi('--deneme');
    const ajanZamanAsimiSn = sayi('--oturum-sn');
    const baglamEsigi = sayi('--baglam-esigi');
    const rapor = await listeyiYurut({
      kok, liste,
      ...(ajan === undefined ? {} : { varsayilanAjan: ajan }),
      ...(saklama === undefined ? {} : { saklama }),
      ...(denemeSiniri === undefined ? {} : { denemeSiniri }),
      ...(ajanZamanAsimiSn === undefined ? {} : { ajanZamanAsimiSn }),
      ...(baglamEsigi === undefined ? {} : { baglamEsigi }),
      bildirim: true,
    });
    console.log(t('sur_ayrinti', { yol: join(kok, '.mihenk', 'defter.jsonl') }));
    return rapor.ozet.gecti === rapor.ozet.toplam ? 0 : 1;
  } finally {
    durdur();
  }
}

try {
  if (komut === 'kur') process.exitCode = kurKomutu();
  else if (komut === 'sur') process.exitCode = await surKomutu();
  else if (komut === 'uyum') process.exitCode = await uyumKomutu();
  else if (komut === 'oneri') process.exitCode = oneriKomutu();
  else if (komut === 'kaldir') process.exitCode = kaldirKomutu();
  else if (komut === 'geri-al') process.exitCode = geriAlKomutu();
  else if (komut === 'rapor') process.exitCode = raporKomutu();
  else if (komut === 'doktor') {
    const satirlar = doktor(resolve(secenek('--hedef') ?? process.cwd()));
    console.log(doktorMetni(satirlar));
    process.exitCode = satirlar.some((x) => x.durum === 'sorun') ? 1 : 0;
  }
  else if (komut === 'maliyet-topla') {
    console.log(t('mt_sonuc', { ...elOturumlariniTopla(resolve(secenek('--hedef') ?? process.cwd())) }));
    console.log(t('mt_fiyat'));
  }
  else if (komut === 'hata-paketi') console.log(t('hp_yazildi', { yol: hataPaketi(resolve(secenek('--hedef') ?? process.cwd())) }));
  else if (komut === 'pencere') {
    const p = await pencereAc(resolve(secenek('--hedef') ?? process.cwd()), { port: sayi('--port') ?? VARSAYILAN_PORT });
    console.log(t('pencere_acildi', { url: p.url }));
    console.log(t('pencere_kapat'));
    if (!gerisi.includes('--acma')) {
      if (process.platform === 'win32') spawnSync('cmd.exe', ['/d', '/c', 'start', '""', `"${p.url}"`], { windowsHide: true, windowsVerbatimArguments: true });
      else spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [p.url]);
    }
    await new Promise(() => undefined); // Ctrl+C ya da pencerenin kapanmasina dek
  }
  else if (komut === 'ayar') process.exitCode = await ayarKomutu();
  else {
    kullanim();
    process.exitCode = komut === undefined || komut === '--help' ? 0 : 2;
  }
} catch (e) {
  console.error(t('hata', { komut: komut ?? '', mesaj: e instanceof Error ? e.message : String(e) }));
  process.exitCode = 1;
}
