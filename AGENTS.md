# mihenk: bu depoda çalışan ajanlar için

- **Plan tek kaynaktır:** [docs/IS_PLANI.md](docs/IS_PLANI.md). Aşama sırası ve kabul ölçütleri oradadır; iş, sıradaki açık aşamadan sürer.
- **Dayanak:** [docs/ARASTIRMA.md](docs/ARASTIRMA.md). Hazır bir depo işi görüyorsa yeniden yazılmaz, bağımlılık olarak kullanılır.
- **Dil:** belgeler, commit mesajları ve kullanıcıyla konuşma Türkçe. Kod tanımlayıcıları ASCII.
- **Üç ilke bağlayıcıdır** (IS_PLANI "İlke 1", "İlke 2", "İlke 3"): her kuralın bir denetimi olur; işin sürekliliğini ajan değil sürücü
  sağlar; program kodlama bilmeyen kullanıcı için kolaydır ve yönetici izni istemez.
- **Yöntem:** işten önce kabul ölçütü yazılır; önce ucuz denetim (duman); tek seferde tek değişiklik; kanıt bir komutun çıktısıdır;
  olumsuz sonuç da yazılır. Belge kısa tutulur: yeni belge açmadan önce var olan güncellenir.
- **Durma:** iş listesinde iş varken durulmaz. Karar gereken yerde önerilen seçenek uygulanır ve karşı görüşüyle birlikte not edilir.
  Durulacak yerler: geri alınamaz ya da dışa dönük işlem, güvenlik, kullanıcının varlığını isteyen adım.
- **Depo gizlidir;** görünürlüğü yalnız kullanıcı değiştirir.
