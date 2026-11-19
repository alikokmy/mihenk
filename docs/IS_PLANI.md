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

Her aşamanın kabul ölçütü işe başlamadan yazılıdır; aşama, ölçüt komutla gösterilince kapanır.

| Aşama | İş | Kabul ölçütü |
|---|---|---|
| 0 | Depo, araştırma, bu plan | **tamam** (gizli depo, push edildi) |
| 1 | Defter çekirdeği: MCP sunucusu, durum makinesi, doğrulamayı sunucunun koşması, sınırlı çıktı | **tamam** (2026-11-20). Ölçüt 1 ve 2 testle gösterildi. Ölçüt 3 gerçek araçla gösterildi: Claude Code 2.1.326 ve bağımsız test istemcisi aynı deftere iş açtı (bkz. "Aşama 1 sonucu") |
| 2 | Yöntem paketi: 6-8 skill + AGENTS.md; her kuralın denetimiyle birlikte; Claude Code, Codex, Gemini CLI | **tamam, bir notla** (2026-11-20). Aynı küçük görevde Claude Code, Codex CLI ve OpenCode defteri kullandı (üçünde betik hükmü GEÇTİ); Antigravity 4 ölçütten 3'ünü sağladı. Not: skill listesi Claude Code'da tam, Codex ve OpenCode'da dolaylı gösterildi (bkz. "Aşama 2"). Gemini CLI yerine OpenCode denendi: Gemini CLI ücretsiz katmanda kaldırılmış |
| 3 | Sürücü: iş listesi döngüsü, taze oturum, devir notu, bağlam bütçesi, zaman aşımı, isteğe bağlı uyanık tutma, saklama kipi (yok / yerel / yerel + gönder); önce iki araç | **tamam, iki açık kalemle** (2026-11-20; `npm test`: 84 test geçti; gerçek araçlarla on işlik liste 10/10). Açık: uyanık tutmanın uykuyu gerçekten önlediği gözlenmedi; oturum devri yalnız sahte ajanla gösterildi (bkz. "Aşama 3 sonucu"). Ölçüt: on küçük işlik liste kullanıcı girişi olmadan bitiyor; yapay büyük çıktılı işte oturum devri çalışıyor; takılan iş listeyi durdurmuyor; uyku açıkken sürücü uyarıyor, uyanık tutma seçeneği açıkken sistem uykuya geçmiyor; kurulum ve sürücü tek adımda (çift tıklama ya da tek komut) başlıyor, yönetici izni istemiyor; uzak deposu olmayan bir projede liste "yerel" kipte bitiyor ve hiçbir kipte kullanıcı açmadan push yapılmıyor; ajan yalnız kendisine verilen proje dizininde çalışıyor (başka dizinde değişiklik yaparsa iş geçersiz sayılıyor) |
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

**Açık kalem kapandı (2026-11-20):** kullanıcı Claude Code'da oturum açtı. Claude Code başsız kipte deftere iş 1'i açıp kapattı; ardından
`ikinci_istemci.js` aynı deftere iş 2'yi açtı. Çıktı: "defterde is acan farkli istemci sayisi: 2 / GECTI". İstemci kimliklerini
(`claude-code 2.1.326`, `bagimsiz-test-istemcisi 1.0.0`) sunucu bağlantıdan okudu.

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

## Aşama 2: yöntem paketi (tamam, bir notla)

Paket `paket/` altındadır: yedi skill (`paket/skills/*/SKILL.md`), her oturuma giren kısa blok (`paket/AGENTS.md`) ve madde tablosu
(`paket/kurallar.json`). Tablonun kaynağı JSON dosyasıdır; `test/paket.test.ts` denetimi olmayan maddenin "kural" etiketi taşımasını,
skill metniyle tablonun ayrışmasını ve bu tablonun eksik kalmasını reddeder.

**Kurulum:** `node dist/src/cli.js kur --hedef <proje>` paketi projeye kurar; var olanı ezmez, ikinci koşuda değişiklik yapmaz
(`test/kur.test.ts`). Yollar araçların kendi belgelerinden doğrulandı (2026-11-19):

| Araç | Skill dizini | MCP kaydı | Her oturuma giren dosya | Kaynak |
|---|---|---|---|---|
| Claude Code | `.claude/skills/` | `.mcp.json` (`mcpServers`) | `CLAUDE.md` içinde `@AGENTS.md` | code.claude.com/docs/en/skills, /mcp, /memory |
| Codex CLI | `.agents/skills/` | `.codex/config.toml` (`[mcp_servers.mihenk]`) | `AGENTS.md` | learn.chatgpt.com/docs/build-skills, /extend/mcp |
| Gemini CLI | `.agents/skills/` | `.gemini/settings.json` (`mcpServers`) | `context.fileName` ile `AGENTS.md` | geminicli.com/docs/cli/skills, /tools/mcp-server |
| Antigravity | `.agents/skills/` | `.agents/plugins/mihenk/` (`plugin.json` + `mcp_config.json`) | `AGENTS.md` | kurulu sürümün (44.9.1) kendi belgesi: `agy-customizations` skill'i |
| OpenCode | `.agents/skills/` (denemede görüldü) | `opencode.json` (`mcp.servers.mihenk`) | `AGENTS.md` | kurulu sürümün (2.3.2) kendi `mcp add` çıktısı |

Antigravity notu (2026-11-20): makinede yalnız masaüstü uygulaması var, komut satırı aracı (`agy`) yok; başsız koşulamıyor. Web belgesi
proje düzeyinde `.agents/mcp_config.json` diyordu; kurulu sürümün kendi belgesi MCP sunucusunun yalnız küresel ayarda ya da bir eklentinin
içinde tanımlandığını söylüyor. Küresel ayara dokunmamak için proje içi eklenti yolu seçildi. Doğru olup olmadığını elle deneme gösterecek.

**Plana etkisi olan bulgu:** Gemini CLI'nin belgeleri, ücretsiz katman ve Google One kullanıcıları için aracın 18 Haziran 2026'da
Antigravity CLI ile değiştirildiğini söylüyor; Gemini CLI yalnız ücretli API anahtarı ve kurumsal lisansla sürüyor. Bu yüzden kurulum
dördünü de yazar. Üçüncü hedef aracın Gemini CLI mi Antigravity CLI mı olacağı kullanıcının hangi aboneliği kullandığına bağlıdır.

**Kabul denemesi tek komuttur:** `node dist/test/kabul_asama2.js --arac claude` küçük hatalı örnek projeyi (`ornek/kucuk-gorev`) geçici
dizine kopyalar, paketi kurar, aracı başsız kipte çalıştırır ve sonucu aracın beyanından değil defterden ve testin kendisinden okur.
Bugünkü sonuç: paketli Claude Code "Not logged in" dedi, betik "ATLANDI" yazdı. Codex ve Gemini / Antigravity için başsız komut henüz
yazılmadı: araçlar kurulu olmadığından komutları denenemedi, denenmemiş komut yazılmadı.

**Antigravity ile ilk gerçek deneme (2026-11-20, kullanıcı görevi araçta verdi):** betiğin hükmü "KALDI" (4 ölçütten 3'ü tamam).
- Tamam: Antigravity mihenk sunucusunu kendisi başlattı (eklenti yolu çalışıyor); önce açık işlere baktı (`rapor`), kayıt açtı (`is_ac`,
  doğrulama komutu `npm test`), kök nedeni not etti (`kanit_ekle`), `hukum_ver` çağırdı; sunucu komutu koştu, çıkış kodu 0, iş 45
  saniyede "geçti" diye kapandı; örnek projenin testi bağımsız koşuda da geçiyor.
- Eksik: defter aracın kimliğini okuyamadı (`istemci` alanı boş, bağlantı olayı yok). Kök neden: kimlik yalnız eski el sıkışmadan
  okunuyordu; yeni protokol çağında (2026-07-28) kimlik her isteğin içinde gelir. Düzeltildi ve aynı belirtiyi üreten bir testle
  sınandı (`test/mcp.test.ts` "yeni cag istemcisi"). Düzeltme Antigravity'nin kendisiyle henüz yeniden denenmedi.
- Bakılmadı: skill'lerin Antigravity içinde listelendiği.

**Claude Code ile deneme (2026-11-20, başsız kip, kullanıcı oturum açtıktan sonra):** betiğin hükmü "GECTI" (4 ölçütün 4'ü).
Claude Code 2.1.326 deftere bağlandı, önce açık işlere baktı, kayıt açtı (`npm test`), `hukum_ver` çağırdı; sunucu komutu koştu, iş
"geçti" diye kapandı; test bağımsız koşuda da geçiyor. 10 tur, 0,25 USD. Bakılmadı: skill'lerin araç içinde listelendiği.

**Codex CLI ve OpenCode ile deneme (2026-11-20; kullanıcı ikisini de kurdu):**

| Araç | Betiğin hükmü | Defter kullanımı | Skill izi | Not |
|---|---|---|---|---|
| Claude Code 2.1.326 | GEÇTİ (4/4) | iş açtı, "geçti" diye kapandı | açılış kaydında yedi skill ve `mihenk` sunucusu "connected" | 10 tur, 0,25 USD |
| Codex CLI 0.170.0 | GEÇTİ (4/4) | iş açtı, kök nedeni not etti, "geçti" diye kapandı | koşuda beş skill dosyasını okudu | ücretsiz ChatGPT hesabıyla çalıştı |
| OpenCode 2.3.2 | GEÇTİ (4/4) | iş açtı, "geçti" diye kapandı | `mihenk-is-kaydi` skill'ini yükledi | ücretsiz model (`opencode/big-pickle`), giriş yok |
| Antigravity 44.9.1 | KALDI (3/4) | iş açtı, "geçti" diye kapandı | bakılmadı | eksik: istemci kimliği; düzeltildi, yeniden denenmedi |

Denemelerin öğrettikleri (Aşama 3'te sürücü bunları bilmek zorunda):
- **Codex:** projedeki MCP kaydı yalnız güvenilen projede okunur (`codex exec --trust`; güven Codex'in kendi kullanıcı ayarına yazılır).
  Başsız kipte araç çağrısı onay ister ve onay politikası "never" olduğu için reddedilir; `--approve-for-me` gerekir. İkisi olmadan
  Codex defteri kullanamadı ve bunu dürüstçe bildirdi (olumsuz sonuç).
- **OpenCode:** MCP biçimi `opencode.json` içinde `mcp.servers.<ad>` (aracın kendi `mcp add` komutunun çıktısından okundu; ezberdeki
  biçim yanlış çıkardı). Skill'leri `.agents/skills` altından buldu.
- **Olay: ajan yanlış dizinde çalıştı.** `opencode run` çalışma dizinini sürecin gerçek dizininden değil, miras kalan `PWD` ortam
  değişkeninden alıyor. Kabul betiği depo dizininden başlatılınca OpenCode örnek proje yerine mihenk deposunda çalıştı ve otomatik
  onayla üç dosyayı değiştirdi. Değişiklikler commit edilmeden fark edildi, yama olarak saklandı (`deneme/opencode-yanlis-dizin.patch`,
  git dışı) ve geri alındı. Kök neden deneyle doğrulandı (PWD silinince doğru dizinde çalıştı). Önlem: betik çocuk sürece `PWD`'yi
  açıkça verir ve koşudan önce / sonra deponun durumunu karşılaştırır; değişmişse sonucu "GECERSIZ" sayar. **Sürücü de ajanı başlatırken
  aynı iki önlemi alacak** (Aşama 3 ölçütüne eklendi).
- O yanlış koşuda OpenCode gerçek olabilecek bir zayıflık bildirdi: doğrulama komutu 0 ile çıkıp arkasında borusu açık bir torun süreç
  bırakırsa `hukum_ver` zaman aşımına kadar bekler ve işi "kaldı" sayar. **Doğrulandı ve düzeltildi (2026-11-20):** üreten test
  düzeltmeden önce kaldı (başarılı komut 9,2 saniye sonra "zaman aşımı" sayıldı), düzeltmeden sonra 0,6 saniyede çıkış kodu 0 ile
  döndü (`test/dogrulama.test.ts` "komut 0 ile cikip arkada borusu acik surec biraksa da"). Hüküm artık komutun çıkış kodudur; arkada
  kalan süreç beklenmez ve çıktıya not düşülür. OpenCode'un yaması girdi olarak okundu, olduğu gibi uygulanmadı.

**Aşama 2'de durum:** ölçütün ikinci yarısı (aynı küçük görevde üç araç defteri kullanıyor) Claude Code, Codex ve OpenCode ile
gösterildi. Birinci yarı (skill'ler listeleniyor) Claude Code'da tam, Codex ve OpenCode'da dolaylı gösterildi: skill'leri bulup
kullandılar, ama araç içi skill listesine bakılmadı. Açık: Antigravity'de kimlik düzeltmesinin yeniden denenmesi.

Başsız kipi olmayan araç için betik iki adımdır: `--asama hazirla` deneme projesini `deneme/<araç>/` altına (git dışı) kurar ve
kullanıcıya üç satırlık yönerge yazar; kullanıcı görevi araçta verir; `--asama denetle` sonucu defterden okur.

**Kalan, isteğe bağlı:** Antigravity'de denemeyi bir kez daha yapmak (kimlik düzeltmesini doğrular) ve Codex ile OpenCode'da araç içi
skill listesine bakmak. İkisi de kullanıcının elle yapacağı kısa adımlardır; aşamanın kapanmasını beklemez.

| Kod | Madde | Skill | Durum |
|---|---|---|---|
| K1 | Kayıt açılmadan iş başlamaz | mihenk-is-kaydi | kural: testi var |
| K2 | Doğrulama komutu kabuksuz koşar, izinsiz program reddedilir | mihenk-is-kaydi | kural: testi var |
| K3 | Kayıt tam ve kısadır, açıldıktan sonra değişmez | mihenk-is-kaydi | kural: testi var |
| K4 | Kanıtı ajan beyan etmez | mihenk-kanit-ve-hukum | kural: testi var |
| K5 | Doğrulama geçmeden iş kapanmaz | mihenk-kanit-ve-hukum | kural: testi var |
| K6 | Kapanan iş değişmez | mihenk-kanit-ve-hukum | kural: testi var |
| K7 | "Kaldı" ve "belirsiz" gerekçe ister | mihenk-kanit-ve-hukum | kural: testi var |
| K8 | Karar notu seçenek, seçilen ve karşı görüş ister | mihenk-karar-notu | kural: testi var |
| K9 | Araç dönüşü sınırlıdır | mihenk-kanit-ve-hukum | kural: testi var |
| O1 | Önce ucuz denetim | mihenk-ucuz-denetim | öneri: denetimi Aşama 4 ve 7'de |
| O2 | Tek koşuda tek değişiklik | mihenk-tek-degisiklik | öneri: denetimi Aşama 4'te |
| O3 | Yazan doğrulamaz | mihenk-bagimsiz-dogrulama | öneri: denetimi Aşama 3-4'te |
| O4 | Kök neden logdan | mihenk-kok-neden | öneri: denetimi Aşama 4'te |
| O5 | Durmadan devam | mihenk-karar-notu | öneri: denetimi Aşama 3'te (sürücü) |
| O6 | İki vites: keşif hafif, hüküm tam | mihenk-is-kaydi | öneri: ayrı denetim planlanmıyor |

Dokuz madde kural, altısı öneridir. Öneriler ajana ne yapacağını söyler ama uyulduğunu şu an hiçbir şey garanti etmez (İlke 1).

**Karar (açık karar 1):** skill metinleri ve AGENTS.md bloğu İngilizce, araç ve alan adları Türkçe (ASCII) yazıldı. En güçlü karşı görüş:
kullanıcı metinleri kendi dilinde denetleyemez ve karışık dil ajanı şaşırtabilir. Kullanıcının okuyacağı Türkçe karşılık bu tablodur;
hangi dilin daha iyi izlendiği Aşama 4'te ölçülünce yeniden bakılır.

## Aşama 3 sonucu (2026-11-20)

Sürücü `src/surucu.ts` içindedir; kullanıcı onu proje klasöründeki `mihenk-baslat.cmd` dosyasına çift tıklayarak ya da
`node dist/src/cli.js sur --hedef <proje>` ile başlatır. İş listesi proje kökündeki `mihenk-isler.json` dosyasıdır.

| Ölçüt | Sonuç | Kanıt |
|---|---|---|
| On işlik liste kullanıcı girişi olmadan bitiyor | gösterildi (gerçek araçlarla) | `node dist/test/kabul_asama3.js`: Codex ve OpenCode dönüşümlü, 10/10 "geçti", 5,9 dakika, stdin kapalı. Ayrıca sahte ajanla test |
| Yapay büyük çıktılı işte oturum devri çalışıyor | gösterildi (yalnız sahte ajanla) | `test/surucu.test.ts` "baglami sisiren oturum kapatilir, yenisi devir notuyla acilir" |
| Takılan iş listeyi durdurmuyor | gösterildi (sahte ajanla) | "takilan is listeyi durdurmaz"; ayrıca "bitti diyen ama yapmayan ajan" testi |
| Uyku açıkken sürücü uyarıyor | gösterildi (yalnız testte) | uyku ayarı çıktısı çözülüp uyarı üretiliyor; bu makinede uyku kapalı olduğundan canlı görülmedi |
| Uyanık tutma açıkken sistem uykuya geçmiyor | **yarım** | işletim sistemi isteği kabul ediyor (test ve gerçek koşu); uyumadığı gözlenmedi |
| Tek adımda başlıyor, yönetici izni istemiyor | gösterildi | `mihenk-baslat.cmd` normal kullanıcı haklarıyla çalıştırıldı; `kur` yalnız proje içine yazıyor (test) |
| Uzak deposuz projede "yerel" kipte bitiyor; kullanıcı açmadan push yok | gösterildi | saklama testleri; gerçek koşuda iş başına bir yerel commit, uzak depo yok |
| Ajan başka dizinde değişiklik yaparsa iş geçersiz | gösterildi | "ajan proje disinda degisiklik yaparsa is gecersiz sayilir"; gerçek koşuda mihenk deposu değişmedi |

Gerçek araç koşuları: on işlik liste (Codex 5 iş, ortalama 46 sn; OpenCode 5 iş, ortalama 24 sn; hepsi ilk denemede), tek işlik Codex
(26 sn), tek işlik Claude Code (20 sn). Üç araç da sürücüyle çalıştı. Ajanlar `hukum_ver` çağırmayı denemedi; her işte bir not yazdılar.

**Açık kalemler ve sınırlar:**
- Uyanık tutma: `SetThreadExecutionState` çağrısı başarılı dönüyor, ama sistemin gerçekten uyumadığı gözlenmedi (uykusu açık bir
  makinede bekleme süresini aşan bir koşu gerekir; `powercfg /requests` yönetici ister). Yalnız Windows için yazıldı; başka sistemde
  denenmemiş kod yok, orada "desteklenmiyor" der. Kullanıcının bilgisayarı elle uyutmasını (kapak, güç düğmesi) engellemez.
- Oturum devri gerçek bir ajanla tetiklenmedi (küçük işlerde bağlam eşiği aşılmadı). Bağlam ölçümü araca göre değişiyor: Claude Code
  ve OpenCode adım başına gerçek token sayısı bildiriyor (ölçülen: yaklaşık 46 bin ve 12 bin); Codex yalnız tur sonunda toplam
  bildirdiği için canlı ölçüm çıktı hacminden tahmin ediliyor ve gerçeğin çok altında kalıyor. Codex'te eşik fiilen çalışmayabilir.
- Dizin koruması yalnız listelenen git depolarına bakar (varsayılan: mihenk'in kendi deposu); bütün diski izleyemez.
- Antigravity'nin başsız kipi olmadığı için sürücü onu kullanamaz.
- Sürücü çalışırken korunan depoda (mihenk) başka biri dosya değiştirirse o sıradaki iş geçersiz sayılır: ilk on işlik koşu bu yüzden
  durduruldu (değiştiren bu oturumdu, ajan değil).

**Alınan kararlar (öneri uygulandı; veto edilebilir):**

| Karar | Seçilen | En güçlü karşı görüş |
|---|---|---|
| İş listesinin biçimi | proje kökünde `mihenk-isler.json`; `kur` örneğini bırakır | JSON, kodlama bilmeyen biri için kırılgan (bir virgül dosyayı bozar). Hata iletisi anlaşılır yazıldı ama bir form ya da düz metin biçimi İlke 3'e daha uygun olurdu |
| "Takıldı" durumu | ayrı durum eklenmedi: iş, gerekçesi "takildi:" ile başlayan "kaldı" hükmüyle kapanır | Ayrı durum raporlamayı ve öneri hesabını netleştirirdi; var olan defterlerde şema değişikliği gerektirdiği için ertelendi |
| Devir notunu kim yazar | sürücü yazar (önceki oturumun son iletisi ve doğrulama çıktısının sonu) | Plan "ajana yazdırır" diyordu; başsız tek seferlik oturuma araya girilemediği için ajan yazamıyor. Ajanın kendi notu daha zengin olurdu |
| Sürücü işinde hüküm | yalnız sürücü verir; ajanın `hukum_ver` çağrısı reddedilir (`SURUCU_ISI`) | Ajan işi kendisi kapatabilse bir doğrulama koşusu kazanılırdı; ama o zaman sürücü kapanıştan önce kendi denetimini yapamıyor (gerçek koşuda görüldü) |
| Yeniden deneme | dış döngü her denemeyi temiz oturumda başlatır (en fazla 3) | Aynı oturumu sürdürmek ucuz olurdu; temiz oturum bağlam sorununu kökten çözdüğü için seçildi |
| İletilerin yazımı | Türkçe ama Türkçeye özgü harfler olmadan | Okunması biraz zorlaşıyor; Windows konsolunda bozuk harf görünmesini önlemek için böyle |

**Kullanıcıya açık soru:** git kurulu olmayan kullanıcı için "yok" kipi (yalnız defter) yeterli mi, yoksa git'siz bir yedekleme mi isteniyor?

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
