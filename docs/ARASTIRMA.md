# Araştırma: benzer açık kaynak projeler (2026-11-19)

**Soru:** metamorfik'te uyguladığımız çalışma yöntemini (önce kayıt, ucuz denetim, bağımsız doğrulama, log, mekanik kapı) farklı kodlama
ajanlarında çalıştıran ve işi ajanlara maliyet / süre / doğruluğa göre dağıtmayı öneren hazır bir depo var mı? Varsa kullanalım ya da çatallayalım.

**Kısa yanıt:** tek başına işimizi gören depo yok. Yöntemin yaklaşık yarısı ve maliyet ölçümü hazır ve olgun; ikisini birbirine bağlayan parça
(doğrulanmış sonuca göre ajan / model önerisi) hiçbir depoda yok. Çatallamak yerine hazır olanları kullanıp eksik parçayı ince bir katman olarak
yazmak doğru yol.

**Yöntem ve sınırlar:**
- 50'ye yakın depo GitHub API'siyle doğrulandı (yıldız, son güncelleme, lisans); 30'unun README'si aşağıdaki denetim listesine göre okundu.
- Okuma README düzeyindedir. "Yok" = README'de yok; alt belgelerde olabilir. Hiçbir depo kurulmadı ya da çalıştırılmadı.
- Yıldız sayıları 2026-11-19 anıdır ve kalite kanıtı değildir.
- Alan çok hızlı değişiyor; bu tablo birkaç ayda eskir.

## 1. Aradığımız özellikler

| Kod | Özellik | metamorfik'teki karşılığı |
|---|---|---|
| A | Çapraz ajan: Claude Code, Codex, Gemini CLI / Antigravity, Qwen Code, OpenCode, VS Code eklentileri | yok (yalnız Claude Code) |
| B | İşten önce kayıt: plan, kabul ölçütü, "yanlışsa ne görürüz" | ön kayıt |
| C | Doğrulama: test, bağımsız doğrulayıcı, çürütücü rol, kanıt olmadan "bitti" yok | KP18, hüküm, mutant |
| D | Mekanik zorlama: eylemi gerçekten engelleyen kanca / kapı | `.claude/settings.json` kancaları |
| E | Kayıt: yapılandırılmış log, karar izi | günlük, karar defteri |
| F | İş başına maliyet ve süre ölçümü | yok (elle not) |
| G | Ajan / model başına ölçülmüş başarı | yok |
| H | Göreve göre ajan / model önerisi; kullanıcı her zaman elle seçebilir | "model ve kota" kuralı (elle) |

## 2. Bulunanlar

### 2.1 Yöntem çerçeveleri (B, C tarafı)

| Depo | Yıldız | Lisans | A | B | C | D | E | F-H |
|---|---|---|---|---|---|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | 322 bin | MIT | 16 araç (Qwen, Antigravity, OpenCode dahil) | tasarım + plan | TDD, kanıt önce, kök neden, alt ajanla iki aşamalı inceleme | yalnız oturum başı kancası | oturum teşhisi | yok |
| [affaan-m/ECC](https://github.com/affaan-m/ECC) | 307 bin | MIT | ~10 araç | plan skill'leri | TDD, doğrulama döngüsü, başka sağlayıcıya inceletme | kanca (araca göre) | oturum özeti, öğrenilen "içgüdü" | maliyet yalnız anlatım |
| [github/spec-kit](https://github.com/github/spec-kit) | 151 bin | MIT | çok araç | anayasa → belirtim → plan → görev | kısmen | uzantı kancaları | rapor dosyaları | yok |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 75 bin | MIT | 30+ araç | öneri + senaryo | isteğe bağlı doğrulama | yok | arşiv | yok |
| [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | 26 bin | MIT | 14 ortam | beyin fırtınası + plan | çok ajanlı inceleme, bağımsız model görüşü | yok | ders dosyaları (`docs/solutions/`) | yok |
| [gotalab/cc-sdd](https://github.com/gotalab/cc-sdd) | 3,8 bin | MIT | 8 ajan | gereksinim → tasarım → görev | TDD, bağımsız inceleyici | yok | görev notları | yok |
| [loopx-project/loopx](https://github.com/loopx-project/loopx) | 6,7 bin | Apache-2.0 | birkaç koşucu | "Done when" ölçütü | kanıt + karar kaydı, kapılar | kuyruk ve kapılar | hedef / karar / kanıt SQLite'ta | model önerisi yok |

Ortak eksikler (yedi depoda da): yanlışlama ölçütü, taze veride hüküm, mutasyon testi, iş başına maliyet, model başarı istatistiği. Kural
zorlaması çoğunda yalnız istem metnidir; superpowers README'si "skill ateşlenmezse sessiz kalır" sorununa ayrı bölüm ayırıyor.

### 2.2 Maliyet ölçümü ve model yönlendirme (F, G, H tarafı)

| Depo | Yıldız | Lisans | Ne yapıyor | Eksik |
|---|---|---|---|---|
| [getagentseal/codeburn](https://github.com/getagentseal/codeburn) | 11,9 bin | MIT | 37 aracın oturum dosyalarından model / proje / görev başına maliyet; iki modeli kendi geçmişinde kıyaslar (tek seferde başarı, yeniden deneme oranı); harcamanın birleşen PR'a giden payı; MCP sunucusu; Claude Code'da bütçe kancası | başarı ölçüleri vekil; öneri üretmiyor |
| [ccusage/ccusage](https://github.com/ccusage/ccusage) | 19,5 bin | belirsiz | 20 kaynaktan token ve maliyet raporu | kaliteyle bağ yok |
| [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) | 38 bin | MIT | yerel vekil sunucu; elle yazılan kurallarla modele yönlendirme, yedek model, maliyet tahmini | kaliteyi ölçmez; kural insan işi |
| [ulab-uiuc/LLMRouter](https://github.com/ulab-uiuc/LLMRouter) | 3,1 bin | MIT | 16+ öğrenilmiş yönlendirici (kNN, matris ayrışımı, maliyet bilinçli) | akademik kıyas verisiyle eğitilir; kodlama ajanına bağlı değil |
| [katanemo/plano](https://github.com/katanemo/plano) | 7,1 bin | Apache-2.0 | vekil sunucu; küçük bir modelle niyete göre yönlendirme | görev doğruluğuna göre ayarlı değil |
| [felan-ai/felan](https://github.com/felan-ai/felan) | 21 | MIT | "tasarruf yalnız görev yine başarılıysa sayılır" ilkesi; doğrulanmış görev başına maliyet | kendi ajanı; başka araca takılmıyor; çok küçük |

### 2.3 Çok ajanlı yönetim ve kapılar (A, D tarafı)

| Depo | Yıldız | Lisans | Ne yapıyor | Eksik |
|---|---|---|---|---|
| [omnigent-ai/omnigent](https://github.com/omnigent-ai/omnigent) | 11,4 bin | Apache-2.0 | 15+ ajanı tek oturumda yönetir; diff'i yazandan farklı satıcının ajanına inceletir; harcama tavanı politikası | alfa; ölçüm ve öneri yok; kurallar elle kurulur |
| [coleam00/Archon](https://github.com/coleam00/Archon) | 24 bin | MIT | YAML iş akışı; test geçene dek döngü; birleştirme kapısı; koşu başına maliyet | Claude, Codex, Pi; model seçimi öğrenmez |
| [OrchestratorInc/agent-orchestrator](https://github.com/OrchestratorInc/agent-orchestrator) | 14,9 bin | Apache-2.0 | görev başına ajan, dal, çalışma kopyası; CI ve inceleyici döngüsü | ölçüm ve öneri yok |
| [nizos/tdd-guard](https://github.com/nizos/tdd-guard) | 2,4 bin | MIT | dosya düzenlemeyi kancayla gerçekten engelleyen TDD bekçisi | yalnız Claude Code; kabuk komutuyla atlanabilir |
| [BeehiveInnovations/pal-mcp-server](https://github.com/BeehiveInnovations/pal-mcp-server) | 11,8 bin | belirsiz | MCP sunucusu: çoklu model uzlaşısı, kod inceleme, commit öncesi denetim | 11 aydır güncellenmiyor; maliyet yok |
| [intellectronica/ruler](https://github.com/intellectronica/ruler) | 3,0 bin | MIT | tek dizinden kural, MCP ayarı ve skill'leri 20+ araca dağıtır | yalnız metin dağıtır |

Not edilenler:
- [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) Mayıs 2026'da arşivlenmiş. VS Code tarafında yaşayan hedefler
  [Kilo Code](https://github.com/Kilo-Org/kilocode) ve [Cline](https://github.com/cline/cline).
- [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) kapatılıyor. goose'un otomatik "lead / worker" yönlendirmesi kaldırılmış.
- ruflo "%89 yönlendirme doğruluğu" diyor; ölçütü ve verisi README'de yok.

## 3. Özellik başına durum

| Özellik | Hazır var mı | En iyi kaynak |
|---|---|---|
| A çapraz ajan | var | Agent Skills (`.agents/skills/*/SKILL.md`), AGENTS.md, MCP; dağıtım için ruler |
| B işten önce kayıt | kısmen | superpowers, cc-sdd, loopx (plan ve kabul ölçütü var; yanlışlama ölçütü yok) |
| C doğrulama | kısmen | superpowers, ECC, omnigent (bağımsız inceleme var; çürütücü, taze veri, mutant yok) |
| D mekanik zorlama | kısmen | tdd-guard, CodeBurn guard, ECC kancaları (araca özgü, çoğu yalnız Claude Code) |
| E kayıt | kısmen | loopx (kanıt ve karar kaydı), gastown (olay günlüğü) |
| F maliyet ve süre | var | CodeBurn, ccusage |
| G ölçülmüş başarı | zayıf | CodeBurn (vekil ölçü: tek seferde başarı, birleşen PR payı) |
| H ajan / model önerisi | **yok** | hiçbiri: yönlendiriciler ya elle kural ya akademik veri kullanıyor |

## 4. Hüküm

1. **Doğrudan kullanılabilecek tek depo yok.**
2. **Çatallamak için uygun aday yok.** En yakın iki depo farklı katmanlarda: superpowers yöntem içeriği (yeni skill katkısı kabul etmiyor,
   16 araçlık kurulum yüzeyini sürdürmek ağır), CodeBurn maliyet ölçümü (doğrulama kavramı yok). Birini çatallamak ötekinin işini çözmez.
3. **Eksik parça net ve küçük:** doğrulama kapısından geçen / geçmeyen iş kaydını maliyet ve süreyle birleştirip iş türü başına ajan / model
   önermek. Buna en yakın fikir felan'da ("doğrulanmış görev başına maliyet") ama o kendi ajanına gömülü.
4. **Önerilen yol:** hazır olanı bağımlılık ya da yan kurulum olarak kullan, eksik katmanı yaz (bkz. [IS_PLANI.md](IS_PLANI.md)).
   - yöntem için kendi küçük skill paketimiz (Agent Skills biçimi; superpowers ile yan yana kurulabilir);
   - ajanların bağlanacağı "API" olarak bir MCP sunucusu: iş defteri, kanıt, hüküm, öneri;
   - maliyet verisi için CodeBurn ya da ccusage çıktısı;
   - çok ajanlı yürütme gerekirse önce omnigent ya da ajanların kendi başsız kipleri.

**Bu hüküm neden yanlış olabilir:**
- README okuması yüzeyseldir; özellikle ECC, omnigent ve loopx'in alt belgelerinde aradığımız özelliklerden biri olabilir.
- 300 bin yıldızlı projeler aylar içinde maliyet ve öneri katmanını ekleyebilir; o zaman yazdığımız katman gereksizleşir.
- Hiçbir depoyu çalıştırmadım. İlk adımda superpowers + CodeBurn bir hafta gerçek işte denenirse ihtiyacın bir kısmının zaten
  karşılandığı görülebilir.

## 5. "API" derken ne kuracağız

Bu araçların ortak dili HTTP değil, üç açık biçimdir:

| Biçim | Ne taşır | Kimler okur |
|---|---|---|
| **MCP sunucusu** | ajanın çağırdığı araçlar (iş aç, kanıt ekle, hüküm ver, öneri al) | taranan araçların hepsi |
| **Agent Skills** (`SKILL.md`) | yöntemin kendisi: ne zaman, hangi adımla | Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode, Antigravity, Cursor, Copilot |
| **AGENTS.md** | her oturuma giren kısa kurallar | Codex, OpenCode, Gemini CLI ve çoğu araç; Claude Code'da `CLAUDE.md` |

Kanca desteği araçlar arasında en tutarsız alandır; mekanik zorlama araç başına ayrı uyarlama ister ve her araçta mümkün olmayabilir.
Model çağrısı düzeyinde yönlendirme (vekil sunucu) ayrı bir yoldur ve abonelikle çalışan araçlarda uygulanamayabilir; ilk sürümde yok.
