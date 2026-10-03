/**
 * Read the filled telecaller sheet back into the database.
 *   npm run import:outcomes -- path/to/sheet.csv
 * (From Google Sheets: File → Download → Comma-separated values.)
 * "do_not_call" withdraws call consent and blocks the number from every future export.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDeps, closeDb } from '../wiring.js';
import { telecallerSheetService } from '../services/telecallerSheetService.js';

const file = process.argv[2];
if (!file) { console.error('Usage: npm run import:outcomes -- path/to/sheet.csv'); process.exit(1); }
// npm runs this inside backend/, so resolve relative paths from where you typed the command
const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
const res = await telecallerSheetService(buildDeps()).importCsv(await readFile(path, 'utf8'));
console.log(`\nRecorded ${res.recorded} call outcome${res.recorded === 1 ? '' : 's'}.`);
for (const s of res.skipped) console.log(`  row ${s.row}: skipped — ${s.reason}`);
console.log('');
await closeDb();
