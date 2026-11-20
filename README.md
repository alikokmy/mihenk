# mihenk

Kodlama ajanlarının bağlandığı, işi kayda alan, kanıtı kendisi denetleyen, iş listesini kesintisiz yürüten ve hangi işin hangi ajana verileceğini
ölçerek öneren ince bir katman.

Ad: mihenk taşı, altının ayarını sınamak için kullanılan taştır. Proje iki şeyi sınar: yapılan işin doğruluğunu ve işi yapan ajanın o iş türündeki
değerini (doğruluk, süre, maliyet).

**Durum: sürüm 0.1.** Defter, yöntem paketi, sürücü, uyum testleri, süre ve maliyet, öneri, kanıtsız "bitti"ye kapı ve temiz kaldırma
yazıldı ve denendi. Açık kalemler ve sürüm 0.2 taslağı [docs/IS_PLANI.md](docs/IS_PLANI.md) içinde.

| Araç | Kurulum | Gerçek denemede | Kapı (kanca) |
|---|---|---|---|
| Claude Code | var | defter, sürücü, uyum 16/16, maliyet | var, denendi |
| Codex CLI | var | defter, sürücü, uyum 15/16, token (maliyet abonelikte bilinmiyor) | var, denendi (bir kez onay ister) |
| OpenCode | var | defter, sürücü, uyum 16/16, maliyet | yok |
| Kilo Code CLI | var | defter, sürücü, uyum 16/16, maliyet; ücretsiz modelle oturumsuz | yok |
| Antigravity | var | masaüstünde defter (4 ölçütten 3'ü); komut satırı kipi olmadığı için sürücü ve uyum yok | yok |
| Cline CLI | var | **denenmedi**: hesapla oturum açmak gerekiyor | yok |
| Qwen Code | var | **denenmedi**: ücretsiz katmanı kapandı; kurulum belgeye göre yazıldı | belgeye göre yazıldı, denenmedi |
| Gemini CLI | var | **denenmedi**: ücretsiz katmanda kaldırılmış | yok |

- [docs/ARASTIRMA.md](docs/ARASTIRMA.md): benzer açık kaynak projelerin taraması ve hüküm.
- [docs/IS_PLANI.md](docs/IS_PLANI.md): onaylı iş planı, iki bağlayıcı ilke, aşama sonuçları ve açık kararlar.
- [AGENTS.md](AGENTS.md): bu depoda çalışan ajanlar için kısa kurallar.

## Defter (MCP sunucusu)

Ajan araçları deftere MCP üzerinden bağlanır. Beş araç vardır:

| Araç | Ne yapar |
|---|---|
| `is_ac` | İşe başlamadan kısa kayıt açar: tür, soru, beklenti, "yanlışsa ne görürüz", doğrulama komutu, ajan ve model |
| `kanit_ekle` | Ajanın notunu ekler. Beyandır; hükmü etkilemez |
| `karar_yaz` | Karar notu: seçenekler, seçilen, en güçlü karşı görüş |
| `hukum_ver` | Doğrulama komutunu **sunucuda** koşar. Komut 0 ile çıkarsa iş "geçti" diye kapanır; çıkmazsa iş açık kalır |
| `rapor` | Durum sayıları, iş listesi ya da tek işin ayrıntısı |

Kurallar metinde değil, kodda ve veritabanında durur: kaydı olmayan işe yazılmaz, doğrulama geçmeden iş "geçti" olmaz, kapanan iş değişmez.

```
npm install
npm test          # derler ve testleri koşar
node dist/src/bin.js --kok <proje dizini>    # sunucuyu stdio üzerinden başlatır
```

## Bir projeye kurmak

```
node <mihenk yolu>/dist/src/cli.js kur --hedef <proje dizini>
```

Bu komut yedi skill'i (`.claude/skills` ve `.agents/skills`), her oturuma giren kısa kural bloğunu (`AGENTS.md`) ve defterin MCP kaydını
(Claude Code, Codex CLI, Gemini CLI, Antigravity ve OpenCode için ayrı ayar dosyaları) yazar. Var olan içeriği ezmez; yalnız bir araç için
`--arac claude` gibi daraltılır. Skill'lerin hangisinin testle zorlanan kural, hangisinin öneri olduğu
[docs/IS_PLANI.md](docs/IS_PLANI.md) "Aşama 2" tablosundadır.

Kurulum ayrıca proje klasörüne örnek bir iş listesi (`mihenk-isler.ornek.json`) ve Windows'ta çift tıklanır bir başlatma dosyası
(`mihenk-baslat.cmd`) bırakır.

## Özellikleri açıp kapatmak

Proje klasöründeki `mihenk-ayarlar.cmd` dosyasına çift tıklayın. Her özellik bir numarayla listelenir; numarayı yazıp Enter'a basınca
açılır ya da kapanır ve hemen uygulanır, yalnız Enter çıkar. (Komut satırından: `mihenk ayar`, `mihenk ayar skiller kapa`.)

| Anahtar | Ne yapar | Varsayılan |
|---|---|---|
| `kapi` | kanıtsız "bitti" ve commit'i engelleyen kapı | açık |
| `skiller` | ajana yöntemi öğreten beceriler | açık |
| `yontem_metni` | AGENTS.md'deki kısa mihenk kuralları | açık |
| `arac_<araç>` | o araç için defter bağlantısı (ve varsa kapı kancası) | açık |
| `saklama` | geçen işten sonra: `yerel` commit, `yok`, `yerel_gonder` | `yerel` |
| `uyanik_tut` | liste yürürken bilgisayarı uyanık tut | kapalı |
| `bildirim` | liste bitince ya da durunca Windows bildirimi | açık |
| `bilgi_notlari` | ayarların altında amaç, sonuç ve varsayılan bilgisi | açık |
| `geri_alma` | her işin başında ve sonunda fotoğraf; `geri-al` bunu kullanır | açık |
| `geri_alma_sakla` | geri alınabilecek en son kaç işin fotoğrafı saklansın (0: hiçbiri) | 5 |
| `bekci_test_kurcalama` | iş sırasında var olan test değişti, silindi ya da atlandıysa "geçti"ye şüpheli notu | açık |
| `bekci_bos_kanit` | iş açılınca doğrulama bir kez koşar; zaten geçiyorsa "geçti"ye şüpheli notu | kapalı |
| `gerileme` | bütün test takımı ne zaman koşsun: `gonderirken`, `liste_sonunda`, `her_iste`, `kapali` | `gonderirken` |
| `bekci_dongu` | iş listesinde, aynı hatayı iki kez veren işte kalan denemeler harcanmaz | açık |
| `bekci_yikici` | proje dışını silen ve git geçmişini ezen komutlar reddedilir | açık |
| `bekci_kararsiz` | geçen doğrulama bir kez daha koşulur; sonuç değişirse iş "belirsiz (kararsız)" | kapalı |

**Hız:** varsayılan ayarlarla her iş için doğrulama bir kez koşar: iş bitince, işin kendi komutuyla. Bu komutu hızlı ve hedefli
yazın (ör. yalnız ilgili test dosyası). Bütün test takımı varsayılan olarak yalnız uzak depoya gönderilmeden önce koşar; varsayılan
saklama kipi göndermediği için, varsayılan kurulumda hiç koşmaz. Uzun listeler için önerimiz `gerileme: liste_sonunda`dır.

Kapatılan özelliğin dosyaları kaldırmadaki gibi geri alınır; yeniden açınca dosyalar bayt bayt önceki haline döner. Ayarlar `mihenk.json`'da
durur ve yalnız varsayılandan farklı olanlar yazılır. Liste, kurulumun her oturumda ajana eklediği yaklaşık metin yükünü de gösterir (token).

## Ne yapıldı: rapor ve bildirim

`mihenk-rapor.cmd` dosyasına çift tıklayınca tarayıcıda tek sayfalık bir rapor açılır: kaç iş başarıyla bitti, hangisi neden yapılamadı,
ne kadar sürdü, ne kadar tuttu. Kodlama terimi kullanmaz. "Başarıyla bitti", işin kendi denetiminin mihenk tarafından çalıştırılıp
geçtiği anlamına gelir; yapay zekânın "bitti" demesi sayılmaz. Sürücü her liste sonunda raporu yeniler ve (Windows'ta) ekranın köşesinde
kısa bir bildirim gösterir; bildirim ayarlardan kapatılabilir (`bildirim`). Rapor `.mihenk/rapor.html` dosyasındadır.

## Bir işi geri almak

Her işin başında ve sonunda projenin bir fotoğrafı alınır (git gerekmez). Beğenmediğiniz ya da yarım kalan bir işin değişikliklerini
geri almak için:

```
node <mihenk yolu>/dist/src/cli.js geri-al <iş numarası> --hedef <proje>
```

İşin değiştirdiği dosyalar eski haline döner, eklediği dosyalar silinir, sildiği dosyalar geri gelir. İş bittikten sonra başka bir işin
ya da sizin değiştirdiğiniz dosyalara dokunulmaz; bunlar "dokunulmadı" diye yazılır. Önce ne olacağını görmek için `--deneme` ekleyin.
5 MB'tan büyük dosyalar fotoğrafa girmez ve geri alınamaz. Varsayılan olarak son 5 işin fotoğrafı saklanır, eskileri silinir
(`geri_alma_sakla`; 0 hiçbirini tutmaz, `geri_alma` kapatılırsa fotoğraf hiç alınmaz). Sürücü "kaldı" kapanan işte bu komutu kendisi hatırlatır.

## Kaldırmak

Proje klasöründeki `mihenk-kaldir.cmd` dosyasına çift tıklayın (ya da: `node <mihenk yolu>/dist/src/cli.js kaldir --hedef <proje>`).
mihenk'in eklediği her şey geri alınır: oluşturduğu dosyalar silinir, değiştirdiği dosyalar kurulumdan önceki haline bayt bayt döner.
Kurulumdan sonra sizin değiştirdiğiniz dosyalarda yalnız mihenk'in parçası çıkarılır, sizin eklediğiniz durur. Ne yapıldığı tek tek yazılır.

İş kaydınız (defter) silinmez: proje dışına, `%LOCALAPPDATA%\mihenk\kaldirilan\` altına taşınır ve yeri yazılır. Böylece proje kurulumdan
önceki gibi kalır, kayıt da kaybolmaz. Kaydı da silmek isterseniz: `kaldir --defter-dahil`. Vazgeçerseniz yeniden `mihenk kur` yeter.

## İş listesini yürütmek (sürücü)

Sürücü, yazdığınız iş listesini sırayla bir ajan aracına verir ve liste bitene dek siz başında olmadan sürdürür.

1. `mihenk-isler.ornek.json` dosyasını `mihenk-isler.json` adıyla kopyalayın ve işlerinizi yazın. Her iş için dört şey gerekir: ne
   yapılacak (`soru`), doğru yapılınca ne görülür (`beklenti`), yanlışsa ne görülür (`yanlissa`) ve işin bittiğini gösteren tek komut
   (`dogrulama_komutu`, ör. `npm test`).
2. `mihenk-baslat.cmd` dosyasına çift tıklayın. (Komut satırından: `node <mihenk yolu>/dist/src/cli.js sur --hedef <proje>`.)
3. Bitince pencerede kaç işin geçtiği, kaçının kaldığı yazar. Ayrıntı `.mihenk/defter.jsonl` içindedir.

Bilmeniz gerekenler:

- **İşin bittiğine ajan değil sürücü karar verir:** doğrulama komutunu kendisi koşar. Ajan "bitti" dese de komut geçmeden iş kapanmaz.
- **Başka yeri bozan iş:** bütün test takımı (`gerileme_komutu`; yazmazsanız `package.json` test betiği) `gerileme` ayarına göre
  koşar. `gonderirken` (varsayılan): uzak depoya göndermeden önce; kalırsa iş yalnız yerelde saklanır. `liste_sonunda`: listenin başında
  ve sonunda; kalırsa uyarır. `her_iste`: her denemede; önceden geçeni bozan iş "geçti" sayılmaz (yavaş). Testler liste başlamadan
  zaten kalıyorsa denetim yapılamaz ve bu söylenir.
- **Harcama ve süre tavanı:** listede `butce_usd` / `is_butce_usd` (dolar) ve `sure_tavani_dk` / `is_sure_tavani_dk` (dakika)
  yazabilirsiniz. İş tavanı dolunca o iş "belirsiz (bütçe)" kapanır, sıradakine geçilir; liste tavanı dolunca liste durur ve yeniden
  başlatınca kaldığı yerden sürer. Dolar tavanı yalnız maliyetini bildiren araçlarda işler (Codex aboneliği sayılamaz: süre tavanı kullanın).
- **Model sağlayıcısı reddederse** (hız sınırı, kota): sürücü bekler (`kota_bekleme_dk`, varsayılan 15) ve yeniden dener; bu deneme hakkından düşmez.
- **Aynı hatada ısrar edilmez:** doğrulama iki denemede aynı hatayı verirse kalan denemeler harcanmaz.
- **Yıkıcı komut reddedilir** (Claude Code, Codex, Qwen kancası; sürücü kipinde de): proje dışını ya da kökünü silen `rm -rf` /
  `Remove-Item -Recurse`, `git reset --hard`, `git push --force`, `git clean -fd`. Proje içinde silmek (`rm -rf dist`) serbesttir.
- **Liste tek iş yüzünden durmaz:** bir iş üç denemede geçmezse "kaldı" diye kapanır, sıradakine geçilir. Yarıda kesilen liste yeniden
  başlatılınca biten işleri atlar.
- **Hangi araç:** listede `ajan` yazarsınız (`codex`, `opencode`, `kilo`, `claude`; denenmemiş: `cline`, `qwen`); yazmazsanız kurulu olan ilk araç kullanılır. İş başına ayrı
  araç da seçilebilir.
- **Saklama (`saklama`):** `yok` (yalnız kayıt tutulur), `yerel` (her geçen iş için yalnız bu bilgisayarda commit; varsayılan),
  `yerel_gonder` (commit ve uzak depoya gönderme). İnternet ya da GitHub gerekmez; siz açmadıkça hiçbir şey gönderilmez.
- **Uyku:** bilgisayar uyursa liste durur. Uyku açıksa sürücü başlarken uyarır. Listede `"uyanik_tut": true` yazarsanız liste bitene dek
  bilgisayarı uyanık tutar (yalnız Windows; yönetici izni istemez; kapağı kapatmak ya da güç düğmesi yine uyutur).
- **Yönetici izni gerekmez.** Sürücü yalnız proje klasörüne yazar. Ajan proje dışında bir şey değiştirirse o iş geçersiz sayılır ve
  size bildirilir.
- Sınır: Antigravity'nin komut satırı kipi olmadığı için sürücü onu kullanamaz. Ajan araçlarını kurmak ve onlarda oturum açmak sizin
  işinizdir.

## Kendi açtığınız oturumda kapı (Claude Code ve Codex)

`mihenk kur` Claude Code (`.claude/settings.json`) ve Codex (`.codex/hooks.json`) için kanca yazar. Ajan bir oturumda proje dosyası
değiştirdiyse, son değişiklikten sonra defterde `hukum_ver` ile kapanmış bir kayıt olmadan **işi bitiremez ve commit atamaz**; kapı ona ne
yapması gerektiğini söyler. Hükmün "kaldı" olması da yeter: istenen başarı değil, kanıtlı ve dürüst kapanıştır. Değişiklik yapmayan
(yalnız soru yanıtlayan) oturuma kapı karışmaz. Her geçiş ve engel `.mihenk/kapi.jsonl` dosyasına yazılır.

- **Codex'te bir kez onay gerekir:** Codex'i proje klasöründe açın, `/hooks` ekranında mihenk kancalarını onaylayın. Onaylanmamış kanca
  çalışmaz (mihenk kurulumu değişirse yeniden onay ister).
- **Kapıyı kapatmak:** proje kökündeki `mihenk.json` dosyasına `"kapi": false` yazın. Kapalıyken her geçiş yine kaydedilir.
- **Sonsuz döngü olmaz:** ajan üst üste üç kez engellenip yine uymazsa kapı geçit verir ve bunu `kapi_atlandi` diye kaydeder.
- Sürücü (`mihenk sur`) kendi işlerinde kapıyı kullanmaz: orada işi sürücünün kendisi doğrular ve kapatır.

## Hangi işe hangi ajan (öneri)

```
node <mihenk yolu>/dist/src/cli.js oneri --hedef <proje>
```

Defterdeki kapanmış işlerden, iş türü başına hangi aracın daha az harcayarak doğrulanmış başarı getirdiğini gösterir. Başarı yalnız
doğrulama komutunun geçmesidir; ajanın "bitti" demesi sayılmaz. Bir seçenek için en az 5 iş ve başarı oranının %95 güven aralığının alt
ucunun %50'yi geçmesi gerekir; yoksa "veri yetersiz" yazar ve öneri vermez. Uyum testi raporu varsa (`mihenk-uyum/uyum-raporu.json`)
uyumu %80'in altındaki araç önerilmez. Maliyeti bilinmeyen araç (ör. abonelikle çalışan Codex) maliyetle karşılaştırılamaz; bu yazılır.
Öneri yalnız gösterir; aracı her zaman siz seçersiniz. Eşikler `--esik` ve `--en-az` ile değişir.

Veri proje içinde `.mihenk/` altında durur (git dışı): `defter.db` (SQLite), `defter.jsonl` (okunur döküm), `log.jsonl` (her işlemin başla /
bitti satırı), `surucu.jsonl` (sürücünün olay kaydı), `ciktilar/` (doğrulama ve ajan çıktılarının tamamı).

**Doğrulama komutu nasıl koşar:** kabuk kullanılmaz; `&&`, boru, yönlendirme reddedilir. Program izin listesinden olmalıdır (`node`, `npm`,
`pytest`, `cargo`, `go`, `git` gibi test ve derleme araçları). Liste, proje kökündeki `mihenk.json` dosyasında `izinli_programlar` ile
değiştirilir. Bu bir kum havuzu değildir: komut sizin kullanıcı haklarınızla koşar.

Yöntemin kaynağı metamorfik projesinde uygulanan çalışma biçimidir; buraya yalın hali taşınır.
