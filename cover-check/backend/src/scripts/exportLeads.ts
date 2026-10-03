/**
 * Export today's callable leads for the telecaller team.
 *   npm run export:leads          → only leads not exported before (default)
 *   npm run export:leads -- --all → every open callable lead again (also marks them exported)
 * Writes exports/telecaller-sheet-<batch>.csv at the project root. Open it in Excel, or
 * Google Sheets → File → Import → Upload.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDeps, closeDb } from '../wiring.js';
import { telecallerSheetService } from '../services/telecallerSheetService.js';

const all = process.argv.includes('--all');
const sheet = telecallerSheetService(buildDeps());
const { csv, count, batch } = await sheet.exportCsv({ onlyNew: !all });
if (!count) {
  console.log(all ? '\nNo open callable leads right now.\n' : '\nNo new callable leads since the last export. Use --all to re-export open ones.\n');
} else {
  const dir = resolve(import.meta.dirname, '../../../exports');
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, `telecaller-sheet-${batch}.csv`);
  await writeFile(file, csv, 'utf8');
  console.log(`\n${count} lead${count === 1 ? '' : 's'} exported →\n  ${file}\n\nShare it only with the telecaller team (it has phone numbers). Fill the outcome columns, then:\n  npm run import:outcomes -- "${file}"\n`);
}
await closeDb();
