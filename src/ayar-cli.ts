// mihenk ayar: ozellikleri acip kapatir. Uc bicim:
//   mihenk ayar                       ayarlarin listesi ve her oturuma eklenen tahmini baglam yuku
//   mihenk ayar <ad> ac|kapa|<deger>  tek ayari degistirir
//   mihenk ayar --menu                numarali menu (cift tiklanan mihenk-ayarlar.cmd bunu acar)
// Kurulumla ilgili bir ayar degisince kurulum hemen ayarlara esitlenir. Iletiler Turkce'ye ozgu harf kullanmaz (Windows konsolu).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { AYARLAR, ayarlariOku, ayarTanimi, ayarYaz, degerCoz, type AyarDegeri } from './ayar.js';
import { kur } from './kur.js';

/**
 * Defter sunucusunun bes aracinin tanimi (ad, aciklama, girdi semasi) tools/list yanitinda kac karakter tutuyor.
 * Olculur, tahmin edilmez: test/ayar.test.ts gercek sunucudan olcup bu degerle %10 icinde uyustugunu denetler.
 */
export const MCP_ARAC_TANIMI_KARAKTER = 4456; // 2026-11-20 olcumu

export interface BaglamYuku {
  yontem_metni: number;
  skill: number;
  mcp: number;
  /** Yaklasik token: karakter / 4. */
  toplam_token: number;
}

/** Kurulumun her oturuma ekledigi metin (karakter). Bir arac oturum basinda tek skill dizininin ad ve aciklamalarini okur. */
export function baglamYuku(kok: string): BaglamYuku {
  const agents = existsSync(join(kok, 'AGENTS.md')) ? readFileSync(join(kok, 'AGENTS.md'), 'utf8') : '';
  const i = agents.indexOf('<!-- mihenk:basla -->');
  const j = agents.indexOf('<!-- mihenk:bitti -->');
  const yontemMetni = i >= 0 && j > i ? j + '<!-- mihenk:bitti -->'.length - i : 0;
  let skill = 0;
  for (const dizin of ['.claude/skills', '.agents/skills', '.cline/skills']) {
    const d = join(kok, dizin);
    if (!existsSync(d)) continue;
    let toplam = 0;
    for (const ad of readdirSync(d).filter((x) => x.startsWith('mihenk-'))) {
      const s = join(d, ad, 'SKILL.md');
      if (!existsSync(s)) continue;
      const on = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(s, 'utf8'));
      toplam += on ? on[1]!.length : 0;
    }
    skill = Math.max(skill, toplam);
  }
  const kurulu = ['.mcp.json', '.codex/config.toml', 'opencode.json', 'kilo.json', '.qwen/settings.json', '.gemini/settings.json', '.cline/mcp_settings.json']
    .some((g) => existsSync(join(kok, g)) && readFileSync(join(kok, g), 'utf8').includes('mihenk'));
  const mcp = kurulu ? MCP_ARAC_TANIMI_KARAKTER : 0;
  return { yontem_metni: yontemMetni, skill, mcp, toplam_token: Math.round((yontemMetni + skill + mcp) / 4) };
}

const goster = (d: AyarDegeri): string => (d === true ? 'ACIK  ' : d === false ? 'KAPALI' : String(d).padEnd(6));

function listeMetni(kok: string): string {
  const a = ayarlariOku(kok);
  const satirlar = AYARLAR.map((t, i) => `${String(i + 1).padStart(2)}. [${goster(a[t.ad]!)}] ${t.ad.padEnd(17)} ${t.aciklama}`);
  const y = baglamYuku(kok);
  satirlar.push('', `Her oturuma eklenen yaklasik baglam: ${y.toplam_token} token (kurallar ${y.yontem_metni}, skill ozetleri ${y.skill}, ` +
    `defter araclari ${y.mcp} karakter; token = karakter / 4, yaklasik).`);
  return satirlar.join('\n');
}

/** Ayari yazar; kurulumla ilgiliyse ve proje kuruluysa kurulumu esitler. Kullaniciya gidecek kisa ozet doner. */
export function ayarDegistir(kok: string, ad: string, deger: AyarDegeri): string {
  const t = ayarTanimi(ad);
  ayarYaz(kok, { [ad]: deger });
  let ek = '';
  if (t.etki === 'kurulum' && existsSync(join(kok, '.mihenk', 'kurulum.json'))) {
    const s = kur(kok, { esitle: true });
    ek = ` (kurulum guncellendi: ${s.yazilan.length} dosya yazildi, ${s.geri_alinan?.length ?? 0} dosya geri alindi)`;
  }
  return `${ad}: ${goster(deger).trim()}${ek}`;
}

async function menu(kok: string): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  const sor = (): void => {
    console.log('');
    console.log(listeMetni(kok));
    console.log('');
    process.stdout.write('Degistirmek icin numara yazip Enter\'a basin; cikmak icin yalniz Enter: ');
  };
  sor();
  for await (const satir of rl) {
    const s = satir.trim();
    if (s === '' || s === '0' || s.toLowerCase() === 'q') break;
    const t = AYARLAR[Number(s) - 1];
    if (!t || !/^\d+$/.test(s)) {
      console.log(`\n"${s}" bir numara degil.`);
      sor();
      continue;
    }
    const simdiki = ayarlariOku(kok)[t.ad]!;
    const yeni: AyarDegeri = t.secenekler
      ? t.secenekler[(t.secenekler.indexOf(String(simdiki)) + 1) % t.secenekler.length]!
      : !simdiki;
    try {
      console.log('\n' + ayarDegistir(kok, t.ad, yeni));
    } catch (e) {
      console.log(`\nDegistirilemedi: ${e instanceof Error ? e.message : String(e)}`);
    }
    sor();
  }
  rl.close();
  console.log('\nAyarlar kaydedildi (mihenk.json).');
}

export async function ayarKomutu(argv = process.argv.slice(3)): Promise<number> {
  const i = argv.indexOf('--hedef');
  const kok = resolve(i >= 0 ? argv[i + 1]! : process.cwd());
  const konum = argv.filter((x, n) => !x.startsWith('--') && !(i >= 0 && n === i + 1));
  if (argv.includes('--menu')) {
    await menu(kok);
    return 0;
  }
  if (konum.length === 0) {
    console.log(listeMetni(kok));
    console.log('\nDegistirmek icin: mihenk ayar <ad> ac|kapa (secimli ayarda degerin kendisi), ya da mihenk-ayarlar.cmd');
    return 0;
  }
  const [ad, metin] = konum;
  if (metin === undefined) throw new Error('kullanim: mihenk ayar <ad> ac|kapa|<deger>');
  console.log(ayarDegistir(kok, ad!, degerCoz(ayarTanimi(ad!), metin)));
  return 0;
}
