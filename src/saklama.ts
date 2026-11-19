// Degisikliklerin saklanmasi (Ilke 3: uzak depo varsayilmaz). Uc kip:
//   yok           : yalniz defter tutulur, git'e dokunulmaz;
//   yerel         : yalniz bu bilgisayarda commit (varsayilan);
//   yerel_gonder  : commit ve push. Push yalniz bu kipte ve yalniz uzak depo varsa yapilir.
import { spawnSync } from 'node:child_process';

export type SaklamaKipi = 'yok' | 'yerel' | 'yerel_gonder';
export const SAKLAMA_KIPLERI: readonly SaklamaKipi[] = ['yok', 'yerel', 'yerel_gonder'];

export interface SaklamaSonucu {
  commit: boolean;
  push: boolean;
  not: string;
}

function git(kok: string, argumanlar: string[]): { kod: number | null; cikti: string } {
  const r = spawnSync('git', argumanlar, { cwd: kok, encoding: 'utf8', windowsHide: true });
  return { kod: r.error ? null : r.status, cikti: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

export function sakla(kok: string, kip: SaklamaKipi, mesaj: string): SaklamaSonucu {
  if (kip === 'yok') return { commit: false, push: false, not: 'saklama kipi "yok": yalniz defter tutuldu' };
  const depo = git(kok, ['rev-parse', '--is-inside-work-tree']);
  if (depo.kod === null) return { commit: false, push: false, not: 'git kurulu degil: degisiklikler saklanmadi (yalniz defter tutuldu)' };
  if (depo.kod !== 0) return { commit: false, push: false, not: 'bu klasor bir git deposu degil: degisiklikler saklanmadi (yalniz defter tutuldu)' };

  git(kok, ['add', '-A']);
  if (git(kok, ['diff', '--cached', '--quiet']).kod === 0) return { commit: false, push: false, not: 'saklanacak degisiklik yok' };
  const c = git(kok, ['commit', '-q', '-m', mesaj]);
  if (c.kod !== 0) return { commit: false, push: false, not: `commit yapilamadi: ${c.cikti.split('\n')[0] ?? ''}` };
  if (kip !== 'yerel_gonder') return { commit: true, push: false, not: 'yerelde saklandi (commit); gonderilmedi' };

  if (git(kok, ['remote']).cikti === '') return { commit: true, push: false, not: 'yerelde saklandi; uzak depo tanimli olmadigi icin gonderilmedi' };
  const p = git(kok, ['push', '-q']);
  return p.kod === 0
    ? { commit: true, push: true, not: 'yerelde saklandi ve uzak depoya gonderildi' }
    : { commit: true, push: false, not: `yerelde saklandi; gonderilemedi: ${p.cikti.split('\n')[0] ?? ''}` };
}

/** Bir git deposunun o anki durumu: ajanin proje disinda degisiklik yapip yapmadigini anlamak icin once / sonra karsilastirilir. */
export function depoDurumu(dizin: string): string | null {
  const s = git(dizin, ['status', '--porcelain']);
  if (s.kod !== 0) return null;
  return `${s.cikti}\n---\n${git(dizin, ['diff']).cikti}`;
}
