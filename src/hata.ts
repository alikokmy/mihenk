// Defterin bir istegi kural geregi geri cevirmesi. Hata degil, beklenen davranis: her kodun bir testi vardir.
export type RetKodu =
  | 'EKSIK_ALAN' // zorunlu alan bos
  | 'COK_UZUN' // alan ust siniri asiyor (kayit kisa tutulur)
  | 'KOMUT_IZINSIZ' // dogrulama komutunun programi izin listesinde degil
  | 'KABUK_KARAKTERI' // komutta kabuk karakteri var (zincirleme, boru, yonlendirme...)
  | 'KAYIT_YOK' // boyle bir is kaydi yok: kayit acilmadan is baslamaz
  | 'IS_KAPALI' // is kapanmis, artik degismez
  | 'GEREKCE_YOK' // "kaldi" ya da "belirsiz" hukmu gerekcesiz verilmez
  | 'HUKUM_CELISKILI' // istenen hukum dogrulama sonucuyla celisiyor
  | 'SURUCU_ISI' // isi surucu yonetiyor: hukmu ajan degil surucu verir
  | 'KESIF_HUKUM' // komutsuz kesif isi "gecti" diye kapanamaz: hukum iddiasi yoktur (Asama 34)
  | 'GECERSIZ_DEGER';

export class Ret extends Error {
  readonly kod: RetKodu;
  constructor(kod: RetKodu, mesaj: string) {
    super(mesaj);
    this.name = 'Ret';
    this.kod = kod;
  }
}
