#!/usr/bin/env node
// mihenk komut satiri. Simdilik tek komut: kur.
//   mihenk kur [--hedef <proje dizini>] [--arac claude,codex,gemini,antigravity]
import { ARACLAR, kur, type Arac } from './kur.js';

const [komut, ...gerisi] = process.argv.slice(2);
const secenek = (ad: string): string | undefined => {
  const i = gerisi.indexOf(ad);
  return i >= 0 ? gerisi[i + 1] : undefined;
};

if (komut !== 'kur') {
  console.error('kullanim: mihenk kur [--hedef <proje dizini>] [--arac claude,codex,gemini,antigravity]');
  console.error('Defter sunucusu ayri calisir: mihenk-defter [--kok <proje dizini>]');
  process.exit(komut === undefined || komut === '--help' ? 0 : 2);
}

const istenen = (secenek('--arac') ?? ARACLAR.join(',')).split(',').map((a) => a.trim()).filter(Boolean);
const bilinmeyen = istenen.filter((a) => !ARACLAR.includes(a as Arac));
if (bilinmeyen.length > 0) {
  console.error(`bilinmeyen arac: ${bilinmeyen.join(', ')}. Gecerli: ${ARACLAR.join(', ')}`);
  process.exit(2);
}

try {
  const sonuc = kur(secenek('--hedef') ?? process.cwd(), { araclar: istenen as Arac[] });
  for (const d of sonuc.yazilan) console.log(`yazildi    ${d}`);
  for (const u of sonuc.uyarilar) console.log(`UYARI      ${u}`);
  console.log(`${sonuc.yazilan.length} dosya yazildi, ${sonuc.degismeyen.length} dosya zaten gunceldi.`);
} catch (e) {
  console.error(`mihenk kur: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
