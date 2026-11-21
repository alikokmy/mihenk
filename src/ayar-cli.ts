// mihenk ayar: ozellikleri acip kapatir. Uc bicim:
//   mihenk ayar                       ayarlarin listesi ve her oturuma eklenen tahmini baglam yuku
//   mihenk ayar <ad> ac|kapa|<deger>  tek ayari degistirir
//   mihenk ayar --menu                numarali menu (cift tiklanan mihenk-ayarlar.cmd bunu acar)
// Kurulumla ilgili bir ayar degisince kurulum hemen ayarlara esitlenir. Iletiler Turkce'ye ozgu harf kullanmaz (Windows konsolu).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { AYARLAR, ayarlariOku, ayarTanimi, ayarYaz, degerCoz, type AyarDegeri } from './ayar.js';
import { sec, t } from './dil.js';
import { kur } from './kur.js';

/**
 * Defter sunucusunun bes aracinin tanimi (ad, aciklama, girdi semasi) tools/list yanitinda kac karakter tutuyor.
 * Olculur, tahmin edilmez: test/ayar.test.ts gercek sunucudan olcup bu degerle %10 icinde uyustugunu denetler.
 */
export const MCP_ARAC_TANIMI_KARAKTER = 4952; // 2026-11-21 olcumu (is_ac: zorluk, aile, bolme_plani)

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

const goster = (d: AyarDegeri): string => (d === true ? t('ayar_acik') : d === false ? t('ayar_kapali') : String(d)).padEnd(6);
const deger = (d: AyarDegeri): string => (d === true ? t('ayar_acik') : d === false ? t('ayar_kapali') : String(d)).toLowerCase();

function listeMetni(kok: string): string {
  const a = ayarlariOku(kok);
  const notlar = a.bilgi_notlari !== false;
  const satirlar = AYARLAR.flatMap((x, i) => {
    const s = [`${String(i + 1).padStart(2)}. [${goster(a[x.ad]!)}] ${x.ad.padEnd(20)} ${sec(x.aciklama)}`];
    if (notlar) {
      s.push(`      ${t('ayar_amac')}: ${sec(x.amac)}`, `      ${t('ayar_sonuc')}: ${sec(x.sonuc)}`, `      ${t('ayar_varsayilan')} (${deger(x.varsayilan)}): ${sec(x.varsayilan_aciklama)}`);
      if (x.secenekler) s.push(`      ${t('ayar_secenekler')}: ${x.secenekler.join(', ')}`);
      if (x.sayi) s.push(`      ${t('ayar_deger_araligi', { en_az: x.sayi.en_az, en_cok: x.sayi.en_cok })}`);
    }
    return s;
  });
  if (notlar) satirlar.push('', t('ayar_not_gizle'));
  const y = baglamYuku(kok);
  satirlar.push('', t('ayar_baglam', { token: y.toplam_token, kurallar: y.yontem_metni, skill: y.skill, mcp: y.mcp }));
  return satirlar.join('\n');
}

/** Ayari yazar; kurulumla ilgiliyse ve proje kuruluysa kurulumu esitler. Kullaniciya gidecek kisa ozet doner. */
export function ayarDegistir(kok: string, ad: string, deger: AyarDegeri): string {
  const tanim = ayarTanimi(ad);
  ayarYaz(kok, { [ad]: deger });
  let ek = '';
  if (tanim.etki === 'kurulum' && existsSync(join(kok, '.mihenk', 'kurulum.json'))) {
    const s = kur(kok, { esitle: true });
    ek = t('ayar_kurulum_ek', { yazilan: s.yazilan.length, geri: s.geri_alinan?.length ?? 0 });
  }
  return t('ayar_degisti', { ad, deger: goster(deger).trim(), ek });
}

async function menu(kok: string): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  const sor = (): void => {
    console.log('');
    console.log(listeMetni(kok));
    console.log('');
    process.stdout.write(t('menu_istem'));
  };
  const it = rl[Symbol.asyncIterator]();
  const sonraki = async (): Promise<string | undefined> => { const r = await it.next(); return r.done ? undefined : r.value; };
  sor();
  for (let satir = await sonraki(); satir !== undefined; satir = await sonraki()) {
    const s = satir.trim();
    if (s === '' || s === '0' || s.toLowerCase() === 'q') break;
    const x = AYARLAR[Number(s) - 1];
    if (!x || !/^\d+$/.test(s)) {
      console.log('\n' + t('menu_numara_degil', { girdi: s }));
      sor();
      continue;
    }
    const simdiki = ayarlariOku(kok)[x.ad]!;
    let yeni: AyarDegeri;
    if (x.sayi) {
      process.stdout.write(t('menu_yeni_deger', { en_az: x.sayi.en_az, en_cok: x.sayi.en_cok, simdiki: String(simdiki) }));
      const r = await sonraki();
      try {
        yeni = degerCoz(x, (r ?? '').trim());
      } catch (e) {
        console.log(`\n${e instanceof Error ? e.message : String(e)}`); // dil-disi: hata iletisi firlatildigi yerde cevrildi
        sor();
        continue;
      }
    } else {
      yeni = x.secenekler ? x.secenekler[(x.secenekler.indexOf(String(simdiki)) + 1) % x.secenekler.length]! : !simdiki;
    }
    try {
      console.log('\n' + ayarDegistir(kok, x.ad, yeni));
    } catch (e) {
      console.log('\n' + t('menu_degistirilemedi', { hata: e instanceof Error ? e.message : String(e) }));
    }
    sor();
  }
  rl.close();
  console.log('\n' + t('menu_kaydedildi'));
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
    console.log('\n' + t('ayar_ipucu'));
    return 0;
  }
  const [ad, metin] = konum;
  if (metin === undefined) throw new Error(t('ayar_kullanim'));
  console.log(ayarDegistir(kok, ad!, degerCoz(ayarTanimi(ad!), metin)));
  return 0;
}
