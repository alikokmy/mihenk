// MCP yuzeyi: bes arac. Kurallar burada degil defter.ts'tedir; bu dosya yalniz cevirir ve donusu sinirlar.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_INFO_META_KEY, McpServer, type CallToolResult, type ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Defter } from './defter.js';
import { Ret } from './hata.js';
import { kisalt } from './sinir.js';

export const SURUM = '0.1.0';
/** Her arac donusunun ust siniri (karakter). Fazlasi dosyaya yazilir, donuste ozet ve yol kalir (Ilke 2). */
export const DONUS_SINIRI = 4000;

const KULLANIM = [
  'mihenk defteri: yapilan isin kaydi ve kaniti burada tutulur.',
  'Sira: (1) ise baslamadan once is_ac ile kayit ac; (2) calis, gerekirse kanit_ekle ve karar_yaz; (3) bitince hukum_ver cagir.',
  'hukum_ver dogrulama komutunu SUNUCUDA kosar: is ancak komut 0 ile cikarsa "gecti" diye kapanir. "Testler gecti" demek isi kapatmaz.',
  'Dogrulama kalirsa is acik kalir: duzelt ve hukum_ver\'i yeniden cagir.',
].join('\n');

export function sunucuKur(defter: Defter): McpServer {
  const sunucu = new McpServer({ name: 'mihenk-defter', version: SURUM }, { instructions: KULLANIM });

  const donus = (arac: string, veri: unknown, hata = false): CallToolResult => {
    let metin = typeof veri === 'string' ? veri : JSON.stringify(veri, null, 1);
    if (metin.length > DONUS_SINIRI) {
      const goreli = `.mihenk/ciktilar/donus-${arac}-${Date.now()}-${process.pid}.txt`;
      let not = `[mihenk: donus ${metin.length} karakterdi, kisaltildi. Tam metin: ${goreli}]`;
      try {
        writeFileSync(join(defter.kok, goreli), metin);
      } catch {
        not = `[mihenk: donus ${metin.length} karakterdi, kisaltildi; tam metin dosyaya yazilamadi]`;
      }
      metin = `${kisalt(metin, DONUS_SINIRI - not.length - 1).metin}\n${not}`;
    }
    return { content: [{ type: 'text', text: metin }], ...(hata ? { isError: true } : {}) };
  };

  const calistir = async (arac: string, ctx: ServerContext, f: () => unknown): Promise<CallToolResult> => {
    istemci(ctx); // ilk cagrida baglanti olayi loga yazilir
    try {
      return donus(arac, await f());
    } catch (e) {
      if (e instanceof Ret) return donus(arac, `RET [${e.kod}]: ${e.message}`, true);
      return donus(arac, `HATA: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  };

  // Istemci kimligi iki yoldan gelir. Yeni cag (2026-07-28): her istegin zarfinda. Eski cag: el sikismada.
  // Kok neden (2026-11-20): yalniz ikincisi okundugu icin Antigravity'nin actigi iste istemci alani bos kalmisti.
  const gorulen = new Set<string>();
  function istemci(ctx?: ServerContext): string | undefined {
    const zarf = (ctx?.mcpReq.envelope as Record<string, unknown> | undefined)?.[CLIENT_INFO_META_KEY] as
      | { name?: string; version?: string }
      | undefined;
    const k = zarf?.name ? zarf : sunucu.server.getClientVersion();
    if (!k?.name) return undefined;
    const ad = `${k.name} ${k.version ?? ''}`.trim();
    if (!gorulen.has(ad)) {
      gorulen.add(ad);
      defter.baglantiKaydet(ad);
    }
    return ad;
  }

  sunucu.server.oninitialized = () => void istemci();

  sunucu.registerTool(
    'is_ac',
    {
      title: 'Is kaydi ac',
      description:
        'Ise BASLAMADAN once cagrilir; kayit acilmadan is baslamaz. Kisa bir kayit acar: ne soruluyor, ne bekleniyor, yanlissa ne gorulur ve ' +
        'isin bittigini hangi komut gosterir. Donen is_id oteki araclarda kullanilir. Kayit sonradan degistirilemez.',
      inputSchema: z.object({
        tur: z.string().describe('Is turu, kisa etiket: hata_duzeltme, ozellik, yeniden_duzenleme, test, belge, arastirma, yapilandirma gibi'),
        soru: z.string().describe('Yapilacak is ya da yanitlanacak soru (en fazla 1000 karakter)'),
        beklenti: z.string().describe('Is dogru yapilinca ne gorulecek'),
        yanlissa: z.string().describe('Yaklasim yanlissa ne gorulur (yanlislama olcutu)'),
        dogrulama_komutu: z
          .string()
          .optional()
          .describe(
            'Isin bittigini gosteren tek komut (hukum vitesinde zorunlu), or. "npm test" ya da "pytest -q tests/test_x.py". Proje kokunde, kabuksuz kosar: ' +
              '&&, |, >, $ gibi kabuk karakterleri ve izin listesi disindaki programlar reddedilir.',
          ),
        ajan: z.string().describe('Isi yuruten ajan araci, or. claude-code, codex, gemini-cli'),
        model: z.string().describe('Kullanilan model kimligi'),
        zaman_asimi_sn: z.number().int().optional().describe('Dogrulama komutunun zaman asimi, saniye (varsayilan 120)'),
        vites: z.enum(['kesif', 'hukum']).optional().describe('hukum (varsayilan): tam yontem, dogrulama komutu zorunlu. kesif: hafif kayit (soru, beklenti, yanlissa); komut istege bagli; komutsuz kesif "gecti" diye kapanmaz ve oneride basari sayilmaz.'),
        aile: z.string().optional().describe('Is ailesi adi: birbirine bagli isler (ayni kok neden, birbirini gerektiren parcalar) tek aile olarak birlikte yapilir. Verilirse bolme_plani zorunlu.'),
        bolme_plani: z.string().optional().describe('Aile isi icin: sonuc kotu cikarsa aileyi hangi iki parcaya bolersiniz.'),
        zorluk: z.enum(['kolay', 'orta', 'zor']).optional().describe('Isin zorlugu, durust tahmin: kolay, orta ya da zor. Oneri hesabi ajanlari ayni zorluk karisiminda karsilastirir.'),
      }),
    },
    (g, ctx) =>
      calistir('is_ac', ctx, async () => {
        const kimlik = istemci(ctx);
        const is = defter.isAc({ ...g, ...(kimlik ? { istemci: kimlik } : {}) });
        // Bos kanit bekcisi: ajan dosyaya dokunmadan once dogrulama bir kez kosulur (yanit bu bitince doner).
        const b = await defter.baslangicDogrula(is.id);
        return {
          is_id: is.id, durum: is.durum, dogrulama_komutu: is.dogrulama_komutu, zaman_asimi_sn: is.zaman_asimi_sn,
          ...(b.kosuldu ? { baslangic_dogrulamasi: b.gecti ? 'GECTI (is baslamadan): bu komut yapacaginiz degisikligi olcmuyor olabilir; daha iyi bir dogrulama icin isi kaldi diye kapatip yeni kayit acin' : 'kaldi (beklenen)' } : {}),
          mesaj: `Kayit acildi. Is bitince hukum_ver(is_id=${is.id}) cagirin; dogrulamayi sunucu kosar.`,
        };
      }),
  );

  sunucu.registerTool(
    'kanit_ekle',
    {
      title: 'Kanit / not ekle',
      description:
        'Acik bir ise ajanin notunu ekler (gozlem, olcum, ara sonuc). Bu bir BEYANDIR: kayda "ajan" kaynagiyla girer ve hukmu etkilemez. ' +
        'Isi kapatan tek sey hukum_ver\'in kostugu dogrulamadir.',
      inputSchema: z.object({
        is_id: z.number().int().describe('is_ac\'in dondurdugu numara'),
        icerik: z.string().describe('Not (en fazla 4000 karakter)'),
      }),
    },
    (g, ctx) => calistir('kanit_ekle', ctx, () => defter.kanitEkle(g)),
  );

  sunucu.registerTool(
    'karar_yaz',
    {
      title: 'Karar notu yaz',
      description:
        'Karar gereken yerde durmak yerine onerilen secenegi uygula ve karari buraya yaz: secenekler, secilen ve en guclu karsi gorus. ' +
        'Kullanici sonradan okuyup veto edebilir.',
      inputSchema: z.object({
        is_id: z.number().int().describe('is_ac\'in dondurdugu numara'),
        konu: z.string().describe('Neye karar verildi'),
        secenekler: z.array(z.string()).describe('Degerlendirilen secenekler (en az iki)'),
        secilen: z.string().describe('Uygulanan secenek'),
        karsi_gorus: z.string().describe('Secilene karsi en guclu gorus'),
      }),
    },
    (g, ctx) => calistir('karar_yaz', ctx, () => defter.kararYaz(g)),
  );

  sunucu.registerTool(
    'hukum_ver',
    {
      title: 'Hukum ver (dogrulamayi sunucu kosar)',
      description:
        'Is bittiginde cagrilir. Kayittaki dogrulama komutunu sunucu kosar; cikis kodu, sure ve cikti ozeti deftere yazilir. ' +
        'Komut 0 ile cikarsa is "gecti" diye kapanir; cikmazsa is ACIK KALIR, duzeltip yeniden cagirin. ' +
        'Vazgecilen is icin hukum="kaldi", dogrulamanin isi olcmedigi durumda hukum="belirsiz" verin; ikisi de gerekce ister.',
      inputSchema: z.object({
        is_id: z.number().int().describe('is_ac\'in dondurdugu numara'),
        hukum: z.string().optional().describe('gecti (varsayilan), kaldi ya da belirsiz'),
        gerekce: z.string().optional().describe('kaldi ve belirsiz icin zorunlu: neden'),
      }),
    },
    (g, ctx) =>
      calistir('hukum_ver', ctx, async () => {
        const h = await defter.hukumVer({
          is_id: g.is_id,
          ...(g.hukum === undefined ? {} : { hukum: g.hukum as never }),
          ...(g.gerekce === undefined ? {} : { gerekce: g.gerekce }),
        });
        // mesaj basta: donus kesilirse bile ajan once sonucu okur.
        const { mesaj, ...gerisi } = h;
        return { mesaj, ...gerisi };
      }),
  );

  sunucu.registerTool(
    'rapor',
    {
      title: 'Defter raporu',
      description:
        'Defterin durumunu doner. is_id verilirse o isin kaydi, kanitlari ve kararlari; verilmezse durum sayilari ve son isler listesi. ' +
        'Oturum basinda acik isleri gormek icin durum="acik" ile cagirin.',
      inputSchema: z.object({
        is_id: z.number().int().optional().describe('Tek isin ayrintisi icin'),
        durum: z.string().optional().describe('Liste suzgeci: acik, gecti, kaldi, belirsiz'),
        sinir: z.number().int().optional().describe('Listelenecek en fazla is (varsayilan 20, en fazla 100)'),
      }),
    },
    (g, ctx) =>
      calistir('rapor', ctx, () =>
        defter.rapor({
          ...(g.is_id === undefined ? {} : { is_id: g.is_id }),
          ...(g.durum === undefined ? {} : { durum: g.durum as never }),
          ...(g.sinir === undefined ? {} : { sinir: g.sinir }),
        }),
      ),
  );

  return sunucu;
}
