// Iki takim kosucusu (Asama 37): "node dist/test/takim.js bilgi|engel". Takim listesi test/takimlar.json'dadir.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = dirname(fileURLToPath(import.meta.url)); // dist/test
const KAYNAK = join(DIST, '..', '..', 'test');

export function takimlar(): { bilgi: string[]; engel: string[] } {
  const bilgi = (JSON.parse(readFileSync(join(KAYNAK, 'takimlar.json'), 'utf8')) as { bilgi: string[] }).bilgi;
  const hepsi = readdirSync(KAYNAK).filter((d) => d.endsWith('.test.ts')).sort();
  return { bilgi: hepsi.filter((d) => bilgi.includes(d)), engel: hepsi.filter((d) => !bilgi.includes(d)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ad = process.argv[2];
  if (ad !== 'bilgi' && ad !== 'engel') {
    console.error('kullanim: node dist/test/takim.js bilgi|engel');
    process.exit(2);
  }
  const dosyalar = takimlar()[ad].map((d) => join(DIST, d.replace(/\.ts$/, '.js')));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...dosyalar], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
