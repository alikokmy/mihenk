// Windows bildirimi (Asama 14): liste bitince ya da durunca. Yonetici izni istemez: Windows PowerShell'in kendi uygulama kimligiyle
// bildirim (toast) gosterilir. Baska isletim sisteminde ya da gosterilemezse durust "gosterilemedi" doner; liste etkilenmez.
import { spawnSync } from 'node:child_process';

export interface BildirimSonucu {
  gosterildi: boolean;
  not: string;
}

const XML = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** PowerShell betigi: metin ortam degiskenlerinden okunur (komut satirina kacis sorunu olmaz). */
const BETIK = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$env:MIHENK_BASLIK</text><text>$env:MIHENK_METIN</text></binding></visual></toast>")
$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($x))
'tamam'
`;

export function bildir(baslik: string, metin: string): BildirimSonucu {
  if (process.platform !== 'win32') return { gosterildi: false, not: 'bildirim yalniz Windows icin yazildi' };
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', BETIK], {
    encoding: 'utf8', timeout: 20_000, windowsHide: true,
    env: { ...process.env, MIHENK_BASLIK: XML(baslik.slice(0, 120)), MIHENK_METIN: XML(metin.slice(0, 400)) },
  });
  if (r.status === 0 && /tamam/.test(r.stdout ?? '')) return { gosterildi: true, not: 'Windows bildirimi gonderildi' };
  return { gosterildi: false, not: `bildirim gosterilemedi: ${(r.stderr || r.error?.message || 'bilinmeyen hata').trim().split('\n')[0]}` };
}
