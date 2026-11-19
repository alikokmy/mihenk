// MCP yuzeyinin denetimleri: gercek stdio baglantisi, gercek sunucu sureci.
// Kabul olcutu 3: iki farkli istemci ayni deftere baglanip is acabiliyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const BIN = fileURLToPath(new URL('../src/bin.js', import.meta.url));

function kokKur(): string {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-mcp-'));
  writeFileSync(join(kok, 'gecer.js'), 'console.log("tamam"); process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'console.error("kaldi"); process.exit(1);');
  return kok;
}

async function baglan(ad: string, kok: string): Promise<Client> {
  const istemci = new Client({ name: ad, version: '1.0.0' });
  await istemci.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, '--kok', kok], stderr: 'pipe' }));
  return istemci;
}

interface Donus {
  hata: boolean;
  metin: string;
}

async function cagir(istemci: Client, arac: string, argumanlar: Record<string, unknown>): Promise<Donus> {
  const r = await istemci.callTool({ name: arac, arguments: argumanlar });
  const metin = (r.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? '').join('\n');
  return { hata: r.isError === true, metin };
}

function kayit(ek: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tur: 'ozellik', soru: 'Yeni uc nokta calisiyor mu?', beklenti: 'Test gecer.', yanlissa: 'Test kalir.',
    dogrulama_komutu: 'node gecer.js', ajan: 'ajan', model: 'model', ...ek,
  };
}

test('KABUL 3: iki farkli istemci ayni deftere baglanir, ikisi de is acar, birbirinin isini gorur', async () => {
  const kok = kokKur();
  const a = await baglan('birinci-arac', kok);
  const b = await baglan('ikinci-arac', kok);
  try {
    for (const istemci of [a, b]) {
      const adlar = (await istemci.listTools()).tools.map((t) => t.name).sort();
      assert.deepEqual(adlar, ['hukum_ver', 'is_ac', 'kanit_ekle', 'karar_yaz', 'rapor']);
    }
    const isA = JSON.parse((await cagir(a, 'is_ac', kayit({ ajan: 'arac-a' }))).metin);
    const isB = JSON.parse((await cagir(b, 'is_ac', kayit({ ajan: 'arac-b' }))).metin);
    assert.notEqual(isA.is_id, isB.is_id);

    const raporA = JSON.parse((await cagir(a, 'rapor', {})).metin);
    assert.equal(raporA.ozet.toplam, 2);
    // B, A'nin actigi isi gorur; istemci kimligini sunucu baglantidan okumustur (ajanin beyani degil).
    const ayrinti = JSON.parse((await cagir(b, 'rapor', { is_id: isA.is_id })).metin);
    assert.equal(ayrinti.is.ajan, 'arac-a');
    assert.match(ayrinti.is.istemci, /birinci-arac/);
    const ayrintiB = JSON.parse((await cagir(a, 'rapor', { is_id: isB.is_id })).metin);
    assert.match(ayrintiB.is.istemci, /ikinci-arac/);
  } finally {
    await a.close();
    await b.close();
  }
});

test('KABUL 1 (MCP): kayitsiz baslatma hata olarak doner', async () => {
  const kok = kokKur();
  const a = await baglan('arac', kok);
  try {
    const k = await cagir(a, 'kanit_ekle', { is_id: 41, icerik: 'isi bitirdim' });
    assert.equal(k.hata, true);
    assert.match(k.metin, /KAYIT_YOK/);
    const h = await cagir(a, 'hukum_ver', { is_id: 41 });
    assert.equal(h.hata, true);
    assert.match(h.metin, /KAYIT_YOK/);
    const eksik = await cagir(a, 'is_ac', kayit({ yanlissa: '' }));
    assert.equal(eksik.hata, true);
    assert.match(eksik.metin, /EKSIK_ALAN/);
  } finally {
    await a.close();
  }
});

test('KABUL 2 (MCP): dogrulamasi kalan is kapanmaz; gecen is kapanir', async () => {
  const kok = kokKur();
  const a = await baglan('arac', kok);
  try {
    const kalan = JSON.parse((await cagir(a, 'is_ac', kayit({ dogrulama_komutu: 'node kalir.js' }))).metin);
    await cagir(a, 'kanit_ekle', { is_id: kalan.is_id, icerik: 'Testler gecti, bitti.' });
    const h1 = JSON.parse((await cagir(a, 'hukum_ver', { is_id: kalan.is_id })).metin);
    assert.equal(h1.kapandi, false);
    assert.equal(h1.durum, 'acik');
    assert.equal(h1.dogrulama.cikis_kodu, 1);
    assert.match(h1.mesaj, /DOGRULAMA KALDI/);

    const gecen = JSON.parse((await cagir(a, 'is_ac', kayit())).metin);
    const h2 = JSON.parse((await cagir(a, 'hukum_ver', { is_id: gecen.is_id })).metin);
    assert.equal(h2.kapandi, true);
    assert.equal(h2.durum, 'gecti');

    const celiski = await cagir(a, 'hukum_ver', { is_id: gecen.is_id });
    assert.equal(celiski.hata, true);
    assert.match(celiski.metin, /IS_KAPALI/);
  } finally {
    await a.close();
  }
});

test('karar_yaz (MCP): karar notu kayda girer; karsi gorussuz reddedilir', async () => {
  const kok = kokKur();
  const a = await baglan('arac', kok);
  try {
    const is = JSON.parse((await cagir(a, 'is_ac', kayit())).metin);
    const tamam = await cagir(a, 'karar_yaz', {
      is_id: is.is_id, konu: 'Onbellek', secenekler: ['bellek', 'dosya'], secilen: 'bellek', karsi_gorus: 'Dosya yeniden baslatmada kalir.',
    });
    assert.equal(tamam.hata, false);
    const ret = await cagir(a, 'karar_yaz', { is_id: is.is_id, konu: 'k', secenekler: ['a', 'b'], secilen: 'a', karsi_gorus: '' });
    assert.equal(ret.hata, true);
    assert.match(ret.metin, /EKSIK_ALAN/);
  } finally {
    await a.close();
  }
});

test('sinirli cikti (MCP): uzun donus kesilir, tam metin dosyaya yazilir, yol donuste verilir', async () => {
  const kok = kokKur();
  const a = await baglan('arac', kok);
  try {
    const is = JSON.parse((await cagir(a, 'is_ac', kayit())).metin);
    for (let i = 0; i < 6; i++) {
      await cagir(a, 'kanit_ekle', { is_id: is.is_id, icerik: `not ${i} ` + 'y'.repeat(3900) });
    }
    const r = await cagir(a, 'rapor', { is_id: is.is_id });
    assert.equal(r.hata, false);
    assert.ok(r.metin.length <= 4000, 'donus uzunlugu: ' + r.metin.length);
    const yol = /Tam metin: (\S+)\]/.exec(r.metin)?.[1];
    assert.ok(yol, 'donuste dosya yolu olmali');
    const tam = JSON.parse(readFileSync(join(kok, yol), 'utf8'));
    assert.equal(tam.kanitlar.length, 6);
  } finally {
    await a.close();
  }
});
