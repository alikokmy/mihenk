// Doktor ve hata paketi (Asama 19). Doktor kurulumun calisip calismadigini satir satir soyler: TAMAM / SORUN / BILGI ve ne yapilacagi.
// Hicbir dosya yazmaz (projede .mihenk bile olusturmaz). Hata paketi: kisisel yollar ve anahtar benzeri metinler temizlenmis tek dosya.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { AJANLAR, type AjanTanimi } from './ajanlar.js';
import { ARAC_ADLARI, ayarlariOku } from './ayar.js';
import { t } from './dil.js';
import { baglantiOzeti } from './mcp-olcum.js';
import { uykuAyariniOku, uykuUyarisi } from './uyanik.js';

export interface DoktorSatiri {
  kimlik: string;
  durum: 'tamam' | 'sorun' | 'bilgi';
  metin: string;
  cozum?: string;
}

const GEREKEN_NODE = [22, 13];
const MCP_DOSYALARI: Record<string, string> = {
  claude: '.mcp.json', codex: '.codex/config.toml', gemini: '.gemini/settings.json', antigravity: '.agents/plugins/mihenk/mcp_config.json',
  opencode: 'opencode.json', kilo: 'kilo.json', cline: '.cline/mcp_settings.json', qwen: '.qwen/settings.json',
};
const KANCA_DOSYALARI: Record<string, string> = { claude: '.claude/settings.json', codex: '.codex/hooks.json', qwen: '.qwen/settings.json' };

/** Yapilandirmadaki program ve betik yollarini cikarir (JSON ya da TOML metni; mutlak yollar). */
function yollar(metin: string): string[] {
  return [...metin.matchAll(/"((?:[A-Za-z]:)?[\\/][^"]+?\.(?:js|exe|cmd))"/g)].map((m) => m[1]!.replace(/\\\\/g, '\\'));
}

/** o: testler icin Node surumu ve arac tanimlari degistirilebilir. */
export function doktor(kok: string, o: { nodeSurumu?: string; ajanlar?: Readonly<Record<string, AjanTanimi>> } = {}): DoktorSatiri[] {
  const s: DoktorSatiri[] = [];
  const ajanlar = o.ajanlar ?? AJANLAR;
  const surum = o.nodeSurumu ?? process.versions.node;
  const [ana, ara] = surum.split('.').map(Number) as [number, number];
  const yeni = ana > GEREKEN_NODE[0]! || (ana === GEREKEN_NODE[0] && ara >= GEREKEN_NODE[1]!);
  s.push(yeni ? { kimlik: 'node', durum: 'tamam', metin: t('d_node', { surum }) }
    : { kimlik: 'node', durum: 'sorun', metin: t('d_node_eski', { surum, gereken: GEREKEN_NODE.join('.') }), cozum: t('d_node_cozum') });

  const kurulu = existsSync(join(kok, '.mihenk', 'kurulum.json'));
  s.push(kurulu ? { kimlik: 'kurulum', durum: 'tamam', metin: t('d_kurulu') } : { kimlik: 'kurulum', durum: 'sorun', metin: t('d_kurulu_degil'), cozum: t('d_kur_cozum') });

  const ayar = ayarlariOku(kok);
  if (kurulu) {
    for (const [arac, dosya] of Object.entries(MCP_DOSYALARI)) {
      if (ayar[`arac_${arac}`] === false) continue;
      const ad = ARAC_ADLARI[arac]!;
      const yol = join(kok, dosya);
      let neden = '';
      if (!existsSync(yol)) neden = t('d_neden_dosya_yok');
      else {
        const metin = readFileSync(yol, 'utf8');
        if (!metin.includes('mihenk')) neden = t('d_neden_kayit_yok');
        else if (arac === 'opencode' && !opencodeKaydiVar(metin)) neden = t('d_neden_bicim');
        else {
          const eksik = yollar(metin.slice(metin.indexOf('mihenk'))).find((p) => !existsSync(p));
          if (eksik) neden = t('d_neden_program_yok', { yol: eksik });
        }
      }
      s.push(neden ? { kimlik: `mcp_${arac}`, durum: 'sorun', metin: t('d_mcp_yok', { arac: ad, dosya, neden }), cozum: t('d_kur_cozum') }
        : { kimlik: `mcp_${arac}`, durum: 'tamam', metin: t('d_mcp', { arac: ad, dosya }) });
    }
    if (ayar.kapi !== false) {
      for (const [arac, dosya] of Object.entries(KANCA_DOSYALARI)) {
        if (ayar[`arac_${arac}`] === false) continue;
        const ad = ARAC_ADLARI[arac]!;
        const yol = join(kok, dosya);
        let neden = '';
        if (!existsSync(yol)) neden = t('d_neden_dosya_yok');
        else {
          const metin = readFileSync(yol, 'utf8');
          if (!metin.includes('kapi-bin.js')) neden = t('d_neden_kayit_yok');
          else {
            const eksik = yollar(metin.slice(metin.indexOf('hooks'))).find((p) => !existsSync(p));
            if (eksik) neden = t('d_neden_program_yok', { yol: eksik });
          }
        }
        s.push(neden ? { kimlik: `kanca_${arac}`, durum: 'sorun', metin: t('d_kanca_yok', { arac: ad, dosya, neden }), cozum: t('d_kur_cozum') }
          : { kimlik: `kanca_${arac}`, durum: 'tamam', metin: t('d_kanca', { arac: ad, dosya }) });
      }
      // Kancanin son calismasi (kapi.jsonl): hic yoksa bilgi; Codex kancasi hic calismamissa onay eksik olabilir.
      const kayit = join(kok, '.mihenk', 'kapi.jsonl');
      const satirlar = existsSync(kayit) ? readFileSync(kayit, 'utf8').trim().split('\n').filter(Boolean) : [];
      const son = satirlar.length ? (JSON.parse(satirlar[satirlar.length - 1]!) as { zaman: string; arac: string }) : null;
      s.push({ kimlik: 'kanca_son', durum: 'bilgi', metin: son ? t('d_kanca_son', { zaman: son.zaman.replace('T', ' ').slice(0, 16), arac: son.arac }) : t('d_kanca_hic') });
      const codexBulundu = ajanlar.codex?.komutBul() != null;
      if (codexBulundu && ayar.arac_codex !== false && !satirlar.some((x) => x.includes('"arac":"codex"'))) {
        s.push({ kimlik: 'codex_onay', durum: 'bilgi', metin: t('d_codex_onay'), cozum: t('d_codex_cozum') });
      }
    }
  }

  const bulunan = Object.entries(ajanlar).filter(([, a]) => a.komutBul() !== null).map(([ad]) => ad);
  s.push(bulunan.length ? { kimlik: 'araclar', durum: 'tamam', metin: t('d_araclar', { liste: bulunan.join(', ') }) }
    : { kimlik: 'araclar', durum: 'sorun', metin: t('d_arac_yok'), cozum: t('d_arac_cozum') });

  // MCP baglanti olcumu (2026-11-21): surucu oturumlarinda arac deftere gec mi baglandi? Olcumdur; onlem olcume gore karar.
  const bo = baglantiOzeti(kok);
  if (bo.oturum > 0) s.push({ kimlik: 'mcp_baglanti', durum: 'bilgi', metin: t('d_mcp_baglanti', { oturum: bo.oturum, gec: bo.gec, baglanmayan: bo.baglanmayan }) });

  const db = join(kok, '.mihenk', 'defter.db');
  if (existsSync(db)) {
    try {
      const d = new DatabaseSync(db, { readOnly: true });
      try {
        const n = (d.prepare('SELECT count(*) AS n FROM isler').get() as { n: number }).n;
        s.push({ kimlik: 'defter', durum: 'tamam', metin: t('d_defter', { sayi: n }) });
      } finally {
        d.close();
      }
    } catch (e) {
      s.push({ kimlik: 'defter', durum: 'sorun', metin: t('d_defter_bozuk', { hata: e instanceof Error ? e.message : String(e) }), cozum: t('d_defter_cozum') });
    }
  } else {
    s.push({ kimlik: 'defter', durum: 'bilgi', metin: t('d_defter_yok') });
  }

  const uyku = uykuUyarisi(uykuAyariniOku());
  if (uyku) s.push({ kimlik: 'uyku', durum: 'bilgi', metin: uyku });
  return s;
}

export function doktorMetni(satirlar: DoktorSatiri[]): string {
  const etiket = { tamam: t('d_tamam'), sorun: t('d_sorun'), bilgi: t('d_bilgi') };
  const out = satirlar.flatMap((x) => [`[${etiket[x.durum].padEnd(5)}] ${x.metin}`, ...(x.cozum && x.durum !== 'tamam' ? [t('d_ne_yapmali', { cozum: x.cozum })] : [])]);
  out.push('', t('d_ozet', { sorun: satirlar.filter((x) => x.durum === 'sorun').length, tamam: satirlar.filter((x) => x.durum === 'tamam').length }));
  return out.join('\n');
}

/** Kisisel ve gizli bilgileri temizler: ev dizini, kullanici adi, e-posta, anahtar ve jeton benzeri metinler. */
export function temizle(metin: string): string {
  const ev = homedir();
  const kacir = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let m = metin;
  for (const v of [ev, ev.replace(/\\/g, '/'), ev.replace(/\\/g, '\\\\')]) m = m.replace(new RegExp(kacir(v), 'gi'), '~');
  const kullanici = userInfo().username;
  if (kullanici.length >= 3) m = m.replace(new RegExp(`\\b${kacir(kullanici)}\\b`, 'gi'), '<kullanici>');
  return m
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<eposta>')
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/g, '<anahtar>')
    .replace(/("?(?:api[_-]?key|token|secret|password|parola|sifre)"?\s*[:=]\s*)"[^"]*"/gi, '$1"<gizli>"');
}

/** Hata paketi: doktor, surumler, ayarlar, gunluklerin sonu; temizlenmis tek dosya .mihenk/ altinda. Yolunu doner. */
export function hataPaketi(kok: string, zaman = new Date()): string {
  const son = (dosya: string, n = 200): string => {
    const y = join(kok, '.mihenk', dosya);
    return existsSync(y) ? readFileSync(y, 'utf8').trim().split('\n').slice(-n).join('\n') : '(yok)';
  };
  const parcalar = [
    `mihenk hata paketi ${zaman.toISOString()}`,
    `node ${process.versions.node}, ${process.platform} ${process.arch}`,
    '', '== doktor ==', doktorMetni(doktor(kok)),
    '', '== ayarlar ==', JSON.stringify(ayarlariOku(kok), null, 2),
    '', '== log.jsonl (son 200) ==', son('log.jsonl'),
    '', '== surucu.jsonl (son 200) ==', son('surucu.jsonl'),
    '', '== kapi.jsonl (son 200) ==', son('kapi.jsonl'),
  ];
  const dizin = join(kok, '.mihenk');
  mkdirSync(dizin, { recursive: true });
  const yol = join(dizin, `hata-paketi-${zaman.toISOString().replace(/[:.]/g, '-')}.txt`);
  writeFileSync(yol, temizle(parcalar.join('\n')) + '\n');
  return yol;
}

/** OpenCode kaydi: mcp.mihenk (1.x ve 2.x) ya da mcp.servers.mihenk (yalniz 2.x); ikisinde de command bir dizi olmalidir. */
function opencodeKaydiVar(metin: string): boolean {
  try {
    const n = JSON.parse(metin) as { mcp?: { mihenk?: { command?: unknown }; servers?: { mihenk?: { command?: unknown } } } };
    return Array.isArray(n.mcp?.mihenk?.command) || Array.isArray(n.mcp?.servers?.mihenk?.command);
  } catch {
    return false;
  }
}
