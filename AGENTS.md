# mihenk: bu depoda çalışan ajanlar için

- **Plan tek kaynaktır:** [docs/IS_PLANI.md](docs/IS_PLANI.md). Aşama sırası ve kabul ölçütleri oradadır; iş, sıradaki açık aşamadan sürer. Aşama sonuçları (kanıt, olumsuz notlar) [docs/SONUCLAR.md](docs/SONUCLAR.md) dosyasına yazılır.
- **Dayanak:** [docs/ARASTIRMA.md](docs/ARASTIRMA.md). Hazır bir depo işi görüyorsa yeniden yazılmaz, bağımlılık olarak kullanılır.
- **Dil:** belgeler, commit mesajları ve kullanıcıyla konuşma Türkçe. Kod tanımlayıcıları ASCII.
- **Üç ilke bağlayıcıdır** (IS_PLANI "İlke 1", "İlke 2", "İlke 3"): her kuralın bir denetimi olur; işin sürekliliğini ajan değil sürücü
  sağlar; program kodlama bilmeyen kullanıcı için kolaydır ve yönetici izni istemez.
- **Yöntem:** işten önce kabul ölçütü yazılır; önce ucuz denetim (duman); birbirine bağlı değişiklikler tek iş ailesi olarak birlikte yapılır ve sonuç kötü çıkarsa nasıl ikiye bölüneceği yazılır, doğrulamayı değiştiren iş ayrı iştir (kullanıcı onayı 2026-11-21, "tek seferde tek değişiklik"in yerine); kanıt bir komutun çıktısıdır;
  olumsuz sonuç da yazılır. Belge kısa tutulur: yeni belge açmadan önce var olan güncellenir.
- **Durma:** iş listesinde iş varken durulmaz. Karar gereken yerde önerilen seçenek uygulanır ve karşı görüşüyle birlikte not edilir.
  Durulacak yerler: geri alınamaz ya da dışa dönük işlem, güvenlik, kullanıcının varlığını isteyen adım.
- **Geçici dosyalar** (betik, çıktı, test klasörü) sistemin ya da aracın geçici klasörüne değil, depodaki git-dışı `.gecici/` altına yazılır
  ve iş bitince silinir (kullanıcı kararı 2026-11-22: geçici klasör şişince bilgisayar açılmıyor). Testler `npm test` ya da
  `npm run test:dosya -- <ad>` ile koşulur; doğrudan `node --test` sistemin geçici klasörüne yazar.
- **Depo gizlidir;** görünürlüğü yalnız kullanıcı değiştirir.
