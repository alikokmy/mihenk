# mihenk

Kodlama ajanlarının bağlandığı, işi kayda alan, kanıtı kendisi denetleyen, iş listesini kesintisiz yürüten ve hangi işin hangi ajana verileceğini
ölçerek öneren ince bir katman.

Ad: mihenk taşı, altının ayarını sınamak için kullanılan taştır. Proje iki şeyi sınar: yapılan işin doğruluğunu ve işi yapan ajanın o iş türündeki
değerini (doğruluk, süre, maliyet).

**Durum:** Aşama 1 (defter), Aşama 2 (yöntem paketi ve kurulum) ve Aşama 3 (sürücü) yazıldı. Sürücü on işlik bir listeyi Codex ve OpenCode ile
girdisiz bitirdi. Aşama 4 (uyum testleri: `mihenk uyum`) üç araçta koşuldu. Açık kalemler planda yazılı. Aşama 5: sürücü her işin süresini, token kullanımını ve (araç bildiriyorsa) dolar maliyetini deftere yazıyor. Öneri henüz yok.

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

Veri proje içinde `.mihenk/` altında durur (git dışı): `defter.db` (SQLite), `defter.jsonl` (okunur döküm), `log.jsonl` (her işlemin başla /
bitti satırı), `surucu.jsonl` (sürücünün olay kaydı), `ciktilar/` (doğrulama ve ajan çıktılarının tamamı).

**Doğrulama komutu nasıl koşar:** kabuk kullanılmaz; `&&`, boru, yönlendirme reddedilir. Program izin listesinden olmalıdır (`node`, `npm`,
`pytest`, `cargo`, `go`, `git` gibi test ve derleme araçları). Liste, proje kökündeki `mihenk.json` dosyasında `izinli_programlar` ile
değiştirilir. Bu bir kum havuzu değildir: komut sizin kullanıcı haklarınızla koşar.

Yöntemin kaynağı metamorfik projesinde uygulanan çalışma biçimidir; buraya yalın hali taşınır.
