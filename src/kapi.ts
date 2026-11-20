// Etkilesimli oturumda mekanik kapi (Asama 7). Aractan bagimsiz cekirdek: aracin kancasi (kapi-bin.ts) bunu cagirir.
// Kural: oturumda proje dosyasi degistiyse, son degisiklikten SONRA hukum_ver ile kapanmis bir defter kaydi olmadan oturum "bitti"
// diyemez ve commit atilamaz; oturumda acilip kapanmamis is varsa da bitirilemez. Hukmun "kaldi" ya da "belirsiz" olmasi yeter:
// istenen basari degil, durust ve kanitli kapanistir.
// Sinir: dosya degisikligi zamandan (mtime) anlasilir; degisiklik sayilmayan yerler: .git, .mihenk, node_modules ve git'in yok saydiklari.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ayarlariOku } from './ayar.js';

/** Ust uste bu kadar engelden sonra kapi gecit verir ve bunu kaydeder (sonsuz donguyu onler). */
export const ENGEL_SINIRI = 3;
const TARAMA_SINIRI = 20000;

export interface OturumDurumu {
  oturum: string;
  arac: string;
  baslangic: string;
  engel_sayisi: number;
}

export interface KapiKarari {
  izin: boolean;
  /** Ajana gidecek aciklama (engellendiyse ne yapmasi gerektigi). */
  neden: string;
  acik_isler: number[];
  degisen: string[];
  /** Engel siniri asildigi icin gecit verildi. */
  atlandi?: boolean;
}

const dizin = (kok: string): string => join(kok, '.mihenk', 'kapi');
const dosyaAdi = (oturum: string): string => `${oturum.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'adsiz'}.json`;

function olayYaz(kok: string, olay: Record<string, unknown>): void {
  try {
    mkdirSync(join(kok, '.mihenk'), { recursive: true });
    appendFileSync(join(kok, '.mihenk', 'kapi.jsonl'), JSON.stringify({ zaman: new Date().toISOString(), ...olay }) + '\n');
  } catch {
    // Kayit yazilamamasi kapinin kararini degistirmez.
  }
}

/** mihenk.json icinde "kapi": false varsa kapi kapali (kullanicinin bilerek actigi atlama yolu; her seferinde kaydedilir). */
export function kapiKapaliMi(kok: string): boolean {
  return ayarlariOku(kok).kapi === false;
}

function durumOku(kok: string, oturum: string): OturumDurumu | undefined {
  try {
    return JSON.parse(readFileSync(join(dizin(kok), dosyaAdi(oturum)), 'utf8')) as OturumDurumu;
  } catch {
    return undefined;
  }
}

function durumYaz(kok: string, d: OturumDurumu): void {
  mkdirSync(dizin(kok), { recursive: true });
  writeFileSync(join(dizin(kok), dosyaAdi(d.oturum)), JSON.stringify(d) + '\n');
}

/** Oturum basinda cagrilir. Var olan oturum (devam ettirilen) ilk baslangicini korur. */
export function oturumBaslat(kok: string, oturum: string, arac: string, simdi = new Date()): OturumDurumu {
  const eski = durumOku(kok, oturum);
  if (eski) return eski;
  const d: OturumDurumu = { oturum, arac, baslangic: simdi.toISOString(), engel_sayisi: 0 };
  durumYaz(kok, d);
  olayYaz(kok, { olay: 'oturum_basladi', oturum, arac });
  return d;
}

/** Proje dosyalarindan `sonraMs`'den sonra degisenler (en yenisi basta). Git deposunda git'in yok saydiklari sayilmaz. */
export function degisenDosyalar(kok: string, sonraMs: number): Array<{ yol: string; ms: number }> {
  let adaylar: string[];
  const git = spawnSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], { cwd: kok, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (git.status === 0 && typeof git.stdout === 'string') {
    adaylar = git.stdout.split('\0').filter(Boolean).slice(0, TARAMA_SINIRI);
  } else {
    adaylar = [];
    const yuru = (d: string): void => {
      for (const g of readdirSync(join(kok, d), { withFileTypes: true })) {
        if (adaylar.length >= TARAMA_SINIRI) return;
        if (g.name.startsWith('.') || g.name === 'node_modules') continue;
        const yol = d === '' ? g.name : `${d}/${g.name}`;
        if (g.isDirectory()) yuru(yol);
        else if (g.isFile()) adaylar.push(yol);
      }
    };
    yuru('');
  }
  const sonuc: Array<{ yol: string; ms: number }> = [];
  for (const yol of adaylar) {
    if (/^(\.mihenk|\.git|node_modules)(\/|$)/.test(yol)) continue;
    try {
      const ms = statSync(join(kok, yol)).mtimeMs;
      if (ms > sonraMs) sonuc.push({ yol, ms });
    } catch {
      // Silinmis dosya: git listesinde olup diskte olmayabilir.
    }
  }
  return sonuc.sort((a, b) => b.ms - a.ms);
}

interface DefterSatiri { id: number; durum: string; baslangic: string; bitis: string | null }

function defterIsleri(kok: string, sonraIso: string): DefterSatiri[] {
  const yol = join(kok, '.mihenk', 'defter.db');
  if (!existsSync(yol)) return [];
  const db = new DatabaseSync(yol, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    // Oturumda acilan ya da oturumda kapanan isler.
    return db.prepare('SELECT id, durum, baslangic, bitis FROM isler WHERE baslangic >= ? OR bitis >= ? ORDER BY id').all(sonraIso, sonraIso) as unknown as DefterSatiri[];
  } finally {
    db.close();
  }
}

/**
 * Kapinin karari: ajan bitirmek (ya da commit atmak) istediginde cagrilir.
 * Engelde sayac artar; ENGEL_SINIRI'ni asinca gecit verilir ve "kapi_atlandi" diye kaydedilir.
 */
export function kapiDenetimi(kok: string, oturum: string, arac: string, eylem: 'bitir' | 'commit', simdi = new Date(), bilesik = false): KapiKarari {
  if (kapiKapaliMi(kok)) {
    olayYaz(kok, { olay: 'kapi_kapali', oturum, arac, eylem });
    return { izin: true, neden: 'kapi mihenk.json ile kapatilmis ("kapi": false)', acik_isler: [], degisen: [] };
  }
  // Oturum basi kaydi yoksa (kanca sonradan kuruldu) oturum simdi baslamis sayilir: gecmis degisiklikler bu oturuma yuklenmez.
  const durum = durumOku(kok, oturum) ?? oturumBaslat(kok, oturum, arac, simdi);
  const baslangicMs = Date.parse(durum.baslangic);
  const isler = defterIsleri(kok, durum.baslangic);
  const acik = isler.filter((i) => i.durum === 'acik').map((i) => i.id);
  const degisen = degisenDosyalar(kok, baslangicMs);
  const sonDegisiklik = degisen[0]?.ms ?? 0;
  const sonrakiKapanis = isler.some((i) => i.durum !== 'acik' && i.bitis !== null && Date.parse(i.bitis) >= sonDegisiklik);

  const sorunlar: string[] = [];
  if (bilesik) {
    sorunlar.push('git commit, dosya degistirebilecek baska komutlarla ayni satirda calistirilamaz (kapi ayni satirdaki degisikligi goremez). ' +
      'Once degisikligi yapin, defter kaydini hukum_ver ile kapatin, sonra commit\'i ayri komutla calistirin (yanina yalniz git add konabilir).');
  }
  if (acik.length > 0) {
    sorunlar.push(`Defterde bu oturumda acilip kapanmamis is var (${acik.map((i) => `is ${i}`).join(', ')}). ` +
      'hukum_ver ile kapatin: dogrulama gecerse "gecti" olur; gecmiyorsa gerekcesiyle "kaldi" ya da "belirsiz" deyin.');
  }
  if (degisen.length > 0 && !sonrakiKapanis) {
    const ornek = degisen.slice(0, 5).map((d) => d.yol).join(', ');
    sorunlar.push(`Bu oturumda ${degisen.length} proje dosyasi degisti (${ornek}${degisen.length > 5 ? ', ...' : ''}) ama son degisiklikten sonra ` +
      'kapanmis bir defter kaydi yok. Kanitsiz "bitti" kabul edilmez: is_ac ile kayit acin (ya da acik kaydinizi kullanin), ' +
      'sonra hukum_ver cagirin; sunucu dogrulama komutunu kendisi kosar.');
  }

  if (sorunlar.length === 0) {
    if (durum.engel_sayisi !== 0) durumYaz(kok, { ...durum, engel_sayisi: 0 });
    olayYaz(kok, { olay: 'gecit', oturum, arac, eylem, degisen: degisen.length });
    return { izin: true, neden: 'kanit tamam', acik_isler: [], degisen: degisen.map((d) => d.yol) };
  }
  const engel = durum.engel_sayisi + 1;
  if (engel > ENGEL_SINIRI) {
    durumYaz(kok, { ...durum, engel_sayisi: 0 });
    olayYaz(kok, { olay: 'kapi_atlandi', oturum, arac, eylem, acik_isler: acik, degisen: degisen.length, sorunlar });
    return { izin: true, atlandi: true, neden: `ust uste ${ENGEL_SINIRI} engelden sonra gecit verildi; kanitsiz bitis kaydedildi`, acik_isler: acik, degisen: degisen.map((d) => d.yol) };
  }
  durumYaz(kok, { ...durum, engel_sayisi: engel });
  olayYaz(kok, { olay: 'engel', oturum, arac, eylem, acik_isler: acik, degisen: degisen.length });
  const onEk = eylem === 'commit' ? 'mihenk kapisi: commit engellendi. ' : 'mihenk kapisi: is bitmis sayilmadi. ';
  return { izin: false, neden: onEk + sorunlar.join(' '), acik_isler: acik, degisen: degisen.map((d) => d.yol) };
}

/** Kabuk komutu bir git commit mi (kaba ama kacirmamaya yonelik: "git ... commit" her bicimi). */
export function commitMi(komut: string): boolean {
  // git, ardindan secenekler (-C <yol>, -c a=b, --no-pager ...), ardindan alt komut olarak commit.
  return /\bgit(\.exe)?(\s+-{1,2}[^\s]+(\s+[^-\s;&|][^\s;&|]*)?)*\s+commit\b/.test(komut);
}

/**
 * Commit, dosya degistirebilecek baska komutlarla ayni satirda mi? Kanca komuttan ONCE calisir: ayni satirda yapilan degisikligi
 * goremez (Codex denemesinde yasandi: "Set-Content ...; git add; git commit" kapidan gecti). Yalniz git add / status / diff ve cd
 * commit'le birlikte kabul edilir. Aracin kabuk sarmalayicisi (powershell -Command "...", cmd /c, bash -lc) once soyulur.
 */
export function bilesikCommitMi(komut: string): boolean {
  let ic = komut.trim();
  const sarmal = /^"?[^"\s]*?(powershell|pwsh|cmd|bash|sh)(\.exe)?"?\s+(-NoProfile\s+|-NoLogo\s+)*(-Command|-c|-lc|\/c|\/C)\s+([\s\S]*)$/i.exec(ic);
  if (sarmal) ic = sarmal[5]!.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/^'([\s\S]*)'$/, '$1');
  const parcalar = ic.split(/;|&&|\|\||\||\r?\n/).map((p) => p.trim()).filter(Boolean);
  return parcalar.some((p) => !commitMi(p) && !/^(git(\.exe)?(\s+-C\s+\S+)?\s+(add|status|diff)\b|cd\s|Set-Location\s)/i.test(p));
}

export const goreli = (kok: string, yol: string): string => relative(kok, yol).replace(/\\/g, '/');
