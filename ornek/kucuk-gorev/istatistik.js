// Kucuk gorev ornegi: bilerek hatali. ortalama() bos listede NaN doner, ortanca() siralamadan alir.
export function ortalama(sayilar) {
  return sayilar.reduce((a, b) => a + b, 0) / sayilar.length;
}

export function ortanca(sayilar) {
  const orta = Math.floor(sayilar.length / 2);
  return sayilar.length % 2 === 1 ? sayilar[orta] : (sayilar[orta - 1] + sayilar[orta]) / 2;
}
