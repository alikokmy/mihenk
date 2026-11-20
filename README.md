# mihenk

Kodlama ajanlarının bağlandığı, işi kayda alan, kanıtı kendisi denetleyen, iş listesini kesintisiz yürüten ve hangi işin hangi ajana verileceğini
ölçerek öneren ince bir katman.

Ad: mihenk taşı, altının ayarını sınamak için kullanılan taştır. Proje iki şeyi sınar: yapılan işin doğruluğunu ve işi yapan ajanın o iş türündeki
değerini (doğruluk, süre, maliyet).

**Durum:** Aşama 1 (defter), Aşama 2 (yöntem paketi ve kurulum) ve Aşama 3 (sürücü) yazıldı. Sürücü on işlik bir listeyi Codex ve OpenCode ile
girdisiz bitirdi. Aşama 4 (uyum testleri: `mihenk uyum`) üç araçta koşuldu. Açık kalemler planda yazılı. Aşama 5: sürücü her işin süresini, token kullanımını ve (araç bildiriyorsa) dolar maliyetini deftere yazıyor. Aşama 6: `mihenk oneri` iş türü başına araç önerisi veriyor (az veride "veri yetersiz"). Aşama 7: Claude Code ve Codex'te elle açılan oturumda kanıtsız "bitti" ve commit kancayla reddediliyor.

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
- **Liste tek iş yüzünden durmaz:** bir iş üç denemede geçmezse "kaldı" diye kapanır, sıradakine geçilir. Yarıda kesilen liste yeniden
  başlatılınca biten işleri atlar.
- **Hangi araç:** listede `ajan` yazarsınız (`codex`, `opencode`, `claude`); yazmazsanız kurulu olan ilk araç kullanılır. İş başına ayrı
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
