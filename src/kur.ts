// Yontem paketini bir projeye kurar: skiller, AGENTS.md blogu ve defterin MCP kaydi.
// Yollar araclarin kendi belgelerinden dogrulandi (2026-11-19; kaynaklar docs/IS_PLANI.md "Asama 2").
// Kurulum var olan icerigi ezmez ve tekrarlanabilir: ikinci kosu hicbir sey degistirmez.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kayitOku, kayitYaz, ozet, yedekYaz } from './kaldir.js';

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

  // Kurulum kaydi: temiz kaldirma icin her dosyanin kurulumdan onceki hali ve kurulumun yazdigi icerigin ozeti (kaldir.ts).
  const kayit = kayitOku(hedef);
  const yazmadanOnce = (goreli: string, yol: string): void => {
    const g = egik(goreli);
    const k = kayit.dosyalar[g];
    const mevcut = existsSync(yol) ? readFileSync(yol) : undefined;
    if (!k) {
      kayit.dosyalar[g] = { once_vardi: mevcut !== undefined, yedek: mevcut !== undefined, ozet: '' };
      if (mevcut !== undefined) yedekYaz(hedef, g, mevcut);
    } else if (mevcut !== undefined && ozet(mevcut) !== k.ozet) {
      // Kullanici kurulumdan sonra dosyayi degistirmis: yedege donmek onun degisikligini silerdi; kaldirma bu dosyada cerrahi calisir.
      k.yedek = false;
    }
    for (let d = dirname(yol); d.startsWith(hedef) && d !== hedef && !existsSync(d); d = dirname(d)) {
      const gd = egik(relative(hedef, d));
      if (!kayit.dizinler.includes(gd)) kayit.dizinler.push(gd);
    }
  };
  const yazdiktanSonra = (goreli: string, icerik: Buffer): void => {
    kayit.dosyalar[egik(goreli)]!.ozet = ozet(icerik);
  };

  const yaz = (goreli: string, icerik: string): void => {
    const yol = join(hedef, goreli);
    if (existsSync(yol) && readFileSync(yol, 'utf8') === icerik) {
      sonuc.degismeyen.push(goreli);
      return;
    }
    yazmadanOnce(goreli, yol);
    mkdirSync(dirname(yol), { recursive: true });
    writeFileSync(yol, icerik);
    yazdiktanSonra(goreli, Buffer.from(icerik));
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
          yazmadanOnce(goreli, yol);
          mkdirSync(dirname(yol), { recursive: true });
          cpSync(kaynak, yol);
          yazdiktanSonra(goreli, icerik);
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

  // Mekanik kapi (Asama 7): oturum basi, "bitti" (Stop) ve git commit oncesi (PreToolUse) kancalari. Bicim iki aracin belgesinden:
  // Claude Code https://code.claude.com/docs/en/hooks , Codex https://developers.openai.com/codex/hooks (2026-11-20).
  // Var olan baska kancalara dokunulmaz; yalniz kapi-bin.js'i cagiran grup yenilenir.
  const kapiBin = egik(join(BURASI, 'kapi-bin.js'));
  const kancaEkle = (n: Record<string, any>, olay: string, grup: Record<string, any>): void => {
    const kancalar = (n.hooks ??= {}) as Record<string, any[]>;
    const eski = (kancalar[olay] ?? []).filter((g) => !JSON.stringify(g).includes('kapi-bin.js'));
    kancalar[olay] = [...eski, grup];
  };
  if (araclar.includes('claude')) {
    // Claude Code: kabuksuz (exec) bicim; node.exe dogrudan calisir, tirnak sorunu olmaz.
    const k = (olay: string) => ({ type: 'command', command: 'node', args: ['--disable-warning=ExperimentalWarning', kapiBin, 'claude', olay, '--kok', egik(hedef)], timeout: 30 });
    jsonGuncelle('.claude/settings.json', (n) => {
      kancaEkle(n, 'SessionStart', { hooks: [k('oturum')] });
      kancaEkle(n, 'Stop', { hooks: [k('bitir')] });
      kancaEkle(n, 'PreToolUse', { matcher: 'Bash|PowerShell', hooks: [k('arac')] });
    });
  }
  if (araclar.includes('codex')) {
    // Codex: komut kabukta (Windows'ta PowerShell ya da cmd) kosar; yalniz cift tirnakli yollar her ikisinde de calisir.
    const k = (olay: string) => {
      const komut = `node --disable-warning=ExperimentalWarning "${kapiBin}" codex ${olay} --kok "${egik(hedef)}"`;
      return { type: 'command', command: komut, commandWindows: komut, timeout: 30 };
    };
    jsonGuncelle('.codex/hooks.json', (n) => {
      kancaEkle(n, 'SessionStart', { hooks: [k('oturum')] });
      kancaEkle(n, 'Stop', { hooks: [k('bitir')] });
      kancaEkle(n, 'PreToolUse', { matcher: '^Bash$', hooks: [k('arac')] });
    });
    sonuc.uyarilar.push('Codex kancalari ancak siz onaylayinca calisir: Codex\'i bu klasorde acip /hooks ekraninda mihenk kancalarini onaylayin (kanca degisirse yeniden).');
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
    // Bu dosya en sonda kendini siler: "(goto) 2>nul & del" kalibi cmd'nin "batch file cannot be found" uyarisini onler.
    // Kaldirma (--cmd-den) bu dosyaya dokunmaz; icerik kurulumun yazdigi gibi degilse cmd de silmez.
    yaz('mihenk-kaldir.cmd', ['@echo off', 'rem mihenk: mihenk\'in bu projeye ekledigi her seyi geri alir; sizin dosyalariniza dokunmaz. Cift tiklayin.',
      `node --disable-warning=ExperimentalWarning "${cli}" kaldir --hedef "%~dp0." --cmd-den`, 'echo.', 'pause', '(goto) 2>nul & del "%~f0"', ''].join('\r\n'));
  }

  if (sonuc.yazilan.length > 0) kayitYaz(hedef, kayit);
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
