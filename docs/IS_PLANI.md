# İş planı (2026-11-19; kullanıcı onayı aynı gün, iki görüşle birlikte)

Dayanak: [ARASTIRMA.md](ARASTIRMA.md).

**Kullanıcının onayla birlikte verdiği iki görüş (bu sürüm onlara göre yeniden sıralandı):**
1. "md dosyasında yazmak onların yapılacağını garantilemiyor ... ajan orada yazılan bir şeyi yapmazsa onu yapmasını sağlayacak testler bizi
   planlara uymamızı sağlayan. yani md'ler güzel ama yeterli değil."
2. "context sıkıştırmanın otomatik yapılmaması ... ajan bir anda context'in üstünde bir iş çıktısı verebiliyor ve ajan duruyor ... toolun bu
   sayıları da dikkate alması ve gerekirse otomatik sıkıştırmayı tetiklemesi gerekiyor ... iş listesinde iş varken ajanın kendi kararlarını alıp
   devam edebilmesi de benim için çok önemli."

## Ne kuruyoruz

**mihenk:** kodlama ajanlarının bağlandığı, işi kayda alan, kanıtı kendisi denetleyen, iş listesini kesintisiz yürüten ve hangi işin hangi ajana
verileceğini ölçerek öneren ince bir katman.

Dört parça:
1. **Defter (MCP sunucusu):** her işin türü, beklentisi, yürüten ajan ve model, süresi, maliyeti ve doğrulama sonucu. Kuralları metin değil,
   defterin durum makinesi zorlar.
2. **Sürücü (dış döngü):** iş listesini sırayla ajanlara verir, bağlam bütçesini izler, oturum dolmadan devreder, liste bitene dek sürdürür.
3. **Yöntem paketi:** Agent Skills biçiminde az sayıda skill ve kısa bir AGENTS.md. Ajana ne yapacağını anlatır; uyulduğunu garanti etmez.
4. **Öneri:** defterdeki ölçülmüş sonuçlardan iş türü başına ajan / model önerisi. Kullanıcı her zaman kendi seçimini yapabilir.

## İlke 1: metin yetmez; her kuralın bir denetimi olur

Bir kural üç katmanda yaşar. Garanti alttan gelir, metinden değil.

| Katman | Ne yapar | Garanti düzeyi |
|---|---|---|
| Metin (skill, AGENTS.md) | ajan ne yapacağını bilir | yok: ajan atlayabilir |
| Araç kancası | desteklenen araçta eylemi engeller (ör. kanıtsız commit) | araca bağlı; her araçta yok |
| Defter durum makinesi | kayıt açılmadan iş başlamaz; kanıt olmadan iş kapanmaz | sunucu tarafında kesin |
| Sürücü | ajan defteri hiç çağırmasa da işi "bitti" saymaz; doğrulamayı kendisi koşar | kesin (sürücü kipinde) |

Uygulama kuralları:
- **Kanıtı ajan beyan etmez.** İş kaydında bir doğrulama komutu durur; komutu sunucu ya da sürücü çalıştırır, çıkış kodunu ve çıktının özetini
  deftere kendisi yazar. Ajanın "testler geçti" cümlesi kayda girmez.
- **Bir kural, bir denetim.** Pakete giren her kuralın karşısında onu sınayan bir denetim yazılır. Denetlenemeyen kural "öneri" etiketi taşır ve
  kural sayılmaz.
- **Uyum ölçülür.** Her işte kurallara uyulup uyulmadığı otomatik işaretlenir (kayıt düzenlemeden önce mi açıldı, doğrulama koşuldu mu, karar
  notu yazıldı mı). Ajan / model başına uyum oranı tutulur ve öneri hesabına girer.
- **Uyum testleri.** Desteklenen her araç için başsız kipte koşan küçük senaryolar ve tuzak görevler (ör. doğrulaması geçmeyen işi "bitti"
  diye kapatmaya çalışıyor mu). Araç ya da model sürümü değişince yeniden koşar. Bunlar ürünün kendi testleridir.

Sınır: MCP sunucusu ajanı kendisini çağırmaya zorlayamaz. Ajanın defteri hiç kullanmadığını ancak kanca ya da sürücü yakalar. Bu yüzden tam
garanti sürücü kipinde verilir; kullanıcının elle açtığı etkileşimli oturumda garanti, o aracın kanca desteği kadardır.

## İlke 2: işin sürekliliğini ajan değil sürücü sağlar

Ajanın bağlamı dolunca durması, işin durumu bağlamın içinde tutulduğu için sorundur. mihenk'te durum defterdedir; bağlam harcanabilir.

- **Taze oturum:** sürücü her işi seçilen ajanda başsız kipte, temiz bağlamla başlatır ve yalnız o işin kısa özetini verir. İşler tek oturuma
  sığacak boyutta kesilir.
- **Bağlam bütçesi:** sürücü ajanın bildirdiği token kullanımını izler (aracın başsız kip çıktısından; araç bildirmiyorsa tahminle). Eşik
  aşılınca adım sınırında ajana devir notu yazdırır, oturumu kapatır, yenisini bu notla açar. Otomatik sıkıştırması olan araçta iş ona
  bırakılır; olmayanda bu yol işler. Eşik başlangıçta öneridir, ölçülerek ayarlanır.
- **Sınırlı çıktı:** defter araçlarının ve doğrulama komutlarının dönüşü sınırlıdır. Uzun çıktı dosyaya yazılır; ajana özet ve dosya yolu döner.
  Böylece tek bir araç çıktısı bağlamı taşıramaz.
- **Durmadan devam:** karar gereken yerde ajan önerdiği seçeneği uygular ve karar notunu (seçenekler, seçilen, en güçlü karşı görüş) deftere
  yazar; kullanıcı sonradan veto edebilir. Yalnız şu durumlarda durur: geri alınamaz ya da dışa dönük işlem, güvenlik, kullanıcının varlığını
  isteyen adım, bütçe tavanı.
- **Uyanık tutma (kullanıcı isteği, 2026-11-19):** uzun liste koşarken bilgisayar uyursa iş durur. Sürücü isteğe bağlı bir "bilgisayarı
  uyanık tut" seçeneği sunar (varsayılan kapalı; yalnız sürücü çalışırken geçerli, bitince bırakılır). Seçenek kapalıysa ve işletim
  sisteminde uyku açıksa sürücü başlarken kullanıcıyı uyarır; README'de de yazar. İşletim sistemi yolu (Windows, macOS, Linux) kurulurken
  o sistemin kendi belgesinden doğrulanır.
- **Takılma:** oturum çökerse ya da zaman aşımına uğrarsa sürücü aynı işi son devir notundan yeniden başlatır; sınırlı sayıda denemeden sonra
  işi "takıldı" diye işaretler ve sıradakine geçer. Liste tek bir iş yüzünden durmaz.

Sınır: kullanıcının kendi açtığı etkileşimli oturumda (ör. bir CLI penceresi) bağlamı dışarıdan sıkıştıramayız. Orada yardım üç şeyle
sınırlıdır: küçük araç çıktısı, varsa aracın kancası, skill metni. Kesintisiz çalışma garantisi sürücü kipindedir.

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
| kısa karar notu ve en güçlü karşı görüş; otomatik karar, sonradan veto | her kararın uzun defter satırı |
| metin kural yerine mekanik koruma | yalnız metinle zorlanan kural |
| iki vites: keşif (hafif) ve hüküm (tam) | her işe aynı ağırlıkta tören |

## Teknik seçimler (öneri; itiraz gelmedi)

- **Dil:** TypeScript, Node 22+. Hedef araçların hepsinde Node var; `npx` ile kurulumsuz çalışır; resmî MCP kitaplığı hazır.
- **Depolama:** proje içinde tek SQLite dosyası (`.mihenk/defter.db`) ve okunur JSONL dökümü.
- **Maliyet verisi:** önce sürücünün başsız kip çıktısından okuduğu kullanım; etkileşimli oturumlar için CodeBurn ya da ccusage çıktısı.
- **Başsız kipler:** her aracın komutu ve çıktı biçimi kurulum sırasında aracın kendi belgesinden doğrulanır; ezberden yazılmaz.
- **Kapsam dışı (ilk sürüm):** vekil sunucu ile model çağrısı yönlendirme, masaüstü arayüz, bulut.

En güçlü karşı görüş: Python, istatistik ve metamorfik'teki mevcut karar kodu için daha rahat olurdu. TypeScript seçiminin gerekçesi dağıtımdır;
öneri hesabı birkaç yüz satırdır ve iki dilde de yazılır.

## Aşamalar

Her aşamanın kabul ölçütü işe başlamadan yazılıdır; aşama, ölçüt komutla gösterilince kapanır.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 0 | Depo, araştırma, bu plan | **tamam** (gizli depo, push edildi) |
| 1 | Defter çekirdeği: MCP sunucusu, durum makinesi, doğrulamayı sunucunun koşması, sınırlı çıktı | **tamam, bir açık kalemle** (2026-11-19; `npm test`: 49 test geçti). Ölçüt 1 ve 2 gösterildi. Ölçüt 3 iki bağımsız MCP istemcisiyle gösterildi; gerçek bir ajan aracıyla gösterim açık (bkz. "Aşama 1 sonucu") |
| 2 | Yöntem paketi: 6-8 skill + AGENTS.md; her kuralın denetimiyle birlikte; Claude Code, Codex, Gemini CLI | üç araçta skill'ler listeleniyor; aynı küçük görevde üçü de defteri kullanıyor |
| 3 | Sürücü: iş listesi döngüsü, taze oturum, devir notu, bağlam bütçesi, zaman aşımı, isteğe bağlı uyanık tutma; önce iki araç | on küçük işlik liste kullanıcı girişi olmadan bitiyor; yapay büyük çıktılı işte oturum devri çalışıyor; takılan iş listeyi durdurmuyor; uyku açıkken sürücü uyarıyor, uyanık tutma seçeneği açıkken sistem uykuya geçmiyor |
| 4 | Uyum testleri: senaryolar ve tuzak görevler; araç başına uyum oranı raporu | her desteklenen araç için rapor üretiliyor; kasıtlı bozuk ajan taklidi yakalanıyor |
| 5 | Maliyet ve süre: kullanım verisini işe bağlama | kapanan her işte süre ve maliyet dolu; elle hesapla örneklemde uyuşuyor |
| 6 | Öneri: iş türü × ajan / model başına doğrulanmış başarı, uyum, süre, maliyet; belirsizlikle birlikte | sentetik defterde bilinen en iyi seçeneği buluyor; az veride "veri yetersiz" diyor |
| 7 | Kanca uyarlamaları: etkileşimli oturumda mekanik kapı (önce Claude Code ve Codex) | kanıtsız "bitti" denemesi reddediliyor; atlama yolları belgeli |
| 8 | Öteki araçlar: Qwen Code, OpenCode, Antigravity, Kilo Code / Cline | araç başına kurulum, duman testi ve uyum raporu |

Sıra gerekçesi: zorlama (1) metinden (2) önce gelir, çünkü metin tek başına yetmiyor. Sürücü (3) hem kesintisiz çalışmanın hem ajanlar arası
iş dağıtımının taşıyıcısıdır. Maliyet ve öneri (5, 6) asıl ayırt edici parçadır ama 1-4'ün ürettiği veriye muhtaçtır.

## Aşama 1 sonucu (2026-11-19)

Kanıt: `npm test` (49 test, 49 geçti). Her ret kuralının karşısında en az bir test var; adında "KABUL" geçen testler ölçütlerin kendisidir.

**Açık kalem (ölçüt 3):** makinede CLI olarak kurulu ajan aracı yok (Codex, Gemini CLI, Qwen Code, OpenCode yok). Claude Code yalnız masaüstü
uygulamasının içinde; paketli ikilisi başsız kipte "Not logged in" dedi, yani ona iş açtırılamadı. Ölçüt, farklı kimlikli iki bağımsız MCP
istemci süreciyle gösterildi (`test/mcp.test.ts`). Gerçek araçla kapatmak için: araç deftere bir iş açtıktan sonra
`node dist/test/ikinci_istemci.js --kok <proje>` koşulur; defterde iki farklı istemci görürse "GECTI" yazar. Aşama 2'nin ölçütü bunu zaten ister.

**Alınan kararlar (öneri uygulandı; veto edilebilir):**

| Karar | Seçilen | En güçlü karşı görüş |
|---|---|---|
| Doğrulama komutunun güvenliği (açık karar 3) | Kabuk yok (`&&`, boru, yönlendirme reddedilir); program izin listesinden (test ve derleme araçları; `curl`, `npx`, kabuklar yok); çalışma dizini proje kökü; zaman aşımı; liste `mihenk.json` ile değişir ve sunucu başlarken bir kez okunur | Bu bir kum havuzu değil: `node x.js` her şeyi koşar ve test dosyasını ajan yazar. Liste yalnız defterin "izin sormadan komut koşturma" kapısına dönüşmesini zorlaştırır. Gerçek yalıtım kap ister; komut başına kullanıcı onayı ise İlke 2 ile çelişir |
| MCP kitaplığı | v2 paketleri (`@modelcontextprotocol/server` 2.4.0; istemci yalnız testte) | v1 (`@modelcontextprotocol/sdk`) daha yaygın ve örneği bol; v2 yeni. v2 seçildi çünkü bağımlılığı az ve eski istemcilere de yanıt veriyor |
| SQLite | Node'un gömülü `node:sqlite` modülü | Hâlâ "deneysel" etiketli, arayüzü değişebilir. `better-sqlite3` olgun ama yerel derleme ister, `npx` ile kurulumsuz çalışmayı zorlaştırır |
| Hüküm kuralı | Doğrulama kalırsa iş açık kalır (yeniden denenir). "kaldı" ve "belirsiz" gerekçe ister ve yine doğrulama koşulur; doğrulama geçerken "kaldı" verilemez | Ajan vazgeçtiği işi doğrulama koşmadan kapatmak isteyebilir; uzun doğrulamada bu süre kaybıdır. Her kapanışta ölçülmüş bir sonuç olsun diye böyle |
| Araç adları ve açıklamaları | Türkçe (ASCII) | İngilizce açıklamayı modeller daha tutarlı izleyebilir; açık karar 1 ile birlikte ölçülerek karara bağlanır |

**Bilinen sınırlar:**
- Defter doğrulamanın kalitesini ölçemez: her zaman 0 dönen bir komut kayda yazılırsa iş "geçti" olur. Bunu bağımsız doğrulayıcı ve tuzak
  görevler (Aşama 4) yakalar.
- Defter dosyası ajanın erişebildiği yerde durur; SQLite dosyasını doğrudan değiştiren bir ajanı tetikleyiciler durdurur ama tetikleyiciyi
  silen bir ajanı durdurmaz. Kurcalamaya karşı iz (ör. özet zinciri) yok.
- Doğrulama komutu kullanıcının haklarıyla koşar.

## Öneri nasıl hesaplanacak (ilk tasarım)

- **Birim:** kapanmış iş. Alanlar: iş türü, ajan, model, süre, maliyet, hüküm (geçti / kaldı / belirsiz), yeniden deneme sayısı, uyum işaretleri.
- **Doğruluk:** işin kendi doğrulama komutunun ve bağımsız doğrulayıcının sonucu. Ajanın kendi "bitti" beyanı sayılmaz.
- **Öneri:** iş türü başına, başarı oranının alt güven sınırı kullanıcının eşiğini geçen seçenekler arasından beklenen maliyeti
  (yeniden denemeler ve oturum devirleri dahil) en düşük olan. Süre ikinci ölçüt.
- **Soğuk başlangıç:** veri yokken öneri verilmez; fiyat listesi ve kullanıcının tercihi gösterilir.
- **Dürüstlük kuralı:** her öneri kaç işe dayandığını ve aralığını yazar.

Yanlışlama: gerçek kullanımda öneriye uyulan işlerin doğrulanmış başarı oranı, uyulmayanlardan düşük ya da maliyeti yüksek çıkarsa
öneri hesabı yanlıştır.

## Açık kararlar

1. Skill'lerin dili: Türkçe mi, İngilizce mi? Araçlar ve modeller İngilizce skill metnini daha tutarlı izler; belgeler Türkçe kalabilir.
2. Depo hep gizli mi kalacak, yoksa olgunlaşınca açılacak mı? Lisans buna göre seçilir.
3. ~~Doğrulama komutunu sunucunun çalıştırması~~: Aşama 1'de karara bağlandı (kabuksuz çalıştırma ve izin listesi; bkz. "Aşama 1 sonucu").
   Kullanıcı veto edebilir.
