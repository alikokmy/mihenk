// Ac-kapa ayarlari (Asama 9). Her ozellik tek anahtarla acilir / kapanir; deger projenin mihenk.json dosyasinda durur.
// mihenk.json'a yalniz varsayilandan farkli degerler yazilir: hepsi varsayilana donunce dosya kurulum oncesi haline (yoksa yokluguna) doner.
// Kurulumla ilgili anahtarlar kur() ile uygulanir (kapatilan ozelligin dosyalari geri alinir); calisma anindakiler okundugu yerde etkilidir.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { kayitOku, kayitYaz, ozet, yedegiSil, yedekYaz } from './kaldir.js';

export type AyarDegeri = boolean | string;

export interface AyarTanimi {
  ad: string;
  /** Kodlama bilmeyen kullanici icin tek cumle. */
  aciklama: string;
  varsayilan: AyarDegeri;
  /** Secimli ayarin degerleri; yoksa ac / kapa. */
  secenekler?: readonly string[];
  /** kurulum: degisince kurulum yeniden uygulanir; calisma: okundugu anda etkili. */
  etki: 'kurulum' | 'calisma';
}

// Arac listesi kur.ts'tekiyle ayni sirada (dongusel ice aktarmayi onlemek icin burada tekrarlanir; test esitligini denetler).
export const ARAC_ADLARI: Readonly<Record<string, string>> = {
  claude: 'Claude Code', codex: 'Codex CLI', gemini: 'Gemini CLI', antigravity: 'Antigravity', opencode: 'OpenCode', kilo: 'Kilo Code',
  cline: 'Cline (denenmedi)', qwen: 'Qwen Code (denenmedi)',
};

export const AYARLAR: readonly AyarTanimi[] = [
  { ad: 'kapi', aciklama: 'Kanitsiz "bitti" demeyi ve commit atmayi engelleyen kapi (Claude Code, Codex, Qwen Code).', varsayilan: true, etki: 'calisma' },
  { ad: 'skiller', aciklama: 'Yontem becerileri (skill): ajana kayit, kanit ve karar notu yontemini ogretir.', varsayilan: true, etki: 'kurulum' },
  { ad: 'yontem_metni', aciklama: 'AGENTS.md icindeki kisa mihenk kurallari; her oturumun basinda ajana okunur.', varsayilan: true, etki: 'kurulum' },
  ...Object.entries(ARAC_ADLARI).map(([a, ad]): AyarTanimi => ({
    ad: `arac_${a}`, aciklama: `${ad}: defter baglantisi${['claude', 'codex', 'qwen'].includes(a) ? ' ve kapi kancasi' : ''} bu projeye kurulur.`,
    varsayilan: true, etki: 'kurulum',
  })),
  { ad: 'saklama', aciklama: 'Gecen isten sonra: yerel = yalniz bu bilgisayarda commit; yok = hicbir sey; yerel_gonder = commit ve uzak depoya gonder.',
    varsayilan: 'yerel', secenekler: ['yerel', 'yok', 'yerel_gonder'], etki: 'calisma' },
  { ad: 'uyanik_tut', aciklama: 'Is listesi yururken bilgisayari uyanik tut (yalniz Windows; yonetici izni istemez).', varsayilan: false, etki: 'calisma' },
  { ad: 'geri_alma', aciklama: 'Her isin basinda ve sonunda projenin fotografi alinir; "mihenk geri-al <is>" o isin degisikliklerini geri alir.', varsayilan: true, etki: 'calisma' },
  { ad: 'bekci_test_kurcalama', aciklama: 'Is sirasinda var olan testler degistiyse, silindiyse ya da test atlandiysa "gecti" hukmune supheli notu duser.', varsayilan: true, etki: 'calisma' },
  { ad: 'bekci_bos_kanit', aciklama: 'Is acilinca dogrulama bir kez kosulur; is baslamadan zaten geciyorsa "gecti" hukmune supheli notu duser.', varsayilan: true, etki: 'calisma' },
  { ad: 'bekci_gerileme', aciklama: 'Is listesinde: baslangicta gecen butun test takimi bir iste kalirsa o is "gecti" sayilmaz (onceden geceni bozmak).', varsayilan: true, etki: 'calisma' },
  { ad: 'bekci_dongu', aciklama: 'Is listesinde: dogrulama iki denemede ayni hatayi verirse kalan denemeler harcanmaz.', varsayilan: true, etki: 'calisma' },
  { ad: 'bekci_yikici', aciklama: 'Kancada ve surucude: proje disini ya da kokunu silen, git gecmisini ezen komutlar (rm -rf, reset --hard, push --force) reddedilir.', varsayilan: true, etki: 'calisma' },
  { ad: 'bekci_kararsiz', aciklama: 'Gecen dogrulama ikinci kez kosulur; sonuc degisirse is "belirsiz (kararsiz test)" diye kapanir.', varsayilan: true, etki: 'calisma' },
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
    const gecerli = t.secenekler ? typeof d === 'string' && t.secenekler.includes(d) : typeof d === 'boolean';
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
