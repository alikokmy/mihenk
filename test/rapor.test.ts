// Asama 14 kabul olcutu: rapor kodlama terimi bilmeyen birinin okuyacagi dilde ve defterle sayica uyusuyor; bildirim yalniz istenince.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AjanTanimi } from '../src/ajanlar.js';
import { ayarYaz } from '../src/ayar.js';
import { Defter } from '../src/defter.js';
import { raporHtml } from '../src/rapor.js';
import { listeyiYurut } from '../src/surucu.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

async function dolu(): Promise<string> {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-rapor-'));
  writeFileSync(join(kok, 'gecer.js'), 'process.exit(0);');
  writeFileSync(join(kok, 'kalir.js'), 'process.exit(1);');
  const d = new Defter(kok);
  const ac = (soru: string, komut: string) => d.isAc({ tur: 't', soru, beklenti: 'b', yanlissa: 'y', dogrulama_komutu: komut, ajan: 'codex', model: 'm' }).id;
  await d.hukumVer({ is_id: ac('Toplama hatasini duzelt <script>alert(1)</script>', 'node gecer.js') });
  await d.hukumVer({ is_id: ac('Ikinci basarili is', 'node gecer.js') });
  await d.hukumVer({ is_id: ac('Indirim hesabini duzelt', 'node kalir.js'), hukum: 'kaldi', gerekce: 'takildi: 3 denemede dogrulama gecmedi' });
  await d.hukumVer({ is_id: ac('Rapor sayfasi ekle', 'node kalir.js'), hukum: 'belirsiz', gerekce: 'butce: is dolar tavani (1 USD) doldu (harcanan 1.2 USD)' });
  ac('Henuz bitmeyen is', 'node gecer.js');
  d.kullanimEkle({ is_id: 1, ajan: 'codex', oturum: 1, sure_ms: 65_000, girdi: 10, onbellek_okuma: 0, onbellek_yazma: 0, cikti: 5, maliyet_usd: 0.25 });
  d.kapat();
  return kok;
}

test('KABUL: rapordaki sayilar defterle uyusuyor; her is, sonucu ve nedeni duz dilde', async () => {
  const kok = await dolu();
  const { html, ozet } = raporHtml(kok);
  const d = new Defter(kok);
  const asil = d.rapor({}).ozet;
  d.kapat();
  assert.deepEqual(ozet, asil);
  const m = /data-toplam="(\d+)" data-gecti="(\d+)" data-kaldi="(\d+)" data-belirsiz="(\d+)" data-acik="(\d+)"/.exec(html)!;
  assert.deepEqual(m.slice(1).map(Number), [asil.toplam, asil.gecti, asil.kaldi, asil.belirsiz, asil.acik]);
  assert.match(html, /5 işin 2 tanesi başarıyla bitti, 1 tanesi yapılamadı, 1 tanesinde emin olunamadı, 1 tanesi henüz bitmedi\./);
  assert.match(html, /Başarıyla bitti<\/span> İş 1/);
  assert.match(html, /Verilen deneme hakkında denetim geçmedi/);
  assert.match(html, /Harcama ya da süre sınırına ulaşıldı/);
  assert.match(html, /Süre: \d+ sn · Maliyet: 0\.2500 USD/);
  assert.match(html, /mihenk geri-al 3/);
  assert.doesNotMatch(html, /mihenk geri-al 1</, 'basarili is icin geri alma onerilmez');
});

test('KABUL: rapor kodlama terimi ve ham alan adi icermez; ajandan gelen metin kacislanir', async () => {
  const kok = await dolu();
  const { html } = raporHtml(kok);
  const gorunen = html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
  for (const terim of ['hukum', 'cikis kodu', 'exit code', 'undefined', 'null', 'NaN', 'takildi:', 'butce:', 'dogrulama_komutu', 'gerekce', 'stderr']) {
    assert.ok(!gorunen.includes(terim), `raporda "${terim}" gecmemeli`);
  }
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('surucu liste sonunda raporu yeniler; bildirim yalniz istenince ve ayar aciksa gonderilir', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'mihenk-rapor-surucu-'));
  writeFileSync(join(kok, 'var.js'), "process.exit(require('node:fs').existsSync('h.txt') ? 0 : 1);");
  const yol = join(kok, 'ajan.mjs');
  writeFileSync(yol, "import { writeFileSync } from 'node:fs'; writeFileSync('h.txt', 'x');");
  const ajan: AjanTanimi = { ad: 'yapan', istemci: /^yapan$/, komutBul: () => ({ program: process.execPath, onEk: [yol] }), argumanlar: (i) => [i], kullanimOku: () => undefined, metinOku: () => undefined };
  ayarYaz(kok, { bildirim: false });
  const satirlar: string[] = [];
  await listeyiYurut({ kok, liste: { ajan: 'yapan', isler: [{ tur: 't', soru: 'h olustur', beklenti: 'var', yanlissa: 'yok', dogrulama_komutu: 'node var.js' }] },
    saklama: 'yok', ajanlar: { yapan: ajan }, korunanDizinler: [], yaz: (s) => satirlar.push(s), bildirim: true });
  assert.ok(existsSync(join(kok, '.mihenk', 'rapor.html')));
  assert.match(readFileSync(join(kok, '.mihenk', 'rapor.html'), 'utf8'), /1 işin 1 tanesi başarıyla bitti/);
  assert.ok(satirlar.some((s) => /^Rapor: /.test(s)));
  assert.doesNotMatch(readFileSync(join(kok, '.mihenk', 'surucu.jsonl'), 'utf8'), /"olay":"bildirim"/, 'ayar kapali: bildirim gonderilmedi');
});

test('komut satiri: mihenk rapor raporu yazar; defter yoksa soyler', async () => {
  const kok = await dolu();
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'rapor', '--hedef', kok], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Rapor: .*rapor\.html/);
  const bos = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'rapor', '--hedef', mkdtempSync(join(tmpdir(), 'bos-'))], { encoding: 'utf8' });
  assert.match(bos.stdout, /defter yok/);
});
