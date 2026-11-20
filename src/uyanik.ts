// Uzun liste kosarken bilgisayarin uyumasi isi durdurur. Bu dosya iki sey yapar:
//   1) isletim sisteminde uyku acik mi, okur (uyari icin);
//   2) kullanici isterse, surucu calisirken sistemi uyanik tutar.
// Yalniz Windows icin yazildi ve denendi. Baska sistemde denenmemis kod yok: orada "desteklenmiyor" denir.
// Windows yolu: SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED), kernel32.dll. Kaynak (2026-11-20 okundu):
// learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate
// Belgeye gore: durum cagiran is parcacigina aittir; yonetici izni istemez; kullanicinin bilgisayari elle uyutmasini
// (kapak, guc dugmesi) ENGELLEMEZ. Bu yuzden cagriyi yapan kucuk bir yardimci surec surucu boyunca ayakta tutulur.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { t } from './dil.js';

export interface UykuAyari {
  /** Prizdeyken bosta kalinca uykuya gecme suresi (saniye); 0 = hic uyumaz. */
  priz_sn: number;
  /** Pildeyken ayni sure. */
  pil_sn: number;
}

/** `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE` ciktisindan iki sureyi okur. Cikti dile gore degisir; yalniz onaltilik degerler okunur. */
export function uykuAyariniCoz(cikti: string): UykuAyari | null {
  const degerler = [...cikti.matchAll(/Power Setting Index:\s*0x([0-9a-fA-F]+)/g)].map((m) => parseInt(m[1] as string, 16));
  let ikili = degerler;
  if (ikili.length < 2) {
    // Ingilizce olmayan Windows: satir metni cevrilmis olur; son iki onaltilik deger yine AC ve DC'dir.
    ikili = [...cikti.matchAll(/:\s*0x([0-9a-fA-F]{8})\s*$/gm)].map((m) => parseInt(m[1] as string, 16)).slice(-2);
  }
  if (ikili.length < 2) return null;
  return { priz_sn: ikili[ikili.length - 2] as number, pil_sn: ikili[ikili.length - 1] as number };
}

export function uykuAyariniOku(): UykuAyari | null {
  if (process.platform !== 'win32') return null;
  const r = spawnSync('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? uykuAyariniCoz(r.stdout) : null;
}

/** Kullaniciya gosterilecek uyari; uyku kapaliysa ya da ayar okunamadiysa null. */
export function uykuUyarisi(ayar: UykuAyari | null): string | null {
  if (!ayar || (ayar.priz_sn === 0 && ayar.pil_sn === 0)) return null;
  const dk = (sn: number): string => (sn === 0 ? t('u_hic') : t('u_dakika', { dk: Math.round(sn / 60) }));
  return (
    t('u_uyari', { priz: dk(ayar.priz_sn), pil: dk(ayar.pil_sn) })
  );
}

export interface UyanikTutucu {
  durdur(): void;
}

const ES_CONTINUOUS_VE_SYSTEM_REQUIRED = '0x80000001'; // ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001)

/**
 * Sistemi uyanik tutan yardimci sureci baslatir. Yardimci, cagriyi yapar, "TAMAM" ya da "HATA" yazar ve
 * `sahipPid` (surucu) yasadigi surece bekler; surucu olurse kendiliginden kapanir.
 */
export function uyanikTut(sahipPid: number = process.pid): Promise<{ tamam: boolean; not: string; tutucu: UyanikTutucu }> {
  const bos: UyanikTutucu = { durdur: () => undefined };
  if (process.platform !== 'win32') {
    return Promise.resolve({ tamam: false, not: t('u_desteklenmiyor'), tutucu: bos });
  }
  const betik = [
    "$imza = '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'",
    "$tip = Add-Type -MemberDefinition $imza -Name Guc -Namespace Mihenk -PassThru",
    `$onceki = $tip::SetThreadExecutionState([uint32]${ES_CONTINUOUS_VE_SYSTEM_REQUIRED})`,
    "if ($onceki -eq 0) { 'HATA'; exit 1 }",
    "'TAMAM'",
    `try { Wait-Process -Id ${sahipPid} -ErrorAction Stop } catch { }`,
  ].join('; ');
  let cocuk: ChildProcess;
  try {
    cocuk = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', betik], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  } catch (e) {
    return Promise.resolve({ tamam: false, not: t('u_baslatilamadi', { hata: e instanceof Error ? e.message : String(e) }), tutucu: bos });
  }
  const tutucu: UyanikTutucu = { durdur: () => void cocuk.kill() };
  return new Promise((coz) => {
    let cozuldu = false;
    const bitir = (tamam: boolean, not: string): void => {
      if (cozuldu) return;
      cozuldu = true;
      coz({ tamam, not, tutucu: tamam ? tutucu : bos });
    };
    let metin = '';
    cocuk.stdout?.on('data', (d: Buffer) => {
      metin += d.toString();
      if (metin.includes('TAMAM')) bitir(true, 'bilgisayar liste bitene dek uyanik tutuluyor (kapagi kapatmak ya da guc dugmesi yine uyutur)');
      else if (metin.includes('HATA')) bitir(false, 'uyanik tutma istegi isletim sistemince reddedildi');
    });
    cocuk.on('error', (e) => bitir(false, `uyanik tutma baslatilamadi: ${e.message}`));
    cocuk.on('exit', () => bitir(false, 'uyanik tutma yardimcisi beklenmedik bicimde kapandi'));
    setTimeout(() => bitir(false, 'uyanik tutma yardimcisi 20 saniyede yanit vermedi'), 20_000).unref();
  });
}
