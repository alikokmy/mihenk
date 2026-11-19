// Bagimsiz test istemcisi: MCP istemci kitapligiyla yazilmis, hicbir ajan aracina bagli olmayan ikinci istemci.
// Kabul olcutu 3'un elle kosulan yarisi: gercek bir ajan araci (or. Claude Code) ayni deftere is actiktan sonra
// bu betik ayni deftere baglanir, kendi isini acar ve defterdeki butun isleri, kimin actigiyla birlikte listeler.
// Kullanim: node dist/test/ikinci_istemci.js --kok <defterin proje dizini>
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const BIN = fileURLToPath(new URL('../src/bin.js', import.meta.url));
const kokSirasi = process.argv.indexOf('--kok');
const kok = kokSirasi >= 0 ? process.argv[kokSirasi + 1] : undefined;
if (!kok) {
  console.error('kullanim: node dist/test/ikinci_istemci.js --kok <dizin>');
  process.exit(2);
}

const istemci = new Client({ name: 'bagimsiz-test-istemcisi', version: '1.0.0' });
await istemci.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, '--kok', kok], stderr: 'pipe' }));

async function cagir(arac: string, argumanlar: Record<string, unknown>): Promise<any> {
  const r = await istemci.callTool({ name: arac, arguments: argumanlar });
  const metin = (r.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n');
  if (r.isError) throw new Error(`${arac}: ${metin}`);
  return JSON.parse(metin);
}

const araclar = (await istemci.listTools()).tools.map((t) => t.name).sort();
console.log(`araclar: ${araclar.join(', ')}`);

const is = await cagir('is_ac', {
  tur: 'test', soru: 'Ikinci istemci ayni deftere is acabiliyor mu?', beklenti: 'Kayit acilir ve dogrulama gecer.',
  yanlissa: 'Baglanti ya da kayit hata verir.', dogrulama_komutu: 'node gecer.js', ajan: 'bagimsiz-test-istemcisi', model: 'yok',
});
const hukum = await cagir('hukum_ver', { is_id: is.is_id });
console.log(`ikinci istemci is ${is.is_id} acti; hukum: ${hukum.durum} (cikis kodu ${hukum.dogrulama.cikis_kodu})`);

const rapor = await cagir('rapor', {});
console.log(`defter ozeti: ${JSON.stringify(rapor.ozet)}`);
const istemciler = new Set<string>();
for (const satir of [...rapor.isler].reverse()) {
  const ayrinti = await cagir('rapor', { is_id: satir.id });
  istemciler.add(String(ayrinti.is.istemci));
  console.log(`  is ${satir.id}: durum=${satir.durum} ajan=${satir.ajan} model=${satir.model} istemci=${ayrinti.is.istemci}`);
}
await istemci.close();

console.log(`defterde is acan farkli istemci sayisi: ${istemciler.size}`);
if (istemciler.size < 2) {
  console.error('KALDI: ayni defterde iki farkli istemcinin isi yok.');
  process.exit(1);
}
console.log('GECTI: iki farkli istemci ayni deftere baglanip is acti.');
