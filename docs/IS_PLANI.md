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

## İlke 3: kodlama bilmeyen kullanıcı için kolay; yönetici izni istemez (kullanıcı isteği, 2026-11-20)

Kullanıcının sözü: "program kodlamayı bilmeyen birisi için de kolayca kullanılacak bir program olmalı, mümkünse admin isteği olmamalı."

- **Yönetici izni yok:** kurulum ve çalışma yalnız kullanıcının kendi klasörlerine yazar; küresel ayar, sistem servisi, sürücü kurulmaz.
  Denetimi: `test/kur.test.ts` "kur: yalniz hedef projenin icine yazar". Bugün gereken tek ön koşul Node.js'tir (kullanıcı düzeyinde kurulur).
- **Tek adım:** kullanıcının yapacağı iş bir komut ya da bir çift tıklamadır; ayar dosyası elle düzenletilmez. Bugün kurulum bir komut
  satırı komutudur; çift tıklanır kurulum ve sürücünün tek adımda başlaması Aşama 3'ün ölçütüne yazıldı.
- **Düz dil:** programın kullanıcıya yazdığı her ileti kısa ve Türkçedir; ne olduğunu ve sıradaki adımı söyler.
- Sınır: ajan araçlarının kendisini (Claude Code, Codex, Antigravity) kurmak ve onlarda oturum açmak kullanıcının işidir.
- **Yalnız yerelde çalışma (kullanıcı isteği, 2026-11-20):** "bir kullanıcı sadece yerelde çalışacaksa commit olayında yerel bir yöntem
  de olabilmeli." mihenk uzak depo (GitHub vb.) varsaymaz. İşin kaydı zaten yereldedir (defter). Değişikliklerin saklanması üç kipten
  biriyle olur ve kullanıcı seçer: **yok** (yalnız defter), **yerel** (yalnız bu bilgisayarda commit; uzak depo gerekmez),
  **yerel + gönder** (commit ve push). Varsayılan "yerel"dir; hiçbir kip kullanıcı açmadan push yapmaz. Bugün kodda commit yapan bir
  parça yok (skill'ler ve defter commit istemez); kipleri sürücü uygular, bu yüzden Aşama 3'ün kapsamına ve ölçütüne yazıldı.
  Yorum notu: "yerel yöntem"i "uzak depo olmadan, bu bilgisayarda saklama" diye anladım; git hiç kurulu olmayan kullanıcı için "yok"
  kipi yeter mi, yoksa git'siz bir yedekleme mi isteniyor, sürücü yazılırken kullanıcıya sorulacak.

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

Her aşamanın kanıtı ve olumsuz notları: [SONUCLAR.md](SONUCLAR.md).

Her aşamanın kabul ölçütü işe başlamadan yazılıdır; aşama, ölçüt komutla gösterilince kapanır.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 0 | Depo, araştırma, bu plan | **tamam** (gizli depo, push edildi) |
| 1 | Defter çekirdeği: MCP sunucusu, durum makinesi, doğrulamayı sunucunun koşması, sınırlı çıktı | **tamam** (2026-11-20). Ölçüt 1 ve 2 testle gösterildi. Ölçüt 3 gerçek araçla gösterildi: Claude Code 2.1.326 ve bağımsız test istemcisi aynı deftere iş açtı (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 1 sonucu") |
| 2 | Yöntem paketi: 6-8 skill + AGENTS.md; her kuralın denetimiyle birlikte; Claude Code, Codex, Gemini CLI | **tamam, bir notla** (2026-11-20). Aynı küçük görevde Claude Code, Codex CLI ve OpenCode defteri kullandı (üçünde betik hükmü GEÇTİ); Antigravity 4 ölçütten 3'ünü sağladı. Not: skill listesi Claude Code'da tam, Codex ve OpenCode'da dolaylı gösterildi (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 2"). Gemini CLI yerine OpenCode denendi: Gemini CLI ücretsiz katmanda kaldırılmış |
| 3 | Sürücü: iş listesi döngüsü, taze oturum, devir notu, bağlam bütçesi, zaman aşımı, isteğe bağlı uyanık tutma, saklama kipi (yok / yerel / yerel + gönder); önce iki araç | **tamam, iki açık kalemle** (2026-11-20; `npm test`: 84 test geçti; gerçek araçlarla on işlik liste 10/10). Açık: uyanık tutmanın uykuyu gerçekten önlediği gözlenmedi; oturum devri yalnız sahte ajanla gösterildi (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 3 sonucu"). Ölçüt: on küçük işlik liste kullanıcı girişi olmadan bitiyor; yapay büyük çıktılı işte oturum devri çalışıyor; takılan iş listeyi durdurmuyor; uyku açıkken sürücü uyarıyor, uyanık tutma seçeneği açıkken sistem uykuya geçmiyor; kurulum ve sürücü tek adımda (çift tıklama ya da tek komut) başlıyor, yönetici izni istemiyor; uzak deposu olmayan bir projede liste "yerel" kipte bitiyor ve hiçbir kipte kullanıcı açmadan push yapılmıyor; ajan yalnız kendisine verilen proje dizininde çalışıyor (başka dizinde değişiklik yaparsa iş geçersiz sayılıyor) |
| 4 | Uyum testleri: senaryolar ve tuzak görevler; araç başına uyum oranı raporu | **tamam** (2026-11-20; `npm test`: 94 test geçti). Claude Code, Codex ve OpenCode için rapor üretildi; sekiz bozuk ajan taklidinin hepsi bozduğu yerden yakalandı (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 4 sonucu"). Ölçüt: her desteklenen araç için rapor üretiliyor; kasıtlı bozuk ajan taklidi yakalanıyor |
| 5 | Maliyet ve süre: kullanım verisini işe bağlama | **tamam, bir notla** (2026-11-20; `npm test`: 101 test geçti). Sürücü kipinde kapanan her işte süre ve token dolu; dolar maliyeti araç bildirirse dolu, Codex'te "bilinmiyor" (abonelik, fiyat uydurulmaz). Bağımsız yeniden hesap üç araçta her alanda uyuştu (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 5 sonucu"). Ölçüt: kapanan her işte süre ve maliyet dolu; elle hesapla örneklemde uyuşuyor |
| 6 | Öneri: iş türü × ajan / model başına doğrulanmış başarı, uyum, süre, maliyet; belirsizlikle birlikte | **tamam** (2026-11-20; `npm test`: 109 test geçti). `mihenk oneri`; sentetik defterlerde (biri elle, 50'si rastgele) bilinen en iyi seçenek bulundu; az veride "veri yetersiz". Gerçek veri henüz öneri için az (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 6 sonucu"). Ölçüt: sentetik defterde bilinen en iyi seçeneği buluyor; az veride "veri yetersiz" diyor |
| 7 | Kanca uyarlamaları: etkileşimli oturumda mekanik kapı (önce Claude Code ve Codex) | **tamam** (2026-11-20; `npm test`: 121 test geçti). Gerçek Claude Code ve Codex oturumlarında kanıtsız bitirme ve commit reddedildi; atlama yolları aşağıda (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 7 sonucu"). Ölçüt: kanıtsız "bitti" denemesi reddediliyor; atlama yolları belgeli |
| 8 | Öteki araçlar: Qwen Code, OpenCode, Antigravity, Kilo Code / Cline; **temiz kaldırma** (`mihenk kaldir`) | **tamam, üç araç açık** (2026-11-20; `npm test`: 135 test geçti). Temiz kaldırma ölçütü sağlandı. Kilo Code tam denendi; Cline ve Qwen Code kuruluyor ama gerçek araçla denenmedi (oturum / ücretli hesap gerekiyor); Antigravity'de komut satırı yok (bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 8 sonucu"). Ölçüt: araç başına kurulum, duman testi ve uyum raporu; kaldırma ölçütü aşağıda ("Temiz kaldırma") |

**Sürüm 0.1 = Aşama 1-8.** Aşama 8 kapanınca sürüm 0.1 etiketlenir (`v0.1.0`; etiket yalnız yerelde ve bu gizli depoda). Sonraki
özellikler sürüm 0.2 olarak aşağıdaki "Sürüm 0.2" tablosundadır.

### Temiz kaldırma (sürüm 0.1'in parçası)

Kullanıcı mihenk'i denedikten sonra vazgeçerse hiçbir şey kaybetmemeli; kaldırma, kurulumun yaptığını eksiksiz ve yalnız onu geri almalı.

- `mihenk kur` yaptığı her değişikliği bir kurulum kaydına yazar (`.mihenk/kurulum.json`): kendi oluşturduğu dosyalar (içerik özetiyle),
  var olan dosyaya eklediği bloklar (AGENTS.md, `.codex/config.toml`), JSON dosyalarına eklediği anahtarlar ve kancalar, `.gitignore` satırı.
- `mihenk kaldir` (Windows'ta çift tıklanır `mihenk-kaldir.cmd` da) bu kaydı tersine işler. Kurulumdan sonra kullanıcının değiştirdiği
  dosyaya dokunmaz, yalnız mihenk'in bloğunu çıkarır; kullanıcının kendi kanca ve ayarlarını korur. Ne yaptığını tek tek yazar.
- Defter (`.mihenk/`) kullanıcının iş kaydıdır: varsayılan olarak yerinde bırakılır ve bu söylenir; `--defter-dahil` ile o da silinir.
- **Ölçüt:** önceden AGENTS.md, CLAUDE.md, `.claude/settings.json` (kendi kancasıyla), `.codex/config.toml` ve `.gitignore` bulunan
  örnek projelerde `kur` ardından `kaldir` sonrası her dosya bayt bayt kurulum öncesiyle aynı (git'siz projede de); kurulumdan sonra
  kullanıcının eklediği satırlar korunuyor; kaldırma sonrası yeniden kurulum çalışıyor; kaldırma ikinci kez koşunca hiçbir şey değiştirmiyor.
- Karar: kaldırma 0.1'e alındı (0.2 değil). Karşı görüş: 0.1'in kapsamı büyür. Gerekçe: geri dönüş yolu olmayan bir kurulum İlke 3'e
  aykırı ve kullanıcının denemeye cesaret etmesinin ön koşulu; iş küçüktür, çünkü kurulum zaten işaretli bloklarla yazıyor.

Sıra gerekçesi: zorlama (1) metinden (2) önce gelir, çünkü metin tek başına yetmiyor. Sürücü (3) hem kesintisiz çalışmanın hem ajanlar arası
iş dağıtımının taşıyıcısıdır. Maliyet ve öneri (5, 6) asıl ayırt edici parçadır ama 1-4'ün ürettiği veriye muhtaçtır.

## Sürüm 0.2 (taslak; 0.1 bitince sırası yeniden gözden geçirilir)

Kaynak: benzer araçların ve kullanıcı şikâyetlerinin taraması, 2026-11-20 ([ARASTIRMA.md](ARASTIRMA.md) "Sürüm 0.2 için tarama").
Sıra ölçütü: önce işin doğruluğu, sonra kullanıcı deneyiminin basitliği, sonra maliyet.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 9 | **tamam** (2026-11-20; `npm test`: 144 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 9 sonucu"). **Aç-kapa ayarları:** her özellik tek bir anahtarla açılıp kapanır (kapı, araç başına kancalar, skiller, sürücünün saklama kipi, uyanık tutma, bildirim, sonraki aşamaların bekçileri). Ayar `mihenk.json`'da durur; kodlama bilmeyen kullanıcı için çift tıklanan `mihenk-ayarlar.cmd` numaralı bir menü gösterir (aç / kapa, ne işe yaradığı tek cümle). Kurulumun her oturuma eklediği bağlam yükü (token) gösterilir | her anahtar için: kapalıyken etkisi yok, açıkken var (anahtar başına test); aç-kapa-aç dosyaları bayt bayt aynı bırakıyor; menü yönetici izni istemiyor |
| 10 | **tamam** (2026-11-20; `npm test`: 152 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 10 sonucu"). **Doğruluk bekçileri:** (a) test kurcalama: iş sırasında test dosyası, beklenen çıktı değiştiyse ya da `skip` eklendiyse hüküm "şüpheli" notu taşır; (b) boş kanıt: doğrulama komutu iş başlamadan zaten geçiyorsa kayıtta not; (c) kararsız test: geçen doğrulama bir kez daha koşulur, sonuç değişirse "belirsiz (kararsız)" | her bekçi için kasıtlı bozuk ajan taklidi yakalanıyor; uyumlu taklit takılmıyor |
| 11 | **tamam, bir sınırla** (2026-11-20; `npm test`: 156 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 11 sonucu"). **Gerileme tabanı:** listenin başında projenin bütün test takımı bir kez koşulur; iş kapanırken önceden geçen bir şey kalırsa hüküm "geçti" olmaz | taklit bir ajanın kendi testini geçirip başka testi bozduğu iş "geçti" kapanmıyor |
| 12 | **tamam** (2026-11-20; `npm test`: 162 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 12 sonucu"). **Gözetimsiz koşu emniyeti:** liste / iş başına dolar ve süre tavanı; aynı hatayı tekrarlayan denemeyi erken kesme; abonelik limitine takılınca güvenli duraklama ve sonra kaldığı yerden sürme; yıkıcı komut bekçisi (`rm -rf`, `git reset --hard`, `push --force`, proje dışına yazma) kancaya eklenir | tavan aşılınca iş "bütçe" gerekçesiyle kapanıyor ve liste duruyor; döngü taklidi erken kesiliyor; yıkıcı komut taklidi reddediliyor |
| 13 | **tamam** (2026-11-20; `npm test`: 167 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 13 sonucu"). **İş başına geri alma:** her işin başında bir geri dönüş noktası (git varsa geçici dal / stash, yoksa gölge kopya); `mihenk geri-al <iş>` o işin değişikliklerini geri alır | "kaldı" kapanan işin değişiklikleri tek komutla geri alınıyor; başka işlerin değişikliklerine dokunulmuyor; git'siz projede de çalışıyor |
| 14 | **tamam, bir notla** (2026-11-20; `npm test`: 177 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 14 sonucu"). **Kullanıcıya ulaşan yüz:** liste bitince ya da durunca Windows bildirimi; çift tıklanan tek sayfalık düz dil raporu (ne yapıldı, ne kaldı ve neden, süre, maliyet) | bildirim yönetici izni istemeden çıkıyor; rapor kodlama terimi bilmeyen birinin okuyacağı dilde ve defterle sayıca uyuşuyor |
| 15 | **tamam, iki sınırla** (2026-11-20; `npm test`: 183 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 15 sonucu"). **İngilizce dil desteği:** kullanıcıya görünen bütün iletiler (komut satırı, menü, sürücü, kapı ve kaldırma çıktıları, rapor) Türkçe ve İngilizce; dil `mihenk.json`'da `dil` ayarıyla seçilir (varsayılan: sistemin dili, bulunamazsa Türkçe). Belgeler (README, AGENTS.md bloğu) iki dilde. Ajana giden skill metinleri zaten İngilizce | her ileti iki dilde var (eksik çeviriyi bulan test); dil değişince aynı komutun çıktısı o dilde; kod tanımlayıcıları ASCII kalıyor |
| 16 | **tamam** (2026-11-20; `npm test`: 190 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 16 sonucu"). **Uygulama penceresi:** kodlama bilmeyen kullanıcı için tek pencere, sekmeli: Proje (kurulum, kaldırma, durum), İş listesi (işleri ekle / düzenle / başlat, canlı ilerleme), Defter (geçmiş işler, kanıtlar, şüpheler, geri al), Ayarlar (bütün aç-kapa anahtarları, tavanlar), Öneri ve maliyet. Yönetici izni yok, kurulum yok: çift tıklanan dosya yerel bir sunucu açar ve pencereyi tarayıcıda gösterir (yalnız bu bilgisayardan erişilir) | CLI'de yapılabilen her yönetim işi ve her ayar pencereden de yapılabiliyor (eşleme tablosu ve test); her ayarın altında bilgi notu: amacı, sonuçları ve varsayılan değerin ne yaptığı (`AyarTanimi.amac / sonuc / varsayilan_aciklama`); notlar bir onay kutusuyla gizlenebiliyor, kutu varsayılan açık (`bilgi_notlari`); pencere yalnız 127.0.0.1'e bağlanıyor; uçtan uca tarayıcı testinde bir ayar değiştirilip sonucu dosyada görülüyor; iki dilde |

**Karar (Aşama 16):** pencere, yerel sunucu + tarayıcı sayfası olarak yapılacak. Karşı görüş: gerçek bir masaüstü uygulaması (Electron,
Tauri) daha tanıdık görünür; ama yükleme gerektirir, boyutu büyüktür ve imzasız uygulama Windows'ta uyarı verir. Tarayıcı sayfası Node
dışında hiçbir şey istemez. Tepsi uygulaması (0.3 adayı) bu pencereyle büyük ölçüde karşılandığı için listeden çıkarıldı.

## Sürüm 0.3 (taslak, 2026-11-20)

Kaynak: superpowers ve CodeBurn depolarının README, sürüm notları, belgeleri ve en çok tepki alan issue'ları ([ARASTIRMA.md](ARASTIRMA.md)
"Sürüm 0.3 için tarama"). Sıra ölçütü yine: doğruluk, kolaylık, maliyet.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 17 | **tamam** (2026-11-20; `npm test`: 198 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 17 sonucu"). **Kurulum sağlamlığı:** kanca komutu `node`'u mutlak yolla çağırır (proje köküne konan sahte `node.cmd` çalışmaz; superpowers'ta benzer bir açık çıktı); her `SKILL.md` boyut sınırının altında (Claude Code sıkıştırmada uzun skill'i kesiyor) | proje köküne konan `node.cmd` / `node.bat` kanca koşunca çalışmıyor (işaret dosyası oluşmuyor); `PATH`'te node yokken kanca yine çalışıyor; 20.000 baytı aşan skill testi kaldırıyor; kaldırma sonrası bayt bayt eşitlik korunuyor |
| 18 | **tamam** (2026-11-20; `npm test`: 199 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 18 sonucu"). **Geri almada önizleme ve onay** (pencerede bugün tek tık): önce hangi dosyaların geri alınacağı gösterilir, sonra onaylanır | onaysız `/api/geri-al` 400 veriyor ve dosya değişmiyor; önizleme listesi `--deneme` çıktısıyla aynı; tarayıcıda denendi |
| 19 | **tamam** (2026-11-20; `npm test`: 204 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 19 sonucu"). **Doktor ve hata paketi:** `mihenk doktor` ve pencerede "Durum": Node sürümü, bulunan araçlar, MCP kaydı okunuyor mu, kancanın son çalışması, Codex kanca onayı, uyku; her satırda TAMAM ya da SORUN ve ne yapılacağı. Kişisel yol ve anahtarları temizlenmiş tek dosyalık hata paketi | kasıtlı bozulan dört kurulum (MCP kaydı silinmiş, kanca silinmiş, ajan yok, eski Node) doğru satırda SORUN veriyor; temiz kurulumda hepsi TAMAM; komut dosya yazmıyor; pakette ev dizini yolu ve gizli anahtar deseni yok |
| 20 | **tamam** (2026-11-20; `npm test`: 208 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 20 sonucu"). **Başlatmadan önce liste denetimi ("yapıcı denetimi"):** her işte eksik alan, izinsiz program, projede tanımlı olmayan betik (ör. `npm test` yok) için anlaşılır uyarı; pencerede ve komut satırında | tanımsız betik ve izinsiz program içeren liste başlamadan iş başına uyarı veriyor; temiz liste uyarısız |
| 21 | **tamam** (2026-11-20; `npm test`: 210 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 21 sonucu"). **Öneride geri alma sinyali:** sonradan geri alınan "geçti" işi öneri hesabında başarı sayılmaz; rapor onu "geri alındı" gösterir | sentetik defterde geri alınan işin seçeneğinin başarı oranı düşüyor, öteki işler etkilenmiyor |
| 22 | **tamam, bir notla** (2026-11-20; `npm test`: 214 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 22 sonucu"). **Elle açılan oturumda döngü bekçisi (Claude Code, Codex):** aynı araç çağrısı ya da aynı başarısız komut tekrarlanınca önce uyarır, sonra durdurur; tek oturumluk izin | taklit kanca girdisiyle eşikte uyarı, sonra ret; farklı çağrı sayacı sıfırlıyor; anahtar kapalıyken etkisiz; bekçi kendisi bozulursa geçit verip kaydediyor |
| 23 | **tamam, plandan sapmayla** (2026-11-20; `npm test`: 217 test geçti; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 23 sonucu"). **Elle açılan oturumların maliyeti** (Aşama 5'ten açık): CodeBurn ya da ccusage çıktısı zaman aralığıyla işe bağlanır; README'ye kullanıcı sorularıyla "Sorular" bölümü | kayıtlı CodeBurn çıktısı örneğinde iş aralığına düşen maliyet elle hesapla uyuşuyor; araç yoksa "bilinmiyor"; her soru bir komuta ya da sekmeye bağlı |

**Karar (kullanıcı, 2026-11-20):** `gerileme` varsayılanı `liste_sonunda` oldu (superpowers bulgusu: görev tek test dosyası
adlandırınca ajanlar yandaki bozuk testi görmüyor). Kullanıcının ek isteği uygulandı: sürücü bütün testlere harcanan süreyi ölçer; bu
süre en az 2 dakika ve listenin en az %25'iyse liste sonunda rakamla öneri yazar ("Yalnız göndermeden önce" kipine geçilebileceğini).
Kanıt: `test/gerileme.test.ts` (pahalı takımda öneri çıkıyor, eşiğin altında çıkmıyor); `npm test` 193/193. Kullanıcı sürüm 0.3'ün
bütün aşamalarını onayladı.

**Bilerek dışarıda:** telemetri; tepsi uygulaması (pencere karşılıyor); canlı kota okuma (aracın kimlik bilgisini okumak gerekir);
kullanıcının küresel ayarını değiştiren otomatik "iyileştirme"; ayrıntılı soru-cevap akışları (superpowers'ın en çok şikâyet aldığı
yer); otomatik düzeltmeye bağlı inceleyici; araç sayısını büyütmek (önce Cline ve Qwen gerçek araçla denenmeli); eklenti pazarı (depo gizli).

Sonraya bırakılanlar (0.3 adayları, ilk taslak): ajanın yazdığı testlere mutasyon denetimi (değerli ama dile bağlı ve büyük); yalnız not yazan
bağımsız inceleyici ajan (incelemeyi otomatik düzeltmeye bağlamanın doğru kodu bozabildiğine dair kanıt var; hükmü etkilememeli);
iş listesinde bağımlılık ve büyük işin bölünmesi (doğrudan kullanıcı
talebi bulunamadı); elle açılan oturumların maliyetinin ölçülmesi (CodeBurn / ccusage bağlantısı; Aşama 5'ten açık).

## Sürüm 0.4: internetsiz ortam ve OpenCode (kullanıcı isteği, 2026-11-20)

Hedef ortam: internet yok; Qwen, DeepSeek gibi açık modeller kurum içinde OpenAI uyumlu API ile çalışıyor; kullanıcılar genelde
OpenCode kullanıyor. İstenen üç özellik: (1) internet bağımlılığı olmaması: gereken her uygulama ve kütüphane paketin içinde olmalı;
(2) kurulumun ve çalışmanın yönetici izni istememesi; (3) OpenCode ile doğru uyum.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 24 | **tamam** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 24 sonucu"). **Çevrimdışı paket:** `npm run paketle` → tek zip; içinde taşınabilir Node.js, derlenmiş mihenk, yalnız üretim bağımlılıkları, çift tıklanan `Projeye-kur.cmd` ve `KURULUM.txt` | zip başka bir klasöre açılınca, PATH'te Node yokken kurulum, doktor ve MCP sunucusu (beş araç) çalışıyor; kurulumun yazdığı ayar paketin `node.exe`'sini çağırıyor; kodda internete giden çağrı yok; geliştirme araçları pakete girmiyor |
| 25 | **tamam, bir notla** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 25 sonucu"). **OpenCode ve yerel model:** kayıt OpenCode'un sürümüne göre yazılıyor; mihenk araçları modele doğrudan gidiyor; kullanıcının sağlayıcı ayarı korunuyor | internet kesik ve sahte yerel OpenAI uyumlu sunucuyla gerçek OpenCode: istekler yalnız yerel sunucuya gidiyor, beş mihenk aracı isteğe doğrudan araç olarak giriyor, modelin `mihenk_is_ac` çağrısı deftere kayıt açıyor; kullanıcının `provider`, `model` ve öteki MCP kayıtları kurulumdan sonra aynı |

## Sürüm 0.5: önerinin üç yapısal sorunu (kullanıcı bulgusu, 2026-11-20)

Bulgular: (1) zorluk hesaba girmiyor, kolay işleri alan ajan iyi görünüyor; (2) abonelikle çalışan araçta dolar maliyeti "bilinmiyor"
çıkıyor, oysa kullanıcının gerçek maliyeti kota; (3) keşif yok, hep aynı ajan kullanılırsa ötekiler hakkında veri birikmiyor. Ek istek:
aşama sonuçları plandan ayrı dosyaya taşınsın.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 26 | **tamam** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 26 sonucu"). **Sonuçlar ayrı dosyada:** aşama sonuçları `docs/SONUCLAR.md`'ye taşınır; planda yalnız ilkeler, aşama tabloları, öneri tasarımı ve açık kararlar kalır | taşımadan önceki ve sonraki toplam metin aynı (satır satır, başlıklar dahil); planda "sonucu" başlığı kalmıyor; bütün iç bağlantılar yeni dosyayı gösteriyor |
| 27 | **tamam** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 27 sonucu"). **Kota payı:** her oturumun ağırlıklı token tüketimi ("kota birimi"); abonelikli ajan için `mihenk.json` `kota` bölümü (pencere süresi, isteğe bağlı kapasite ve pencere değeri); kapasite verilmemişse sürücünün gördüğü kota hatalarından alt sınır tahmini; öneri abonelikli ajanı kota payıyla, karşılaştırılabildiğinde dolara çevirerek değerlendirir | sentetik defterde: abonelikli ajanın işi "maliyet bilinmiyor" yerine kota payı gösteriyor; pencere değeri verilince dolarlı ajanla karşılaştırılıp ucuz olan seçiliyor; verilmeyince "karşılaştırılamadı" notu ve başarıya göre seçim; kota hatası anındaki pencere tüketiminden kapasite tahmini elle hesapla aynı |
| 28 | **tamam** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 28 sonucu"). **Zorluk düzeltmesi:** işe isteğe bağlı `zorluk` (kolay, orta, zor; iş listesinde ve `is_ac`'ta); öneri başarı oranını iş türünün ortak zorluk dağılımına göre ağırlıklandırır (boş katmanlar türün genel oranına çekilerek) ve her seçeneğin zorluk karışımını gösterir | sentetik defterde kolay işleri alan ama zor işte zayıf ajan, ham oranda önde iken düzeltilmiş oranda geride kalıyor; zorluk yazılmamış defterde sonuç eskisiyle aynı |
| 29 | **tamam** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 29 sonucu"). **Keşif:** öneri, veri az olan kurulu ajanları "keşif önerisi" olarak yazar; sürücüde `"ajan": "oneri"` seçilince iş türü başına önerilen ajan kullanılır ve `kesif_orani` (varsayılan %20; 0 kapatır) kadar iş, verisi en az olan kurulu ajana gider | sahte ajanlarla 10 işlik listede 2 iş verisi en az ajana gidiyor; `kesif_orani` 0 iken hiçbiri gitmiyor; seçim belirlenimci (aynı defter, aynı sıra) ve rapor her işin neden o ajana gittiğini yazıyor |

**Kararlar ve karşı görüşleri:**

- **Kota birimi.** Ağırlıklar girdi 1, çıktı 5, önbellekten okuma 0,1, önbelleğe yazma 1,25. Bunlar Anthropic fiyat oranlarıdır.
  - Karşı görüş: sağlayıcıların kota hesabı açık değil, ağırlıklar yaklaşık.
  - Gerekçe: canlı kotayı okumak kimlik bilgisi ister ve bu dışarıda bırakıldı.
- **Kapasite tahmini alt sınırdır.** Yalnız bu projedeki tüketim sayılır; aynı hesaptan başka yerde harcanan kota görünmez. Rapor
  bunu açıkça yazar.
- **Zorluk etiketi.** Etiket kullanıcının (listedeki değer önceliklidir) ya da ajanın beyanıdır.
  - Karşı görüş: madde tepki kuramı (IRT) gibi ölçülen bir zorluk daha doğrudur, ama aynı işin birden çok ajanla koşulmasını ister.
  - Gerekçe: etiketsiz defterde hesap değişmez.
- **Keşif belirlenimci ("her beşinci iş").** Karşı görüş: Thompson örneklemesi gibi rastgele yöntemler kuramsal olarak daha iyidir.
  Gerekçe: belirlenimci seçim tekrarlanabilir, sınanabilir ve kullanıcıya açıklanabilir.

## Sürüm 0.6: kullanıcı dosya ve komut satırıyla uğraşmaz (kullanıcı isteği, 2026-11-20)

Kullanıcı kodlama bilmiyor. İstenen: tek bir dosyaya çift tıklayarak başlamak; proje klasörünü gerekirse klasör seçiciyle seçmek; her
ayarı pencereden yapmak; yalnız işleri girip takip etmek. `npm install`, JSON düzenleme ve komut satırı son kullanıcıya hiç
gösterilmez.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 30 | **tamam** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 30 sonucu"). **Her ayar pencerede.** Pencerede yeni bölümler: "Liste ayarları" (dolar ve süre tavanları, kota beklemesi, projenin bütün testleri, deneme sayısı, oturum süresi, bağlam eşiği, liste için saklama ve uyanık tutma), iş başına ajan ve zaman aşımı, "Gelişmiş" (izin verilen programlar, abonelik kotası, fiyatlar, doğrulama süreleri), öneri eşikleri. Liste uyarısındaki izinsiz program için "izin ver" düğmesi. Uyum raporu pencerede de okunur; sürücünün ajan seçim notu raporda görünür | eşleşme testi: komut satırının her seçeneği, `mihenk.json`'un her alanı, iş listesinin her alanı ve işin her alanı için penceredeki karşılık yazılı ve sayfada bulunuyor (yoksa nedeni yazılı); her yeni bölüm okunup yazılıyor ve dosyanın öteki alanları korunuyor; uyum raporu varken pencere ve komut satırı aynı öneriyi veriyor |
| 31 | **tamam, bir notla** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 31 sonucu"). **Tek tıkla başlangıç.** Pakette tek giriş dosyası `Mihenk-Ac.cmd`: pencereyi proje seçmeden açar. Başlangıç ekranında son projeler, "Klasör seç" (Windows'un kendi klasör seçicisi) ya da yolu yapıştırma; kurulu değilse "Kur ve aç". Pencere açıkken proje değiştirilebilir; tarayıcı kapanınca ve liste çalışmıyorsa sunucu kendiliğinden kapanır; isteğe bağlı masaüstü kısayolu | paket başka klasöre açılıp `Mihenk-Ac.cmd` ile başlatılınca (PATH'te Node yok) başlangıç ekranı geliyor; seçilen boş klasöre kurup proje ekranına geçiyor; son projeler listesi kalıcı; liste çalışırken proje değişmiyor; nabız kesilince sunucu kapanıyor, liste çalışırken kapanmıyor; tarayıcıda baştan sona denendi |

| 32 | **tamam, plandan sapmayla** (2026-11-20; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 32 sonucu"). **Fikirden iş listesine.** Hedef (kullanıcı, 2026-11-20): günlük kullanıcının fikrini uygulamaya ya da yazılıma çevirdiği bir arayüz. Kullanıcı yalnız fikrini düz dille yazar; doğrulama komutu yazmaz. (a) "Fikir" kutusu: kurulu bir ajan fikri küçük işlere böler; her iş düz dille gösterilir (ne yapılacak, bitince ne görülecek), kullanıcı onaylar, düzeltir ya da siler. (b) Komutsuz iş iki adımda yürür: önce ajan işin kabul testini yazar ve bu test işe başlamadan kalmalıdır; mihenk o testi işin doğrulama komutu olarak kaydeder ve test dosyasını korumaya alır; sonra ajan işi yapar ve test geçince iş biter. (c) Pencerede iş takibi düz dille: ne yapılıyor, ne bitti, ne takıldı ve neden | fikirden üretilen listede her işin doğrulama komutu dolu ve liste denetiminden uyarısız geçiyor; komutsuz işte önce yazılan test iş başlamadan kalıyor; ajan testi değiştirirse "geçti" şüpheli işaretleniyor; sahte ajanla fikirden bitmiş işe kadar uçtan uca akış; kullanıcının gördüğü hiçbir ekranda komut yazmak zorunlu değil |

**Kararlar:**

- **Konsol penceresi.** Sunucu küçültülmüş bir konsolda çalışır ve tarayıcı kapanınca kendiliğinden kapanır.
  - Karşı görüş: gizli çalıştırmak (VBScript ile) daha temiz görünür.
  - Gerekçe: gizli bir süreci kullanıcı göremez ve durduramaz.
- **Son projeler.** Liste kullanıcının kendi uygulama verisinde tutulur (`%LOCALAPPDATA%\mihenk`). Burası mihenk'in kendi dosyasıdır;
  hiçbir aracın küresel ayarına dokunulmaz.

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
3. ~~Doğrulama komutunu sunucunun çalıştırması~~: Aşama 1'de karara bağlandı (kabuksuz çalıştırma ve izin listesi; bkz. [SONUCLAR.md](SONUCLAR.md) "Aşama 1 sonucu").
   Kullanıcı veto edebilir.
