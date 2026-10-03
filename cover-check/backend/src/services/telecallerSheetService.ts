/**
 * Telecaller sheet: export callable leads to CSV (opens in Excel / Google Sheets), and import the
 * outcome columns the telecallers fill back into call_outcome.
 *
 * Only rows from agent_queue are exported — hand raised or warm-consented, contact consent live,
 * not DND. Nobody who chose "summary only" or withdrew ever appears in the sheet.
 */
import { describeAskedFor, DISPOSITIONS, type Disposition } from '@cover-check/shared';
import type { Deps } from './deps.js';
import { handoffService } from './handoffService.js';

const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

export const SHEET_COLUMNS = [
  'Priority', 'Call by (IST)', 'Name', 'Mobile', 'Call language', 'City / Pincode', 'Asked for', 'Their note',
  'Situation', 'Quiz answers', 'Told them', 'Policy upload', 'Consent', 'Opening line',
  // filled by the telecaller ↓
  'Connected (Y/N)', 'Call minutes', 'Disposition', 'Enquiry ID', 'Agent notes', 'Agent name',
  // do not edit ↓
  'Lead ID', 'Handoff ID',
] as const;

const DISPOSITION_HELP = 'enquiry_created | callback_later | not_interested | wrong_number | do_not_call';

// ---------------------------------------------------------------- CSV helpers (RFC 4180)

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'; // BOM: Excel reads Hindi/₹ correctly

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// ---------------------------------------------------------------- formatting

const ist = (iso: string | Date, withDay = true) => new Date(iso).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', ...(withDay ? { day: 'numeric', month: 'short' } : {}), hour: 'numeric', minute: '2-digit', hour12: true,
});
/** "+91 98123 45214" — spaces keep Excel from turning the number into 9.19812E+11. */
const prettyMobile = (m: string) => m.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');

const normaliseDisposition = (v: string): Disposition | null => {
  const k = v.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^call_back_later$/, 'callback_later').replace(/^dnc$/, 'do_not_call');
  return (DISPOSITIONS as readonly string[]).includes(k) ? (k as Disposition) : null;
};

// ---------------------------------------------------------------- service

export const telecallerSheetService = (d: Deps) => {
  const cards = handoffService(d);

  return {
    /**
     * @param onlyNew  true (default): only hand-offs not exported before, so two telecallers never get the same person.
     */
    async exportCsv(opts: { onlyNew?: boolean; markExported?: boolean } = {}) {
      const onlyNew = opts.onlyNew ?? true;
      const rows = await d.repos.handoffs.exportable(onlyNew);
      const batch = `export-${d.now().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
      const lines: unknown[][] = [SHEET_COLUMNS as unknown as string[]];
      for (const r of rows) {
        const c = await cards.card(r.lead_id);
        const callBy = r.slot_start && r.slot_end ? `${ist(r.slot_start)} – ${ist(r.slot_end, false)}`
          : r.sla_due_ts ? `By ${ist(r.sla_due_ts)} (9 am – 9 pm only)` : '9 am – 9 pm';
        lines.push([
          r.priority, callBy, c.firstName ?? '', prettyMobile(r.mobile), c.askedFor.callLanguage ? LANG[c.askedFor.callLanguage] : '',
          [c.where.city, c.where.pincode].filter(Boolean).join(' '), describeAskedFor(c).replace(/\. Note: .*$/, ''), c.askedFor.note ?? '',
          c.situationLine, c.quizLine, c.toldThem.map((t) => `${t.ruleId} ${t.label}`).join(', '), c.policyUpload, c.consentLine,
          c.openingScript.replace('<your name>', '[your name]'),
          '', '', '', '', '', '',
          r.lead_id, r.handoff_id,
        ]);
      }
      if (opts.markExported ?? true) await d.repos.handoffs.markExported(rows.map((r) => r.handoff_id), batch);
      return { csv: toCsv(lines), count: rows.length, batch };
    },

    /** Reads a sheet back. Rows without a Disposition are skipped (not called yet). Safe to import the same file twice. */
    async importCsv(text: string, defaultAgent = 'sheet-import') {
      const [header, ...body] = parseCsv(text);
      if (!header) return { recorded: 0, skipped: [{ row: 0, reason: 'Empty file' }] };
      const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
      const idx = {
        lead: col('Lead ID'), handoff: col('Handoff ID'), connected: col('Connected (Y/N)'), minutes: col('Call minutes'),
        disposition: col('Disposition'), enquiry: col('Enquiry ID'), notes: col('Agent notes'), agent: col('Agent name'),
      };
      if (idx.lead < 0 || idx.handoff < 0 || idx.disposition < 0)
        return { recorded: 0, skipped: [{ row: 1, reason: 'Missing the Lead ID, Handoff ID or Disposition column — use the exported sheet as is' }] };

      let recorded = 0;
      const skipped: { row: number; reason: string }[] = [];
      for (const [i, r] of body.entries()) {
        const rowNo = i + 2; // 1-based, after the header
        const get = (k: keyof typeof idx) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
        const rawDisp = get('disposition');
        if (!rawDisp) continue; // not called yet
        const disposition = normaliseDisposition(rawDisp);
        if (!disposition) { skipped.push({ row: rowNo, reason: `Disposition "${rawDisp}" — use one of: ${DISPOSITION_HELP}` }); continue; }
        const leadId = get('lead'), handoffId = get('handoff');
        if (!(await d.repos.handoffs.isOpenFor(handoffId, leadId))) { skipped.push({ row: rowNo, reason: 'Already closed or IDs changed' }); continue; }
        const notes = get('notes') || undefined, enquiryId = get('enquiry') || undefined;
        const last = await d.repos.handoffs.lastOutcome(handoffId);
        if (last && last.disposition === disposition && (last.agent_notes ?? undefined) === notes && (last.enquiry_id ?? undefined) === enquiryId) {
          skipped.push({ row: rowNo, reason: 'Already imported' }); continue;
        }
        const minutes = Number(get('minutes'));
        await cards.outcome(get('agent') || defaultAgent, handoffId, leadId, {
          connected: /^y(es)?$/i.test(get('connected')) || disposition === 'enquiry_created',
          durationSec: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : undefined,
          disposition, enquiryId, notes,
        });
        recorded++;
      }
      return { recorded, skipped };
    },
  };
};
