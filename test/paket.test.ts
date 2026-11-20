// Yontem paketinin denetimleri (Ilke 1: "bir kural, bir denetim").
// Bu testler paketin kendi tutarliligini zorlar: denetimi olmayan madde "kural" etiketi tasiyamaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkills } from '@modelcontextprotocol/server/ext/skills/node';

const DEPO = fileURLToPath(new URL('../../', import.meta.url));
const SKILL_DIZINI = join(DEPO, 'paket', 'skills');

interface Madde {
  kod: string;
  etiket: 'kural' | 'oneri';
  skill: string;
  metin: string;
  denetim?: { dosya: string; test: string };
  neden_denetlenemiyor?: string;
  denetim_plani?: string;
}

const maddeler = (JSON.parse(readFileSync(join(DEPO, 'paket', 'kurallar.json'), 'utf8')) as { maddeler: Madde[] }).maddeler;
const skillAdlari = readdirSync(SKILL_DIZINI, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

function skillOku(ad: string): { on: Record<string, string>; govde: string; ham: string } {
  const ham = readFileSync(join(SKILL_DIZINI, ad, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(ham);
  assert.ok(m, `${ad}: SKILL.md on bilgi (--- ... ---) ile baslamali`);
  const on: Record<string, string> = {};
  for (const satir of (m[1] ?? '').split('\n')) {
    const s = /^([a-z-]+):\s*(.*)$/.exec(satir);
    if (s) on[s[1] as string] = (s[2] ?? '').trim();
  }
  return { on, govde: m[2] ?? '', ham };
}

test('paket: 6-8 skill var ve hepsi resmi MCP skill denetleyicisinden hatasiz geciyor', async () => {
  assert.ok(skillAdlari.length >= 6 && skillAdlari.length <= 8, `skill sayisi: ${skillAdlari.length}`);
  // strict: bicim hatasi olan skill uyari degil hata olur.
  const katalog = await loadSkills(SKILL_DIZINI, { strict: true });
  assert.equal(katalog.entries.length, skillAdlari.length);
});

test('paket: her skill adi klasor adiyla ayni, kucuk harf-tire biciminde; aciklama dolu ve kisa; govde kisa', () => {
  for (const ad of skillAdlari) {
    const { on, govde } = skillOku(ad);
    assert.equal(on.name, ad, `${ad}: name klasor adiyla ayni olmali`);
    assert.match(ad, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${ad}: ad bicimi`);
    assert.ok(ad.length <= 64, `${ad}: ad en fazla 64 karakter`);
    const aciklama = on.description ?? '';
    assert.ok(aciklama.length >= 40, `${ad}: aciklama ne zaman kullanilacagini soylemeli`);
    assert.ok(aciklama.length <= 1024, `${ad}: aciklama en fazla 1024 karakter (${aciklama.length})`);
    assert.match(aciklama, /\bUse\b/, `${ad}: aciklama ne zaman kullanilacagini ("Use when ...") yazmali`);
    const satir = govde.trim().split('\n').length;
    assert.ok(satir <= 60, `${ad}: govde kisa tutulur, ${satir} satir`);
  }
});

test('paket: "kural" etiketli her maddenin var olan bir testi var (denetimsiz kural olmaz)', () => {
  const kurallar = maddeler.filter((m) => m.etiket === 'kural');
  assert.ok(kurallar.length > 0);
  for (const m of kurallar) {
    assert.ok(m.denetim, `${m.kod}: kural etiketi denetim ister`);
    const kaynak = readFileSync(join(DEPO, m.denetim.dosya), 'utf8');
    const baslik = `test('${m.denetim.test}'`;
    assert.ok(kaynak.includes(baslik), `${m.kod}: ${m.denetim.dosya} icinde su baslikla test yok: ${m.denetim.test}`);
  }
});

test('paket: "oneri" etiketli her madde neden denetlenemedigini ve denetim planini yazar', () => {
  for (const m of maddeler.filter((x) => x.etiket === 'oneri')) {
    assert.equal(m.denetim, undefined, `${m.kod}: denetimi olan madde oneri degil kuraldir`);
    assert.ok((m.neden_denetlenemiyor ?? '').length > 10, `${m.kod}: neden_denetlenemiyor bos`);
    assert.ok((m.denetim_plani ?? '').length > 10, `${m.kod}: denetim_plani bos`);
  }
});

test('paket: madde kodlari tekil; her madde var olan bir skill gosterir; her skill en az bir maddeye bagli', () => {
  const kodlar = maddeler.map((m) => m.kod);
  assert.equal(new Set(kodlar).size, kodlar.length, 'ayni kod iki kez kullanilmis');
  for (const m of maddeler) {
    assert.ok(['kural', 'oneri'].includes(m.etiket), `${m.kod}: etiket kural ya da oneri olmali`);
    assert.ok(skillAdlari.includes(m.skill), `${m.kod}: skill yok: ${m.skill}`);
  }
  for (const ad of skillAdlari) {
    assert.ok(maddeler.some((m) => m.skill === ad), `${ad}: hicbir maddeye bagli degil`);
  }
});

test('paket: skill metni ile tablo bagli: kural kodu skill metninde gecer; yalniz oneri tasiyan skill kendini oneri diye etiketler', () => {
  for (const m of maddeler.filter((x) => x.etiket === 'kural')) {
    assert.ok(skillOku(m.skill).govde.includes(`[${m.kod}]`), `${m.skill}: metninde [${m.kod}] isareti yok`);
  }
  for (const ad of skillAdlari) {
    const { govde } = skillOku(ad);
    for (const kod of govde.match(/\[K\d+\]/g) ?? []) {
      const m = maddeler.find((x) => `[${x.kod}]` === kod);
      assert.ok(m && m.skill === ad && m.etiket === 'kural', `${ad}: metindeki ${kod} tabloda bu skill'in kurali degil`);
    }
    const kuraliVar = maddeler.some((m) => m.skill === ad && m.etiket === 'kural');
    if (!kuraliVar) assert.match(govde, /\(suggestion\)/, `${ad}: yalniz oneri tasiyor, basliginda "(suggestion)" yazmali`);
  }
});

test('paket: AGENTS.md blogu kisa, defter araclarini ve butun skill adlarini aniyor', () => {
  const blok = readFileSync(join(DEPO, 'paket', 'AGENTS.md'), 'utf8');
  assert.ok(blok.trim().split('\n').length <= 25, 'AGENTS.md blogu kisa tutulur');
  for (const arac of ['is_ac', 'hukum_ver', 'karar_yaz', 'rapor']) assert.ok(blok.includes(`\`${arac}\``), `arac anilmiyor: ${arac}`);
  for (const ad of skillAdlari) assert.ok(blok.includes(`\`${ad}\``), `skill anilmiyor: ${ad}`);
});

test('paket: plan belgesindeki tablo butun madde kodlarini iceriyor (belge ile paket ayrismaz)', () => {
  const plan = readFileSync(join(DEPO, 'docs', 'SONUCLAR.md'), 'utf8');
  for (const m of maddeler) assert.ok(new RegExp(`\\| ${m.kod} \\|`).test(plan), `SONUCLAR.md tablosunda ${m.kod} yok`);
});
