#!/usr/bin/env node
// mihenk defteri: stdio uzerinden MCP sunucusu.
// Kullanim: mihenk-defter [--kok <proje dizini>]   (yoksa MIHENK_KOK, o da yoksa calisma dizini)
// stdout protokole aittir; insan icin her sey stderr'e yazilir.
import { resolve } from 'node:path';

// node:sqlite henuz "deneysel" uyarisi basiyor; istemcilerin stderr'ini kirletmesin. Baska uyarilar aynen gecer.
const asilUyari = process.emitWarning.bind(process);
process.emitWarning = ((uyari: string | Error, ...gerisi: unknown[]) => {
  const metin = typeof uyari === 'string' ? uyari : uyari.message;
  if (metin.includes('SQLite is an experimental feature')) return;
  (asilUyari as (...a: unknown[]) => void)(uyari, ...gerisi);
}) as typeof process.emitWarning;

const { serveStdio } = await import('@modelcontextprotocol/server/stdio');
const { Defter } = await import('./defter.js');
const { sunucuKur } = await import('./sunucu.js');

const argumanlar = process.argv.slice(2);
const kokSirasi = argumanlar.indexOf('--kok');
const kok = resolve((kokSirasi >= 0 ? argumanlar[kokSirasi + 1] : undefined) ?? process.env.MIHENK_KOK ?? process.cwd());

const defter = new Defter(kok);
console.error(`mihenk-defter: defter ${defter.dizin}`);

serveStdio(() => sunucuKur(defter), {
  onerror: (e) => console.error(`mihenk-defter hata: ${e.message}`),
});
