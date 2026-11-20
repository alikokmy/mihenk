// Ac-kapa ayarlari (Asama 9). Her ozellik tek anahtarla acilir / kapanir; deger projenin mihenk.json dosyasinda durur.
// mihenk.json'a yalniz varsayilandan farkli degerler yazilir: hepsi varsayilana donunce dosya kurulum oncesi haline (yoksa yokluguna) doner.
// Kurulumla ilgili anahtarlar kur() ile uygulanir (kapatilan ozelligin dosyalari geri alinir); calisma anindakiler okundugu yerde etkilidir.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { kayitOku, kayitYaz, ozet, yedegiSil, yedekYaz } from './kaldir.js';

export type AyarDegeri = boolean | string | number;

export interface AyarTanimi {
  ad: string;
  /** Kodlama bilmeyen kullanici icin tek cumle (listede gorunur). */
  aciklama: string;
  /** Bilgi notu: bu ayar ne icin var. */
  amac: string;
  /** Bilgi notu: acinca / kapatinca (ya da degeri degisince) ne olur, bedeli ne. */
  sonuc: string;
  /** Bilgi notu: varsayilan deger ne yapar. */
  varsayilan_aciklama: string;
  varsayilan: AyarDegeri;
  /** Secimli ayarin degerleri. */
  secenekler?: readonly string[];
  /** Sayi ayarinin sinirlari. */
  sayi?: { en_az: number; en_cok: number };
  /** kurulum: degisince kurulum yeniden uygulanir; calisma: okundugu anda etkili. */
  etki: 'kurulum' | 'calisma';
}

// Arac listesi kur.ts'tekiyle ayni sirada (dongusel ice aktarmayi onlemek icin burada tekrarlanir; test esitligini denetler).
export const ARAC_ADLARI: Readonly<Record<string, string>> = {
  claude: 'Claude Code', codex: 'Codex CLI', gemini: 'Gemini CLI', antigravity: 'Antigravity', opencode: 'OpenCode', kilo: 'Kilo Code',
  cline: 'Cline (denenmedi)', qwen: 'Qwen Code (denenmedi)',
};

const KANCALI = ['claude', 'codex', 'qwen'];

export const AYARLAR: readonly AyarTanimi[] = [
  {
    ad: 'bilgi_notlari', aciklama: 'Ayarlarin altinda amac, sonuc ve varsayilan bilgisini goster.', varsayilan: true, etki: 'calisma',
    amac: 'Her ayarin neden var oldugunu ve neye yol actigini ayarin hemen altinda okumak icin.',
    sonuc: 'Kapatinca ayar listesi kisalir, yalniz ayarin adi ve tek cumlelik aciklamasi kalir.',
    varsayilan_aciklama: 'Bilgi notlari gorunur.',
  },
  {
    ad: 'kapi', aciklama: 'Kanitsiz "bitti" demeyi ve commit atmayi engelleyen kapi (Claude Code, Codex, Qwen Code).', varsayilan: true, etki: 'calisma',
    amac: 'Ajan dosya degistirdiyse, sunucunun kostugu dogrulama olmadan isi bitmis sayamaz ve commit atamaz.',
    sonuc: 'Kapatinca ajan kayit acmadan ve dogrulamadan "bitti" diyebilir; kapali gecisler yine kaydedilir.',
    varsayilan_aciklama: 'Kanitsiz bitirme ve commit reddedilir; ust uste 3 retten sonra gecit verilir ve bu kaydedilir.',
  },
  {
    ad: 'skiller', aciklama: 'Yontem becerileri (skill): ajana kayit, kanit ve karar notu yontemini ogretir.', varsayilan: true, etki: 'kurulum',
    amac: 'Ajana defteri nasil kullanacagini ve calisma yontemini adim adim anlatmak icin.',
    sonuc: 'Kapatinca skill dosyalari projeden kaldirilir; ajan yontemi yalniz AGENTS.md\'deki kisa kurallardan bilir. Her oturuma eklenen metin azalir.',
    varsayilan_aciklama: '7 skill kurulu araclarin okudugu dizinlere yazilir.',
  },
  {
    ad: 'yontem_metni', aciklama: 'AGENTS.md icindeki kisa mihenk kurallari; her oturumun basinda ajana okunur.', varsayilan: true, etki: 'kurulum',
    amac: 'Ajana her oturumda defteri kullanmasi gerektigini hatirlatmak icin.',
    sonuc: 'Kapatinca AGENTS.md\'deki mihenk blogu ve CLAUDE.md\'deki baglanti satiri kaldirilir; sizin AGENTS.md\'niz eski haline doner.',
    varsayilan_aciklama: 'AGENTS.md\'ye isaretli kisa bir blok eklenir.',
  },
  ...Object.entries(ARAC_ADLARI).map(([a, ad]): AyarTanimi => ({
    ad: `arac_${a}`, aciklama: `${ad}: defter baglantisi${KANCALI.includes(a) ? ' ve kapi kancasi' : ''} bu projeye kurulur.`,
    varsayilan: true, etki: 'kurulum',
    amac: `${ad} bu projede acildiginda deftere baglanabilsin${KANCALI.includes(a) ? ' ve kapi calissin' : ''} diye.`,
    sonuc: `Kapatinca ${ad} icin yazilan ayar dosyalari geri alinir; o arac defteri goremez. Kullanmadiginiz araci kapatmak proje klasorunu sade tutar.`,
    varsayilan_aciklama: 'Arac bilgisayarda kurulu olmasa da ayari yazilir (zarari yok, sonradan kurulursa hazir olur).',
  })),
  {
    ad: 'saklama', aciklama: 'Gecen isten sonra: yerel = bu bilgisayarda commit; yok = hicbir sey; yerel_gonder = commit ve uzak depoya gonder.',
    varsayilan: 'yerel', secenekler: ['yerel', 'yok', 'yerel_gonder'], etki: 'calisma',
    amac: 'Surucunun gecen her isi ayri bir kayit noktasi olarak saklamasi icin.',
    sonuc: 'yok: hicbir sey commit edilmez. yerel_gonder: her gecen is uzak depoya da gonderilir (gerileme kipi "gonderirken" ise once tam test takimi kosar).',
    varsayilan_aciklama: 'Yalniz bu bilgisayarda commit; internet ve GitHub gerekmez, hicbir sey gonderilmez.',
  },
  {
    ad: 'uyanik_tut', aciklama: 'Is listesi yururken bilgisayari uyanik tut (yalniz Windows; yonetici izni istemez).', varsayilan: false, etki: 'calisma',
    amac: 'Gece boyu kosan listenin bilgisayar uyudugu icin yarida kalmamasi icin.',
    sonuc: 'Acinca liste bitene dek bilgisayar kendiliginden uyumaz; kapagi kapatmak ya da guc dugmesi yine uyutur.',
    varsayilan_aciklama: 'Uyku aciksa surucu yalniz uyarir.',
  },
  {
    ad: 'geri_alma', aciklama: 'Her isin basinda ve sonunda projenin fotografi alinir; "mihenk geri-al <is>" o isin degisikliklerini geri alir.', varsayilan: true, etki: 'calisma',
    amac: 'Begenmediginiz ya da yarim kalan bir isin degisikliklerini git bilmeden tek komutla geri alabilmek icin.',
    sonuc: 'Kapatinca fotograf alinmaz, geri alma yapilamaz; is acilisi biraz hizlanir ve disk kullanilmaz.',
    varsayilan_aciklama: 'Son 5 isin fotografi saklanir (bkz. geri_alma_sakla).',
  },
  {
    ad: 'geri_alma_sakla', aciklama: 'Geri alinabilecek en son kac isin fotografi saklansin (0: hicbiri).', varsayilan: 5, sayi: { en_az: 0, en_cok: 100 }, etki: 'calisma',
    amac: 'Fotograflarin diski doldurmamasi icin eskileri silmek.',
    sonuc: 'Sayi buyudukce daha eski isler geri alinabilir, disk kullanimi artar. 0: is kapaninca fotografi silinir, geri alma yapilamaz.',
    varsayilan_aciklama: 'Son 5 kapanan isin fotografi tutulur, daha eskiler ve artik kullanilmayan icerikler silinir.',
  },
  {
    ad: 'bekci_test_kurcalama', aciklama: 'Is sirasinda var olan testler degistiyse, silindiyse ya da test atlandiysa "gecti" hukmune supheli notu duser.', varsayilan: true, etki: 'calisma',
    amac: 'Ajanin isi duzeltmek yerine testi zayiflatarak "gecti" almasini gorunur kilmak icin.',
    sonuc: 'Test kosturmaz, yalniz test dosyalarinin ozetine bakar: ucuzdur. Kapatinca testi degistiren ajan fark edilmez.',
    varsayilan_aciklama: 'Supheli is engellenmez, yalniz isaretlenir.',
  },
  {
    ad: 'bekci_bos_kanit', aciklama: 'Is acilinca dogrulama bir kez kosulur; is baslamadan zaten geciyorsa "gecti" hukmune supheli notu duser.', varsayilan: false, etki: 'calisma',
    amac: 'Isi olcmeyen bir dogrulama komutunu (zaten gecen) yakalamak icin.',
    sonuc: 'Acinca her iste dogrulama bir kez fazla kosar (is acilirken).',
    varsayilan_aciklama: 'Dogrulama yalniz is bitince kosar.',
  },
  {
    ad: 'bekci_kararsiz', aciklama: 'Gecen dogrulama ikinci kez kosulur; sonuc degisirse is "belirsiz (kararsiz test)" diye kapanir.', varsayilan: false, etki: 'calisma',
    amac: 'Bir gecip bir kalan (kararsiz) testin rastlantisal "gecti"sini ayiklamak icin.',
    sonuc: 'Acinca her "gecti"de dogrulama bir kez fazla kosar.',
    varsayilan_aciklama: 'Dogrulama is bitince bir kez kosar.',
  },
  {
    ad: 'gerileme', aciklama: 'Projenin butun test takimi ne zaman kossun: gonderirken, liste_sonunda, her_iste ya da kapali.',
    varsayilan: 'gonderirken', secenekler: ['gonderirken', 'liste_sonunda', 'her_iste', 'kapali'], etki: 'calisma',
    amac: 'Bir isin baska yeri bozdugunu (gerilemeyi) yakalamak icin; her is yalniz kendi hizli dogrulamasini kosar, tam takim zorunlu anlarda kosar.',
    sonuc: 'gonderirken: uzak depoya gondermeden once; kalirsa gonderilmez. liste_sonunda: listenin basinda ve sonunda birer kez; kalirsa uyarir. her_iste: her denemede (yavas). kapali: hic.',
    varsayilan_aciklama: 'Varsayilan saklama kipi gondermedigi icin varsayilan kurulumda tam takim hic kosmaz.',
  },
  {
    ad: 'bekci_dongu', aciklama: 'Is listesinde: dogrulama iki denemede ayni hatayi verirse kalan denemeler harcanmaz.', varsayilan: true, etki: 'calisma',
    amac: 'Ilerlemeyen ajana zaman ve para harcamamak icin.',
    sonuc: 'Test kosturmaz. Kapatinca her is butun deneme hakkini kullanir.',
    varsayilan_aciklama: 'Ayni hata iki kez gelirse is "kaldi" kapanir.',
  },
  {
    ad: 'bekci_yikici', aciklama: 'Kancada ve surucude: proje disini ya da kokunu silen, git gecmisini ezen komutlar (rm -rf, reset --hard, push --force) reddedilir.', varsayilan: true, etki: 'calisma',
    amac: 'Ajanin geri donussuz silme ve gecmis ezme komutlarini durdurmak icin.',
    sonuc: 'Kapatinca bu komutlar reddedilmez. Proje icinde silmek her durumda serbesttir.',
    varsayilan_aciklama: 'Claude Code, Codex ve Qwen Code kancasinda calisir.',
  },
];

const DOSYA = 'mihenk.json';

function hamOku(kok: string): Record<string, unknown> {
  const yol = join(kok, DOSYA);
  if (!existsSync(yol)) return {};
  try {
    const n = JSON.parse(readFileSync(yol, 'utf8')) as unknown;
    return n && typeof n === 'object' && !Array.isArray(n) ? (n as Record<string, unknown>) : {};
  } catch {
    throw new Error(`${DOSYA} gecerli JSON degil; ayarlar okunamadi. Dosyayi duzeltin ya da silin.`);
  }
}

/** Butun ayarlarin gecerli degerleri (dosyada olmayan varsayilandir; gecersiz deger varsayilana duser). */
export function ayarlariOku(kok: string): Record<string, AyarDegeri> {
  let ham: Record<string, unknown> = {};
  try {
    ham = hamOku(kok);
  } catch {
    // bozuk dosya: varsayilanlar (kapi acik kalir)
  }
  return Object.fromEntries(AYARLAR.map((t) => {
    const d = ham[t.ad];
    const gecerli = t.secenekler ? typeof d === 'string' && t.secenekler.includes(d)
      : t.sayi ? typeof d === 'number' && Number.isInteger(d) && d >= t.sayi.en_az && d <= t.sayi.en_cok
        : typeof d === 'boolean';
    return [t.ad, gecerli ? (d as AyarDegeri) : t.varsayilan];
  }));
}

export function ayarTanimi(ad: string): AyarTanimi {
  const t = AYARLAR.find((x) => x.ad === ad);
  if (!t) throw new Error(`bilinmeyen ayar: ${ad}. Gecerli: ${AYARLAR.map((x) => x.ad).join(', ')}`);
  return t;
}

/** "ac" / "kapa" / secim degerini dogrular ve ayarin degerine cevirir. */
export function degerCoz(t: AyarTanimi, metin: string): AyarDegeri {
  if (t.secenekler) {
    if (!t.secenekler.includes(metin)) throw new Error(`${t.ad} su degerlerden biri olmali: ${t.secenekler.join(', ')}.`);
    return metin;
  }
  if (t.sayi) {
    const n = Number(metin);
    if (!Number.isInteger(n) || n < t.sayi.en_az || n > t.sayi.en_cok) throw new Error(`${t.ad} ${t.sayi.en_az} ile ${t.sayi.en_cok} arasinda bir tam sayi olmali.`);
    return n;
  }
  if (['ac', 'acik', 'true', 'evet'].includes(metin)) return true;
  if (['kapa', 'kapali', 'false', 'hayir'].includes(metin)) return false;
  throw new Error(`${t.ad} icin "ac" ya da "kapa" yazin.`);
}

/**
 * Ayarlari yazar. Varsayilana donen anahtar dosyadan cikar; dosyanin ayar disi alanlarina (izinli_programlar, fiyatlar...) dokunulmaz.
 * Dosya kurulum kaydina girer: icerik kurulum oncesi haliyle anlamca ayni olunca o bayt bayt geri yuklenir; mihenk olusturduysa silinir.
 */
export function ayarYaz(kok: string, degisiklik: Record<string, AyarDegeri>): void {
  const ham = hamOku(kok);
  for (const [ad, deger] of Object.entries(degisiklik)) {
    const t = ayarTanimi(ad);
    if (deger === t.varsayilan) delete ham[ad];
    else ham[ad] = deger;
  }
  const yol = join(kok, DOSYA);
  const kayit = kayitOku(kok);
  let k = kayit.dosyalar[DOSYA];
  if (!k) {
    const mevcut = existsSync(yol) ? readFileSync(yol) : undefined;
    k = { once_vardi: mevcut !== undefined, yedek: mevcut !== undefined, ozet: '' };
    if (mevcut) yedekYaz(kok, DOSYA, mevcut);
    kayit.dosyalar[DOSYA] = k;
  }
  let onceki: unknown;
  if (k.once_vardi && k.yedek) {
    try {
      onceki = JSON.parse(readFileSync(join(kok, '.mihenk', 'kurulum-yedek', DOSYA), 'utf8'));
    } catch {
      onceki = undefined;
    }
  }
  if (k.once_vardi && k.yedek && isDeepStrictEqual(ham, onceki)) {
    // Kurulum oncesi haliyle ayni: kullanicinin kendi bicimiyle geri yuklenir, dosya kayittan cikar.
    writeFileSync(yol, readFileSync(join(kok, '.mihenk', 'kurulum-yedek', DOSYA)));
    delete kayit.dosyalar[DOSYA];
    yedegiSil(kok, DOSYA);
  } else if (!k.once_vardi && Object.keys(ham).length === 0) {
    if (existsSync(yol)) unlinkSync(yol);
    delete kayit.dosyalar[DOSYA];
  } else {
    const icerik = JSON.stringify(ham, null, 2) + '\n';
    writeFileSync(yol, icerik);
    k.ozet = ozet(icerik);
  }
  kayitYaz(kok, kayit);
}
