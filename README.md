# mihenk

Kodlama ajanlarının bağlandığı, işi kayda alan, kanıtı kendisi denetleyen, iş listesini kesintisiz yürüten ve hangi işin hangi ajana verileceğini
ölçerek öneren ince bir katman.

Ad: mihenk taşı, altının ayarını sınamak için kullanılan taştır. Proje iki şeyi sınar: yapılan işin doğruluğunu ve işi yapan ajanın o iş türündeki
değerini (doğruluk, süre, maliyet).

**Durum:** Aşama 1 (defter çekirdeği) ve Aşama 2 (yöntem paketi ve kurulum) tamam: Claude Code, Codex CLI ve OpenCode gerçek bir küçük görevde
defteri kullandı; Antigravity de kullandı ama bir ölçümü eksik kaldı. Sürücü ve öneri henüz yok.

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

Veri proje içinde `.mihenk/` altında durur (git dışı): `defter.db` (SQLite), `defter.jsonl` (okunur döküm), `log.jsonl` (her işlemin başla /
bitti satırı), `ciktilar/` (doğrulama çıktılarının tamamı).

**Doğrulama komutu nasıl koşar:** kabuk kullanılmaz; `&&`, boru, yönlendirme reddedilir. Program izin listesinden olmalıdır (`node`, `npm`,
`pytest`, `cargo`, `go`, `git` gibi test ve derleme araçları). Liste, proje kökündeki `mihenk.json` dosyasında `izinli_programlar` ile
değiştirilir. Bu bir kum havuzu değildir: komut sizin kullanıcı haklarınızla koşar.

Yöntemin kaynağı metamorfik projesinde uygulanan çalışma biçimidir; buraya yalın hali taşınır.
