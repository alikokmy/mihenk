// Duman denemesi: en ucuz denetim. Uc sey ayakta mi: gomulu SQLite, MCP sunucu kitapligi, MCP istemci kitapligi.
import { DatabaseSync } from 'node:sqlite';
import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (41), (1);');
const satir = db.prepare('SELECT sum(x) AS toplam FROM t').get() as { toplam: number };
if (satir.toplam !== 42) throw new Error('sqlite toplam yanlis: ' + satir.toplam);
db.close();

const sunucu = new McpServer({ name: 'duman', version: '0.0.0' });
const istemci = new Client({ name: 'duman-istemci', version: '0.0.0' });
if (!sunucu || !istemci) throw new Error('mcp nesneleri kurulamadi');

console.log(`duman tamam: node ${process.version}, sqlite toplam=${satir.toplam}, mcp sunucu+istemci yuklendi`);
