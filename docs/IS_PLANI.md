# İş planı (taslak, 2026-11-19)

Dayanak: [ARASTIRMA.md](ARASTIRMA.md). Onaylanana dek taslaktır.

## Ne kuruyoruz

**mihenk:** kodlama ajanlarının bağlandığı, işi kayda alan, kanıt isteyen ve hangi işin hangi ajana verileceğini ölçerek öneren ince bir katman.

Üç parça:
1. **Yöntem paketi:** Agent Skills biçiminde az sayıda skill ve kısa bir AGENTS.md parçası.
2. **Defter (MCP sunucusu):** her işin türü, beklentisi, yürüten ajan ve model, süresi, maliyeti ve doğrulama sonucu.
3. **Öneri:** defterdeki ölçülmüş sonuçlardan iş türü başına ajan / model önerisi. Kullanıcı her zaman kendi seçimini yapabilir.

## Yöntemden ne alıyoruz, ne almıyoruz

metamorfik denetimi (2026-11-18) hangi alışkanlığın kazandırdığını, hangisinin yalnız yük olduğunu gösterdi. mihenk yalın olanı taşır.

| Alınan | Alınmayan |
|---|---|
| işten önce kısa kayıt: soru, beklenti, "yanlışsa ne görürüz", doğrulama komutu | yüzlerce satırlık ön kayıt belgeleri |
| ucuz denetim önce: duman koşusu, gerçek veriyle kısa deneme | her değişiklikte tam test takımı |
| tek koşuda tek değişiklik | |
| yazan doğrulamaz: bağımsız doğrulayıcı ve çürütücü rol | |
| kanıt olmadan "bitti" yok; kanıt bir komutun çıktısıdır | belge biçimi testleri |
| işlem ve girdisini taşıyan log; kök neden logdan | |
| kısa karar notu ve en güçlü karşı görüş | her kararın uzun defter satırı |
| iki vites: keşif (hafif) ve hüküm (tam) | her işe aynı ağırlıkta tören |

## Teknik seçimler (öneri)

- **Dil:** TypeScript, Node 22+. Hedef araçların hepsinde Node var; `npx` ile kurulumsuz çalışır; resmî MCP kitaplığı hazır.
- **Depolama:** proje içinde tek SQLite dosyası (`.mihenk/defter.db`) ve okunur JSONL dökümü.
- **Maliyet verisi:** önce CodeBurn ya da ccusage'ın JSON çıktısı okunur; kendi sayacımız yazılmaz.
- **Kapsam dışı (ilk sürüm):** vekil sunucu ile model çağrısı yönlendirme, masaüstü arayüz, bulut.

En güçlü karşı görüş: Python, istatistik ve metamorfik'teki mevcut karar kodu için daha rahat olurdu. TypeScript seçiminin gerekçesi dağıtımdır;
öneri hesabı birkaç yüz satırdır ve iki dilde de yazılır.

## Aşamalar

Her aşamanın kabul ölçütü işe başlamadan yazılıdır; aşama, ölçüt komutla gösterilince kapanır.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 0 | Depo, yöntem özeti, bu plan | depo gizli ve push edilmiş |
| 1 | Yöntem paketi: 6-8 skill + AGENTS.md parçası; Claude Code, Codex ve Gemini CLI'ya kurulum | üç araçta skill'ler listeleniyor; aynı küçük görevde üçü de önce kayıt açıyor |
| 2 | Defter: MCP sunucusu (`is_ac`, `kanit_ekle`, `hukum_ver`, `rapor`) | iki farklı araçtan açılan işler aynı defterde; sunucu testleri geçiyor |
| 3 | Maliyet ve süre: oturum verisini işe bağlama | kapanan her işte süre ve maliyet dolu; elle hesapla örneklemde uyuşuyor |
| 4 | Öneri: iş türü × ajan / model başına doğrulanmış başarı oranı, süre, maliyet; belirsizlikle birlikte | sentetik defterde bilinen en iyi seçeneği buluyor; az veride "veri yetersiz" diyor |
| 5 | Mekanik kapı: kanca uyarlamaları (önce Claude Code ve Codex) | kanıtsız "bitti" denemesi reddediliyor; atlama yolları belgeli |
| 6 | Dağıtıcı: işi seçilen ajana başsız kipte verme (`mihenk kos`) | aynı iş iki farklı ajanda koşup deftere ayrı satır düşüyor |
| 7 | Öteki araçlar: Qwen Code, OpenCode, Antigravity, Kilo Code / Cline | araç başına kurulum ve duman testi |

Sıra gerekçesi: 1 ve 2 tek başına kullanılır değer üretir; 3 ve 4 asıl ayırt edici parçadır ama 2'nin verisine muhtaçtır; 5-7 genişletmedir.

## Öneri nasıl hesaplanacak (ilk tasarım)

- **Birim:** kapanmış iş. Alanlar: iş türü, ajan, model, süre, maliyet, hüküm (geçti / kaldı / belirsiz), yeniden deneme sayısı.
- **Doğruluk:** işin kendi doğrulama komutunun ve bağımsız doğrulayıcının sonucu. Ajanın kendi "bitti" beyanı sayılmaz.
- **Öneri:** iş türü başına, başarı oranının alt güven sınırı kullanıcının eşiğini geçen seçenekler arasından beklenen maliyeti
  (yeniden denemeler dahil) en düşük olan. Süre ikinci ölçüt.
- **Soğuk başlangıç:** veri yokken öneri verilmez; fiyat listesi ve kullanıcının tercihi gösterilir.
- **Dürüstlük kuralı:** her öneri kaç işe dayandığını ve aralığını yazar.

Yanlışlama: gerçek kullanımda öneriye uyulan işlerin doğrulanmış başarı oranı, uyulmayanlardan düşük ya da maliyeti yüksek çıkarsa
öneri hesabı yanlıştır.

## Açık kararlar

1. Dil: TypeScript mi, Python mu? (öneri: TypeScript)
2. Skill'lerin dili: Türkçe mi, İngilizce mi? Araçlar ve modeller İngilizce skill metnini daha tutarlı izler; belgeler Türkçe kalabilir.
3. İlk hedef araçlar: Claude Code + Codex + Gemini CLI yeterli mi?
4. Depo hep gizli mi kalacak, yoksa olgunlaşınca açılacak mı? Lisans buna göre seçilir.
5. Önce bir hafta superpowers + CodeBurn'ü olduğu gibi deneyip sonra mı yazalım? (ARASTIRMA bölüm 4'teki karşı görüş)
