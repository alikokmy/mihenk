// Ac-kapa ayarlari (Asama 9). Her ozellik tek anahtarla acilir / kapanir; deger projenin mihenk.json dosyasinda durur.
// mihenk.json'a yalniz varsayilandan farkli degerler yazilir: hepsi varsayilana donunce dosya kurulum oncesi haline (yoksa yokluguna) doner.
// Kurulumla ilgili anahtarlar kur() ile uygulanir (kapatilan ozelligin dosyalari geri alinir); calisma anindakiler okundugu yerde etkilidir.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { t as ileti, type IkiDilli } from './dil.js';
import { kayitOku, kayitYaz, ozet, yedegiSil, yedekYaz } from './kaldir.js';

export type AyarDegeri = boolean | string | number;

export interface AyarTanimi {
  ad: string;
  /** Kodlama bilmeyen kullanici icin tek cumle (listede gorunur). */
  aciklama: IkiDilli;
  /** Bilgi notu: bu ayar ne icin var. */
  amac: IkiDilli;
  /** Bilgi notu: acinca / kapatinca (ya da degeri degisince) ne olur, bedeli ne. */
  sonuc: IkiDilli;
  /** Bilgi notu: varsayilan deger ne yapar. */
  varsayilan_aciklama: IkiDilli;
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
  cline: 'Cline', qwen: 'Qwen Code',
};
const DENENMEDI = ['cline', 'qwen'];
const KANCALI = ['claude', 'codex', 'qwen'];

export const AYARLAR: readonly AyarTanimi[] = [
  {
    ad: 'bilgi_notlari', varsayilan: true, etki: 'calisma',
    aciklama: { tr: 'Ayarlarin altinda amac, sonuc ve varsayilan bilgisini goster.', en: 'Show purpose, effect and default under each setting.' },
    amac: { tr: 'Her ayarin neden var oldugunu ve neye yol actigini ayarin hemen altinda okumak icin.', en: 'To read, right under each setting, why it exists and what it leads to.' },
    sonuc: { tr: 'Kapatinca ayar listesi kisalir, yalniz ayarin adi ve tek cumlelik aciklamasi kalir.', en: 'When off, the list gets shorter: only the name and a one-line description remain.' },
    varsayilan_aciklama: { tr: 'Bilgi notlari gorunur.', en: 'Notes are shown.' },
  },
  {
    ad: 'dil', varsayilan: 'tr', secenekler: ['tr', 'en', 'sistem'], etki: 'calisma',
    aciklama: { tr: 'Iletilerin dili: tr (Turkce), en (Ingilizce) ya da sistem (bilgisayarin dili).', en: 'Language of messages: tr (Turkish), en (English) or sistem (the computer\'s language).' },
    amac: { tr: 'mihenk\'in size hangi dilde konusacagini secmek icin.', en: 'To choose which language mihenk speaks to you in.' },
    sonuc: { tr: 'Komut satiri, menu, sürücü iletileri, rapor ve bildirim secilen dilde olur. Ajana giden metinler degismez.', en: 'Command line, menu, driver messages, report and notification use the chosen language. Texts sent to the agent do not change.' },
    varsayilan_aciklama: { tr: 'Turkce. sistem secilirse bilgisayarin dili Ingilizceyse Ingilizce olur.', en: 'Turkish. With sistem, English is used if the computer\'s language is English.' },
  },
  {
    ad: 'kapi', varsayilan: true, etki: 'calisma',
    aciklama: { tr: 'Kanitsiz "bitti" demeyi ve commit atmayi engelleyen kapi (Claude Code, Codex, Qwen Code).', en: 'Gate that blocks saying "done" or committing without evidence (Claude Code, Codex, Qwen Code).' },
    amac: { tr: 'Ajan dosya degistirdiyse, sunucunun kostugu dogrulama olmadan isi bitmis sayamaz ve commit atamaz.', en: 'If the agent changed files, it cannot call the job done or commit without a check run by the server.' },
    sonuc: { tr: 'Kapatinca ajan kayit acmadan ve dogrulamadan "bitti" diyebilir; kapali gecisler yine kaydedilir.', en: 'When off, the agent can say "done" without a record or check; passes are still logged.' },
    varsayilan_aciklama: { tr: 'Kanitsiz bitirme ve commit reddedilir; ust uste 3 retten sonra gecit verilir ve bu kaydedilir.', en: 'Finishing or committing without evidence is refused; after 3 refusals in a row it lets through and logs it.' },
  },
  {
    ad: 'skiller', varsayilan: true, etki: 'kurulum',
    aciklama: { tr: 'Yontem becerileri (skill): ajana kayit, kanit ve karar notu yontemini ogretir.', en: 'Method skills: teach the agent to record jobs, give evidence and write decision notes.' },
    amac: { tr: 'Ajana defteri nasil kullanacagini ve calisma yontemini adim adim anlatmak icin.', en: 'To explain to the agent, step by step, how to use the ledger and the working method.' },
    sonuc: { tr: 'Kapatinca skill dosyalari projeden kaldirilir; ajan yontemi yalniz AGENTS.md\'deki kisa kurallardan bilir. Her oturuma eklenen metin azalir.', en: 'When off, the skill files are removed; the agent only knows the short rules in AGENTS.md. Less text is added to every session.' },
    varsayilan_aciklama: { tr: '7 skill kurulu araclarin okudugu dizinlere yazilir.', en: '7 skills are written to the folders the installed tools read.' },
  },
  {
    ad: 'yontem_metni', varsayilan: true, etki: 'kurulum',
    aciklama: { tr: 'AGENTS.md icindeki kisa mihenk kurallari; her oturumun basinda ajana okunur.', en: 'Short mihenk rules in AGENTS.md; read to the agent at the start of every session.' },
    amac: { tr: 'Ajana her oturumda defteri kullanmasi gerektigini hatirlatmak icin.', en: 'To remind the agent in every session that it must use the ledger.' },
    sonuc: { tr: 'Kapatinca AGENTS.md\'deki mihenk blogu ve CLAUDE.md\'deki baglanti satiri kaldirilir; sizin AGENTS.md\'niz eski haline doner.', en: 'When off, the mihenk block in AGENTS.md and the link line in CLAUDE.md are removed; your AGENTS.md returns to how it was.' },
    varsayilan_aciklama: { tr: 'AGENTS.md\'ye isaretli kisa bir blok eklenir.', en: 'A short, marked block is added to AGENTS.md.' },
  },
  ...Object.entries(ARAC_ADLARI).map(([a, ad]): AyarTanimi => ({
    ad: `arac_${a}`, varsayilan: true, etki: 'kurulum',
    aciklama: {
      tr: `${ad}${DENENMEDI.includes(a) ? ' (denenmedi)' : ''}: defter baglantisi${KANCALI.includes(a) ? ' ve kapi kancasi' : ''} bu projeye kurulur.`,
      en: `${ad}${DENENMEDI.includes(a) ? ' (untested)' : ''}: ledger connection${KANCALI.includes(a) ? ' and gate hook' : ''} are installed in this project.`,
    },
    amac: {
      tr: `${ad} bu projede acildiginda deftere baglanabilsin${KANCALI.includes(a) ? ' ve kapi calissin' : ''} diye.`,
      en: `So that ${ad} can reach the ledger${KANCALI.includes(a) ? ' and the gate works' : ''} when opened in this project.`,
    },
    sonuc: {
      tr: `Kapatinca ${ad} icin yazilan ayar dosyalari geri alinir; o arac defteri goremez. Kullanmadiginiz araci kapatmak proje klasorunu sade tutar.`,
      en: `When off, the settings written for ${ad} are undone; that tool cannot see the ledger. Turning off tools you do not use keeps the project folder tidy.`,
    },
    varsayilan_aciklama: {
      tr: 'Arac bilgisayarda kurulu olmasa da ayari yazilir (zarari yok, sonradan kurulursa hazir olur).',
      en: 'Its settings are written even if the tool is not installed (harmless; ready if you install it later).',
    },
  })),
  {
    ad: 'saklama', varsayilan: 'yerel', secenekler: ['yerel', 'yok', 'yerel_gonder'], etki: 'calisma',
    aciklama: { tr: 'Gecen isten sonra: yerel = bu bilgisayarda commit; yok = hicbir sey; yerel_gonder = commit ve uzak depoya gonder.', en: 'After a passed job: yerel = commit on this computer; yok = nothing; yerel_gonder = commit and push to the remote.' },
    amac: { tr: 'Surucunun gecen her isi ayri bir kayit noktasi olarak saklamasi icin.', en: 'So the driver saves every passed job as its own save point.' },
    sonuc: { tr: 'yok: hicbir sey commit edilmez. yerel_gonder: her gecen is uzak depoya da gonderilir (gerileme kipi "gonderirken" ise once tam test takimi kosar).', en: 'yok: nothing is committed. yerel_gonder: every passed job is also pushed (with regression mode "gonderirken" the full test suite runs first).' },
    varsayilan_aciklama: { tr: 'Yalniz bu bilgisayarda commit; internet ve GitHub gerekmez, hicbir sey gonderilmez.', en: 'Commit on this computer only; no internet or GitHub needed, nothing is pushed.' },
  },
  {
    ad: 'uyanik_tut', varsayilan: false, etki: 'calisma',
    aciklama: { tr: 'Is listesi yururken bilgisayari uyanik tut (yalniz Windows; yonetici izni istemez).', en: 'Keep the computer awake while a job list runs (Windows only; no admin rights).' },
    amac: { tr: 'Gece boyu kosan listenin bilgisayar uyudugu icin yarida kalmamasi icin.', en: 'So an overnight list does not stop halfway because the computer went to sleep.' },
    sonuc: { tr: 'Acinca liste bitene dek bilgisayar kendiliginden uyumaz; kapagi kapatmak ya da guc dugmesi yine uyutur.', en: 'When on, the computer does not sleep by itself until the list ends; closing the lid or the power button still puts it to sleep.' },
    varsayilan_aciklama: { tr: 'Uyku aciksa surucu yalniz uyarir.', en: 'If sleep is enabled, the driver only warns.' },
  },
  {
    ad: 'bildirim', varsayilan: true, etki: 'calisma',
    aciklama: { tr: 'Is listesi bitince ya da durunca Windows bildirimi goster.', en: 'Show a Windows notification when a job list finishes or stops.' },
    amac: { tr: 'Basinda olmadiginiz uzun bir listenin bittigini ya da durdugunu hemen ogrenmek icin.', en: 'To learn right away that a long list you are not watching has finished or stopped.' },
    sonuc: { tr: 'Kapatinca bildirim gelmez; sonucu pencereden ya da mihenk-rapor.cmd ile ogrenirsiniz.', en: 'When off, no notification; check the window or mihenk-rapor.cmd for results.' },
    varsayilan_aciklama: { tr: 'Liste bitince ekranin kosesinde kisa bir ozet cikar; tiklamaniz gerekmez. Yonetici izni istemez.', en: 'A short summary appears in the corner of the screen; no click needed. No admin rights.' },
  },
  {
    ad: 'geri_alma', varsayilan: true, etki: 'calisma',
    aciklama: { tr: 'Her isin basinda ve sonunda projenin fotografi alinir; "mihenk geri-al <is>" o isin degisikliklerini geri alir.', en: 'A snapshot of the project is taken at the start and end of each job; "mihenk geri-al <job>" undoes that job\'s changes.' },
    amac: { tr: 'Begenmediginiz ya da yarim kalan bir isin degisikliklerini git bilmeden tek komutla geri alabilmek icin.', en: 'To undo a job you do not like, or one left half done, with one command and no git knowledge.' },
    sonuc: { tr: 'Kapatinca fotograf alinmaz, geri alma yapilamaz; is acilisi biraz hizlanir ve disk kullanilmaz.', en: 'When off, no snapshots are taken and undo is impossible; jobs start a bit faster and no disk is used.' },
    varsayilan_aciklama: { tr: 'Son 5 isin fotografi saklanir (bkz. geri_alma_sakla).', en: 'Snapshots of the last 5 jobs are kept (see geri_alma_sakla).' },
  },
  {
    ad: 'geri_alma_sakla', varsayilan: 5, sayi: { en_az: 0, en_cok: 100 }, etki: 'calisma',
    aciklama: { tr: 'Geri alinabilecek en son kac isin fotografi saklansin (0: hicbiri).', en: 'How many of the latest jobs keep a snapshot for undo (0: none).' },
    amac: { tr: 'Fotograflarin diski doldurmamasi icin eskileri silmek.', en: 'To delete old snapshots so they do not fill the disk.' },
    sonuc: { tr: 'Sayi buyudukce daha eski isler geri alinabilir, disk kullanimi artar. 0: is kapaninca fotografi silinir, geri alma yapilamaz.', en: 'A larger number lets you undo older jobs and uses more disk. 0: a job\'s snapshot is deleted when it closes; no undo.' },
    varsayilan_aciklama: { tr: 'Son 5 kapanan isin fotografi tutulur, daha eskiler ve artik kullanilmayan icerikler silinir.', en: 'Snapshots of the last 5 closed jobs are kept; older ones and unused contents are deleted.' },
  },
  {
    ad: 'bekci_test_kurcalama', varsayilan: true, etki: 'calisma',
    aciklama: { tr: 'Is sirasinda var olan testler degistiyse, silindiyse ya da test atlandiysa "gecti" hukmune supheli notu duser.', en: 'If existing tests were changed, deleted or skipped during the job, a pass is marked suspicious.' },
    amac: { tr: 'Ajanin isi duzeltmek yerine testi zayiflatarak "gecti" almasini gorunur kilmak icin.', en: 'To expose an agent that passes by weakening the test instead of fixing the work.' },
    sonuc: { tr: 'Test kosturmaz, yalniz test dosyalarinin ozetine bakar: ucuzdur. Kapatinca testi degistiren ajan fark edilmez.', en: 'Runs no tests, only compares test file fingerprints: cheap. When off, an agent changing tests goes unnoticed.' },
    varsayilan_aciklama: { tr: 'Supheli is engellenmez, yalniz isaretlenir.', en: 'Suspicious jobs are not blocked, only marked.' },
  },
  {
    ad: 'bekci_bos_kanit', varsayilan: false, etki: 'calisma',
    aciklama: { tr: 'Is acilinca dogrulama bir kez kosulur; is baslamadan zaten geciyorsa "gecti" hukmune supheli notu duser.', en: 'The check runs once when a job opens; if it already passes before any work, a pass is marked suspicious.' },
    amac: { tr: 'Isi olcmeyen bir dogrulama komutunu (zaten gecen) yakalamak icin.', en: 'To catch a check that does not measure the work (it already passes).' },
    sonuc: { tr: 'Acinca her iste dogrulama bir kez fazla kosar (is acilirken).', en: 'When on, the check runs one extra time per job (when it opens).' },
    varsayilan_aciklama: { tr: 'Dogrulama yalniz is bitince kosar.', en: 'The check runs only when the job ends.' },
  },
  {
    ad: 'bekci_kararsiz', varsayilan: false, etki: 'calisma',
    aciklama: { tr: 'Gecen dogrulama ikinci kez kosulur; sonuc degisirse is "belirsiz (kararsiz test)" diye kapanir.', en: 'A passing check runs a second time; if the result changes, the job closes as "uncertain (flaky test)".' },
    amac: { tr: 'Bir gecip bir kalan (kararsiz) testin rastlantisal "gecti"sini ayiklamak icin.', en: 'To filter out a lucky pass from a test that sometimes passes and sometimes fails.' },
    sonuc: { tr: 'Acinca her "gecti"de dogrulama bir kez fazla kosar.', en: 'When on, every pass costs one extra run of the check.' },
    varsayilan_aciklama: { tr: 'Dogrulama is bitince bir kez kosar.', en: 'The check runs once when the job ends.' },
  },
  {
    ad: 'gerileme', varsayilan: 'gonderirken', secenekler: ['gonderirken', 'liste_sonunda', 'her_iste', 'kapali'], etki: 'calisma',
    aciklama: { tr: 'Projenin butun test takimi ne zaman kossun: gonderirken, liste_sonunda, her_iste ya da kapali.', en: 'When the project\'s full test suite runs: gonderirken (before push), liste_sonunda (end of list), her_iste (every job) or kapali (never).' },
    amac: { tr: 'Bir isin baska yeri bozdugunu (gerilemeyi) yakalamak icin; her is yalniz kendi hizli dogrulamasini kosar, tam takim zorunlu anlarda kosar.', en: 'To catch a job breaking something else (a regression); each job runs only its own quick check, the full suite runs when it must.' },
    sonuc: { tr: 'gonderirken: uzak depoya gondermeden once; kalirsa gonderilmez. liste_sonunda: listenin basinda ve sonunda birer kez; kalirsa uyarir. her_iste: her denemede (yavas). kapali: hic.', en: 'gonderirken: before pushing; if it fails, nothing is pushed. liste_sonunda: once at the start and once at the end; warns if it fails. her_iste: every attempt (slow). kapali: never.' },
    varsayilan_aciklama: { tr: 'Varsayilan saklama kipi gondermedigi icin varsayilan kurulumda tam takim hic kosmaz.', en: 'The default save mode never pushes, so by default the full suite never runs.' },
  },
  {
    ad: 'bekci_dongu', varsayilan: true, etki: 'calisma',
    aciklama: { tr: 'Is listesinde: dogrulama iki denemede ayni hatayi verirse kalan denemeler harcanmaz.', en: 'In a job list: if the check gives the same error in two attempts, the remaining attempts are not spent.' },
    amac: { tr: 'Ilerlemeyen ajana zaman ve para harcamamak icin.', en: 'Not to spend time and money on an agent that is not making progress.' },
    sonuc: { tr: 'Test kosturmaz. Kapatinca her is butun deneme hakkini kullanir.', en: 'Runs no tests. When off, every job uses all its attempts.' },
    varsayilan_aciklama: { tr: 'Ayni hata iki kez gelirse is "kaldi" kapanir.', en: 'If the same error comes twice, the job closes as failed.' },
  },
  {
    ad: 'bekci_yikici', varsayilan: true, etki: 'calisma',
    aciklama: { tr: 'Kancada ve surucude: proje disini ya da kokunu silen, git gecmisini ezen komutlar (rm -rf, reset --hard, push --force) reddedilir.', en: 'In the hook and the driver: commands that delete outside the project or its root, or overwrite git history (rm -rf, reset --hard, push --force), are refused.' },
    amac: { tr: 'Ajanin geri donussuz silme ve gecmis ezme komutlarini durdurmak icin.', en: 'To stop the agent\'s irreversible delete and history-overwrite commands.' },
    sonuc: { tr: 'Kapatinca bu komutlar reddedilmez. Proje icinde silmek her durumda serbesttir.', en: 'When off, these commands are not refused. Deleting inside the project is always allowed.' },
    varsayilan_aciklama: { tr: 'Claude Code, Codex ve Qwen Code kancasinda calisir.', en: 'Works in the Claude Code, Codex and Qwen Code hooks.' },
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
    throw new Error(ileti('ayar_json_bozuk', { dosya: DOSYA }));
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
  if (!t) throw new Error(ileti('ayar_bilinmeyen', { ad, gecerli: AYARLAR.map((x) => x.ad).join(', ') }));
  return t;
}

/** "ac" / "kapa" / secim degerini dogrular ve ayarin degerine cevirir. */
export function degerCoz(t: AyarTanimi, metin: string): AyarDegeri {
  if (t.secenekler) {
    if (!t.secenekler.includes(metin)) throw new Error(ileti('ayar_secim_hatasi', { ad: t.ad, gecerli: t.secenekler.join(', ') }));
    return metin;
  }
  if (t.sayi) {
    const n = Number(metin);
    if (!Number.isInteger(n) || n < t.sayi.en_az || n > t.sayi.en_cok) throw new Error(ileti('ayar_sayi_hatasi', { ad: t.ad, en_az: t.sayi.en_az, en_cok: t.sayi.en_cok }));
    return n;
  }
  if (['ac', 'acik', 'true', 'evet'].includes(metin)) return true;
  if (['kapa', 'kapali', 'false', 'hayir'].includes(metin)) return false;
  throw new Error(ileti('ayar_ackapa_hatasi', { ad: t.ad }));
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
