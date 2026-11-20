#!/usr/bin/env node
// mihenk komut satiri.
//   mihenk kur [--hedef <proje>] [--arac claude,codex,gemini,antigravity,opencode]   paketi projeye kurar
//   mihenk sur [--hedef <proje>] [--liste <dosya>] [--ajan <ad>] [--saklama yok|yerel|yerel_gonder] [--uyanik-tut]
//              [--deneme <n>] [--oturum-sn <n>] [--baglam-esigi <n>]                 is listesini yurutur
// Iletiler kisa ve duzdur; Windows konsolunda bozulmamasi icin Turkce'ye ozgu harfler kullanilmaz.
import { join, resolve } from 'node:path';
import { AJANLAR } from './ajanlar.js';
import { ARACLAR, kur, type Arac } from './kur.js';
import { SAKLAMA_KIPLERI, type SaklamaKipi } from './saklama.js';
import { listeOku, listeyiYurut } from './surucu.js';
import { uyanikTut, uykuAyariniOku, uykuUyarisi } from './uyanik.js';
import { KONTROL_ACIKLAMASI, raporMetni, SENARYOLAR, senaryoKostur, uyumOzeti, type SenaryoSonucu } from './uyum.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Defter } from './defter.js';
import { kaldir } from './kaldir.js';
import { oneriHesapla, oneriMetni, VARSAYILAN_ONERI_AYARLARI, type OneriAyarlari } from './oneri.js';

const [komut, ...gerisi] = process.argv.slice(2);
const secenek = (ad: string): string | undefined => {
  const i = gerisi.indexOf(ad);
  return i >= 0 ? gerisi[i + 1] : undefined;
};
const sayi = (ad: string): number | undefined => {
  const d = secenek(ad);
  if (d === undefined) return undefined;
  const n = Number(d);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${ad} pozitif bir tam sayi olmali (gelen: ${d}).`);
  return n;
};

function kullanim(): void {
  console.error('kullanim:');
  console.error('  mihenk kur [--hedef <proje klasoru>] [--arac claude,codex,gemini,antigravity,opencode]');
  console.error('  mihenk sur [--hedef <proje klasoru>] [--liste <dosya>] [--ajan claude|codex|opencode]');
  console.error('             [--saklama yok|yerel|yerel_gonder] [--uyanik-tut]');
  console.error('  mihenk uyum [--arac claude,codex,opencode] [--senaryo duzeltme,tuzak,karar] [--cikis <klasor>]');
  console.error('  mihenk kaldir [--hedef <proje klasoru>] [--defter-dahil]   kurulumun ekledigi her seyi geri alir');
  console.error('  mihenk oneri [--hedef <proje klasoru>] [--esik 0.5] [--en-az 5] [--uyum <uyum-raporu.json>] [--json]');
  console.error('Defter sunucusu ayri calisir: mihenk-defter [--kok <proje klasoru>]');
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
    if (!tanim) throw new Error(`bilinmeyen arac: ${ad}. Gecerli: ${Object.keys(AJANLAR).join(', ')}`);
    if (!tanim.komutBul()) {
      console.log(`${ad}: bu bilgisayarda bulunamadi, atlandi.`);
      continue;
    }
    for (const s of SENARYOLAR.filter((x) => senaryoAdlari.includes(x.ad))) {
      console.log(`${ad} / ${s.ad}: basliyor...`);
      const r = await senaryoKostur({ tanim, kurulacakArac: ad as Arac, senaryo: s, dizin: join(cikis, ad, s.ad), zamanAsimiSn: sayi('--oturum-sn') ?? 600 });
      const kalan = r.kontroller.filter((k) => !k.gecti).map((k) => KONTROL_ACIKLAMASI[k.ad]);
      console.log(`${ad} / ${s.ad}: ${r.gecersiz ? `GECERSIZ (${r.gecersiz})` : kalan.length === 0 ? 'butun kurallara uydu' : `uymadi: ${kalan.join('; ')}`}` +
        ` | is ${r.basari ? 'yapildi' : 'yapilmadi'}, beyan ${r.beyan ?? 'yok'}`);
      sonuclar.push(r);
    }
  }
  mkdirSync(cikis, { recursive: true });
  writeFileSync(join(cikis, 'uyum-raporu.md'), raporMetni(sonuclar));
  writeFileSync(join(cikis, 'uyum-raporu.json'), JSON.stringify({ tarih: new Date().toISOString(), ozet: uyumOzeti(sonuclar), sonuclar }, null, 2) + '\n');
  for (const u of uyumOzeti(sonuclar)) console.log(`${u.arac}: uyum ${u.gecen}/${u.toplam} (%${Math.round(u.oran * 100)}), basarili senaryo ${u.basarili_senaryo}/${u.senaryo}`);
  console.log(`Rapor: ${join(cikis, 'uyum-raporu.md')}`);
  return 0;
}

/**
 * Oneri: projenin defterindeki kapanmis islerden is turu basina ajan onerisi. Yalniz okur, hicbir seyi degistirmez.
 * Uyum raporu varsa (varsayilan <hedef>/mihenk-uyum/uyum-raporu.json) arac basina uyum orani hesaba girer.
 */
function oneriKomutu(): number {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  if (!existsSync(join(kok, '.mihenk', 'defter.db'))) {
    console.log(`Bu klasorde defter yok (${kok}). Once isleri mihenk ile yurutun; oneri olculen islerden hesaplanir.`);
    return 0;
  }
  const oran = (ad: string, varsayilan: number): number => {
    const d = secenek(ad);
    if (d === undefined) return varsayilan;
    const n = Number(d);
    if (!(n >= 0 && n <= 1)) throw new Error(`${ad} 0 ile 1 arasinda bir sayi olmali (or. 0.5); gelen: ${d}.`);
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
    if (uyum) console.log(`Uyum raporu: ${uyumYolu}`);
    console.log(oneriMetni(turler, ayarlar));
  }
  return 0;
}

function kaldirKomutu(): number {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  console.log(`mihenk bu projeden kaldiriliyor: ${kok}`);
  const s = kaldir(kok, { defterDahil: gerisi.includes('--defter-dahil'), cmdDen: gerisi.includes('--cmd-den') });
  for (const d of s.silinen) console.log(`silindi            ${d}`);
  for (const d of s.geri_yuklenen) console.log(`eski haline dondu  ${d}`);
  for (const d of s.ayiklanan) console.log(`mihenk kismi cikarildi (sizin degisiklikleriniz duruyor)  ${d}`);
  for (const d of s.birakilan) console.log(`dokunulmadi        ${d}`);
  console.log(s.defter.charAt(0).toUpperCase() + s.defter.slice(1) + '.');
  console.log('Tamam. Yeniden kurmak isterseniz: mihenk kur');
  return 0;
}

function kurKomutu(): number {
  const istenen = (secenek('--arac') ?? ARACLAR.join(',')).split(',').map((a) => a.trim()).filter(Boolean);
  const bilinmeyen = istenen.filter((a) => !ARACLAR.includes(a as Arac));
  if (bilinmeyen.length > 0) throw new Error(`bilinmeyen arac: ${bilinmeyen.join(', ')}. Gecerli: ${ARACLAR.join(', ')}`);
  const sonuc = kur(secenek('--hedef') ?? process.cwd(), { araclar: istenen as Arac[] });
  for (const d of sonuc.yazilan) console.log(`yazildi    ${d}`);
  for (const u of sonuc.uyarilar) console.log(`UYARI      ${u}`);
  console.log(`${sonuc.yazilan.length} dosya yazildi, ${sonuc.degismeyen.length} dosya zaten gunceldi.`);
  return 0;
}

async function surKomutu(): Promise<number> {
  const kok = resolve(secenek('--hedef') ?? process.cwd());
  const listeYolu = resolve(secenek('--liste') ?? join(kok, 'mihenk-isler.json'));
  const liste = listeOku(listeYolu);
  const saklama = secenek('--saklama') as SaklamaKipi | undefined;
  if (saklama !== undefined && !SAKLAMA_KIPLERI.includes(saklama)) {
    throw new Error(`--saklama su degerlerden biri olmali: ${SAKLAMA_KIPLERI.join(', ')}.`);
  }

  // Ajan secimi: kullanici her zaman elle secebilir; secmediyse kurulu olan ilk arac (once ucretsiz calisabilenler).
  const bulunan = ['codex', 'opencode', 'claude'].filter((ad) => AJANLAR[ad]?.komutBul() != null);
  const ajan = secenek('--ajan') ?? liste.ajan ?? bulunan[0];
  console.log(`Proje: ${kok}`);
  console.log(`Is listesi: ${listeYolu} (${liste.isler.length} is)`);
  console.log(`Bu bilgisayarda bulunan araclar: ${bulunan.length > 0 ? bulunan.join(', ') : 'yok'}; varsayilan: ${ajan ?? 'yok'} (iste ayrica "ajan" yazilmissa o kullanilir)`);
  if (!ajan && liste.isler.some((i) => !i.ajan)) {
    throw new Error('Kullanilabilecek bir ajan araci bulunamadi. Codex, OpenCode ya da Claude Code kurun, ya da --ajan ile secin.');
  }

  const uyanikIstendi = gerisi.includes('--uyanik-tut') || liste.uyanik_tut === true;
  let durdur = (): void => undefined;
  if (uyanikIstendi) {
    const u = await uyanikTut();
    console.log(u.tamam ? `Uyanik tutma: ${u.not}.` : `UYARI: ${u.not}.`);
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
    });
    console.log(`Ayrinti: ${join(kok, '.mihenk', 'defter.jsonl')}`);
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
  else {
    kullanim();
    process.exitCode = komut === undefined || komut === '--help' ? 0 : 2;
  }
} catch (e) {
  console.error(`mihenk ${komut ?? ''}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
