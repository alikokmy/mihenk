// Projenin onerisi (Asama 35): saf oneri hesabi + sampiyon duzeni + degisimlerin deftere yazilmasi. Komut satiri, pencere ve surucu
// (kesif) bunu kullanir; boylece uc yerde ayni oneri cikar.
import type { Defter } from './defter.js';
import { oneriHesapla, type OneriAyarlari, type TurOnerisi } from './oneri.js';
import { sampiyonUygula } from './sampiyon.js';

export function projeOnerisi(defter: Defter, ayarlar: Partial<OneriAyarlari>, o: { yaz?: boolean } = {}): TurOnerisi[] {
  const ham = oneriHesapla(defter.olcumler(), ayarlar);
  const { turler, degisimler } = sampiyonUygula(ham, defter.sampiyonlar());
  if (o.yaz !== false) for (const x of degisimler) defter.sampiyonYaz(x);
  return turler;
}
