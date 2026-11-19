// Yontem paketini bir projeye kurar: skiller, AGENTS.md blogu ve defterin MCP kaydi.
// Yollar araclarin kendi belgelerinden dogrulandi (2026-11-19; kaynaklar docs/IS_PLANI.md "Asama 2").
// Kurulum var olan icerigi ezmez ve tekrarlanabilir: ikinci kosu hicbir sey degistirmez.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Arac = 'claude' | 'codex' | 'gemini' | 'antigravity' | 'opencode';
export const ARACLAR: readonly Arac[] = ['claude', 'codex', 'gemini', 'antigravity', 'opencode'];

export interface KurSecenekleri {
  araclar?: readonly Arac[];
  /** Paketin kaynagi; varsayilan bu deponun paket/ dizini. */
  paketDizini?: string;
  /** Defter sunucusunun giris dosyasi; varsayilan bu deponun dist/src/bin.js dosyasi. */
  sunucuYolu?: string;
}

export interface KurSonucu {
  yazilan: string[];
  degismeyen: string[];
  uyarilar: string[];
}

const BURASI = dirname(fileURLToPath(import.meta.url)); // dist/src
const egik = (yol: string): string => yol.replace(/\\/g, '/');

export function kur(hedefDizin: string, secenek: KurSecenekleri = {}): KurSonucu {
  const hedef = resolve(hedefDizin);
  const araclar = secenek.araclar ?? ARACLAR;
  const paket = secenek.paketDizini ?? resolve(BURASI, '..', '..', 'paket');
  const sunucu = secenek.sunucuYolu ?? join(BURASI, 'bin.js');
  const sonuc: KurSonucu = { yazilan: [], degismeyen: [], uyarilar: [] };
  const mcpKaydi = { command: 'node', args: [egik(sunucu), '--kok', egik(hedef)] };

  const yaz = (goreli: string, icerik: string): void => {
    const yol = join(hedef, goreli);
    if (existsSync(yol) && readFileSync(yol, 'utf8') === icerik) {
      sonuc.degismeyen.push(goreli);
      return;
    }
    mkdirSync(dirname(yol), { recursive: true });
    writeFileSync(yol, icerik);
    sonuc.yazilan.push(goreli);
  };

  const oku = (goreli: string): string | undefined => {
    const yol = join(hedef, goreli);
    return existsSync(yol) ? readFileSync(yol, 'utf8') : undefined;
  };

  const jsonGuncelle = (goreli: string, degistir: (nesne: Record<string, any>) => void): void => {
    const eski = oku(goreli);
    let nesne: Record<string, any> = {};
    if (eski !== undefined && eski.trim() !== '') {
      try {
        nesne = JSON.parse(eski) as Record<string, any>;
      } catch (e) {
        throw new Error(`${goreli} gecerli JSON degil; dokunulmadi. Once dosyayi duzeltin. (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    degistir(nesne);
    yaz(goreli, JSON.stringify(nesne, null, 2) + '\n');
  };

  const blokGuncelle = (goreli: string, bas: string, son: string, govde: string): void => {
    const blok = `${bas}\n${govde.trim()}\n${son}\n`;
    const eski = oku(goreli);
    if (eski === undefined) return yaz(goreli, blok);
    const i = eski.indexOf(bas);
    const j = eski.indexOf(son);
    if (i >= 0 && j > i) return yaz(goreli, eski.slice(0, i) + blok + eski.slice(j + son.length).replace(/^\n/, ''));
    yaz(goreli, eski.replace(/\n*$/, '\n\n') + blok);
  };

  const skilleriKur = (goreliDizin: string): void => {
    for (const d of readdirSync(join(paket, 'skills'), { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      for (const dosya of readdirSync(join(paket, 'skills', d.name), { recursive: true, withFileTypes: true })) {
        if (!dosya.isFile()) continue;
        const kaynak = join(dosya.parentPath, dosya.name);
        const goreli = join(goreliDizin, d.name, kaynak.slice(join(paket, 'skills', d.name).length + 1));
        const icerik = readFileSync(kaynak);
        const yol = join(hedef, goreli);
        if (existsSync(yol) && readFileSync(yol).equals(icerik)) {
          sonuc.degismeyen.push(egik(goreli));
        } else {
          mkdirSync(dirname(yol), { recursive: true });
          cpSync(kaynak, yol);
          sonuc.yazilan.push(egik(goreli));
        }
      }
    }
  };

  // Her oturuma giren kisa blok: Codex ve Antigravity AGENTS.md'yi dogrudan okur.
  blokGuncelle('AGENTS.md', '<!-- mihenk:basla -->', '<!-- mihenk:bitti -->', readFileSync(join(paket, 'AGENTS.md'), 'utf8'));

  // Codex, Gemini CLI ve Antigravity ortak .agents/skills dizinini okur (OpenCode icin belgeden dogrulanmadi; denemede bakilacak).
  if (araclar.some((a) => a !== 'claude')) skilleriKur('.agents/skills');

  if (araclar.includes('claude')) {
    skilleriKur('.claude/skills'); // Claude Code yalniz .claude/skills okur.
    jsonGuncelle('.mcp.json', (n) => {
      n.mcpServers = { ...(n.mcpServers ?? {}), mihenk: mcpKaydi };
    });
    // Claude Code, CLAUDE.md varken AGENTS.md'yi kendiliginden okumaz: icerme satiri gerekir.
    const claudeMd = oku('CLAUDE.md');
    if (claudeMd === undefined) yaz('CLAUDE.md', '@AGENTS.md\n');
    else if (!/^@AGENTS\.md\s*$/m.test(claudeMd)) yaz('CLAUDE.md', claudeMd.replace(/\n*$/, '\n\n') + '@AGENTS.md\n');
    else sonuc.degismeyen.push('CLAUDE.md');
  }

  if (araclar.includes('codex')) {
    const bas = '# mihenk:basla (mihenk kur yazar)';
    const son = '# mihenk:bitti';
    const eski = oku('.codex/config.toml') ?? '';
    const blokDisi = eski.includes(bas) ? eski.slice(0, eski.indexOf(bas)) + eski.slice(eski.indexOf(son) + son.length) : eski;
    if (/^\[mcp_servers\.mihenk\]/m.test(blokDisi)) {
      sonuc.uyarilar.push('.codex/config.toml icinde elle yazilmis [mcp_servers.mihenk] var; dokunulmadi.');
    } else {
      const args = mcpKaydi.args.map((a) => JSON.stringify(a)).join(', ');
      blokGuncelle('.codex/config.toml', bas, son, `[mcp_servers.mihenk]\ncommand = "node"\nargs = [${args}]`);
    }
  }

  if (araclar.includes('gemini')) {
    jsonGuncelle('.gemini/settings.json', (n) => {
      n.mcpServers = { ...(n.mcpServers ?? {}), mihenk: mcpKaydi };
      // Gemini CLI varsayilan olarak GEMINI.md okur; AGENTS.md icin context.fileName gerekir.
      const baglam = (n.context ??= {}) as Record<string, any>;
      const adlar: string[] = baglam.fileName === undefined ? ['GEMINI.md'] : [baglam.fileName].flat().map(String);
      if (!adlar.includes('AGENTS.md')) adlar.push('AGENTS.md');
      baglam.fileName = adlar;
    });
  }

  if (araclar.includes('antigravity')) {
    // Antigravity (kurulu 44.9.1 surumunun kendi belgesi): MCP sunucusu ya kullanicinin kuresel ayarinda ya da bir eklentinin icinde
    // tanimlanir. Kuresel ayara dokunmamak icin proje icinde kucuk bir eklenti yazilir: .agents/plugins/mihenk/.
    jsonGuncelle('.agents/plugins/mihenk/plugin.json', (n) => {
      n.name = 'mihenk';
    });
    jsonGuncelle('.agents/plugins/mihenk/mcp_config.json', (n) => {
      n.mcpServers = { ...(n.mcpServers ?? {}), mihenk: mcpKaydi };
    });
  }

  if (araclar.includes('opencode')) {
    // OpenCode 2.3.2: bicim aracin kendi "opencode mcp add" komutunun yazdigi dosyadan okundu (mcp.servers.<ad>, type local, command dizisi).
    jsonGuncelle('opencode.json', (n) => {
      const mcp = (n.mcp ??= {}) as Record<string, any>;
      mcp.servers = { ...(mcp.servers ?? {}), mihenk: { type: 'local', command: [mcpKaydi.command, ...mcpKaydi.args] } };
    });
  }

  // Defter klasoru projeyle birlikte saklanmaz.
  const yoksay = oku('.gitignore') ?? '';
  if (/^\.mihenk\/?\s*$/m.test(yoksay)) sonuc.degismeyen.push('.gitignore');
  else yaz('.gitignore', `${yoksay}${yoksay === '' || yoksay.endsWith('\n') ? '' : '\n'}.mihenk/\n`);

  // Surucu icin ornek is listesi: kullanici kopyalayip mihenk-isler.json adiyla duzenler.
  yaz('mihenk-isler.ornek.json', JSON.stringify(ORNEK_LISTE, null, 2) + '\n');

  // Tek adimda baslatma (Ilke 3): Windows'ta cift tiklanir dosya. Baska sistemde denenmedigi icin yazilmaz.
  if (process.platform === 'win32') {
    const cli = egik(join(BURASI, 'cli.js'));
    yaz('mihenk-baslat.cmd', ['@echo off', 'rem mihenk: is listesini (mihenk-isler.json) yurutur. Cift tiklayin.', `node --disable-warning=ExperimentalWarning "${cli}" sur --hedef "%~dp0."`, 'echo.', 'pause', ''].join('\r\n'));
  }

  return sonuc;
}

const ORNEK_LISTE = {
  aciklama: 'Bu dosyayi mihenk-isler.json adiyla kopyalayip duzenleyin. Her is icin: ne yapilacak (soru), dogru yapilinca ne gorulur (beklenti), yanlissa ne gorulur (yanlissa) ve isin bittigini gosteren tek komut (dogrulama_komutu).',
  ajan: 'codex',
  saklama: 'yerel',
  uyanik_tut: false,
  isler: [
    {
      tur: 'hata_duzeltme',
      soru: 'npm test kaliyor; hatayi bul ve duzelt.',
      beklenti: 'npm test gecer.',
      yanlissa: 'npm test yine kalir.',
      dogrulama_komutu: 'npm test',
    },
  ],
};
