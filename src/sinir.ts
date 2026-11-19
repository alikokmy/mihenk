// Sinirli cikti (Ilke 2): tek bir arac donusu ajanin baglamini tasiramaz.
// Uzun metnin basi ve sonu korunur; fazlasi cagiran tarafindan dosyaya yazilir.

export interface Kisaltma {
  metin: string;
  kesildi: boolean;
  tam_uzunluk: number;
}

export function kisalt(metin: string, sinir: number): Kisaltma {
  if (metin.length <= sinir) return { metin, kesildi: false, tam_uzunluk: metin.length };
  const ara = `\n... [kesildi: tam uzunluk ${metin.length} karakter] ...\n`;
  const kalan = Math.max(0, sinir - ara.length);
  // Test ciktisinda asil bilgi cogunlukla sondadir: dortte biri bas, kalani son.
  const bas = Math.floor(kalan / 4);
  const son = kalan - bas;
  const kisa = metin.slice(0, bas) + ara + (son > 0 ? metin.slice(metin.length - son) : '');
  return { metin: kisa.slice(0, Math.max(sinir, 0)), kesildi: true, tam_uzunluk: metin.length };
}
