/** Rung 2 — U1 consent · U2 verify · U3 files · U4 reading · U5 check facts · U6 summary · U7 points. */
import { useEffect, useRef, useState } from 'react';
import { KEY_FACTS, type DocumentStatusView, type PolicyFactKey } from '@cover-check/shared';
import { ConsentBox, Note, OtpForm, ScreenShell, SeverityBadge } from '../ui/components';
import { IconCheck, IconEdit, IconFile, IconHeadset, IconUpload, IconAlert } from '../ui/icons';
import { BlurryArt, LockedDocArt, ReadingArt } from '../illustrations';
import { errorOf, useFlow } from '../state/flow';

const RETENTION_DAYS = 90; // VALIDATION REQUIRED

export function UploadConsent() {
  const { s, api, go } = useFlow();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const next = async () => {
    setBusy(true);
    try { await api.docConsent(s.language); go(s.mobileVerified ? 'U3' : 'U2'); } finally { setBusy(false); }
  };
  return (
    <ScreenShell label="U1 Consent" title="Full Cover Check" footer={
      <button className="btn btn--primary" disabled={!ok || busy} onClick={next}>Continue</button>
    }>
      <div className="readout-head"><LockedDocArt size={72} /><div className="stack-sm">
        <span className="eyebrow">Before you upload</span>
        <h1 className="title">Here is exactly what we read</h1>
      </div></div>
      <div className="two-col">
        <div className="col-yes"><h3>We read</h3><ul><li>Policy terms</li><li>Who is covered</li><li>Dates and renewal</li><li>Limits and waiting periods</li></ul></div>
        <div className="col-no"><h3>We don’t need</h3><ul><li>ID proof</li><li>Bank details</li><li>Medical reports</li></ul></div>
      </div>
      <Note>We keep the file for {RETENTION_DAYS} days to prepare and explain your summary, then delete it. Ask any time and we delete it sooner.</Note>
      <ConsentBox checked={ok} onChange={setOk}>I allow Turtlemint to read this document to prepare my summary.</ConsentBox>
    </ScreenShell>
  );
}

export function UploadVerify() {
  const { go } = useFlow();
  return (
    <ScreenShell label="U2 Verify mobile" title="Verify">
      <OtpForm purpose="upload" onVerified={() => go('U3', { replace: true })} />
    </ScreenShell>
  );
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic';
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const localProblem = (f: File) =>
  !/\.(pdf|jpe?g|png|heic)$/i.test(f.name) ? 'Only PDF, JPG, PNG or HEIC' : f.size > 15 * 1024 * 1024 ? 'Over 15 MB' : null;

export function UploadChoose() {
  const { api, go, patch } = useFlow();
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const good = files.filter((f) => !localProblem(f));

  const add = (list: FileList | null) => { if (list) setFiles((cur) => [...cur, ...Array.from(list)].slice(0, 3)); };
  const upload = async () => {
    setBusy(true); setFatal(null);
    try {
      const res = await api.uploadDocs(good);
      setRejected(res.rejected);
      if (res.accepted.length) { patch({ docIds: res.accepted }); go('U4'); }
    } catch (e) { setFatal(errorOf(e).message); } finally { setBusy(false); }
  };

  return (
    <ScreenShell label="U3 Choose file" title="Upload your policy" footer={
      <button className="btn btn--primary" disabled={!good.length || busy} onClick={upload}>{busy ? 'Uploading…' : `Upload ${good.length || ''} ${good.length === 1 ? 'file' : 'files'}`}</button>
    }>
      <h1 className="title">Add your policy</h1>
      <Note><b>Tip:</b> the policy schedule page works best. The full document gives more.</Note>
      <button type="button" className="dropzone" onClick={() => input.current?.click()} disabled={files.length >= 3}>
        <IconUpload size={28} style={{ color: 'var(--mint-700)' }} />
        <b>Choose a file or take a photo</b>
        <span className="small muted">PDF, JPG, PNG or HEIC · up to 3 files · 15 MB each</span>
      </button>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      {files.length > 0 && (
        <div className="files">
          {files.map((f, i) => {
            const p = localProblem(f) ?? rejected.find((r) => r.name === f.name)?.reason;
            return (
              <div key={i} className={`file${p ? ' file--bad' : ''}`}>
                <IconFile size={22} style={{ color: p ? 'var(--danger-700)' : 'var(--mint-700)' }} />
                <div style={{ flex: 1, minWidth: 0 }}><div className="file__name">{f.name}</div><div className="file__meta">{p ?? fmtSize(f.size)}</div></div>
                <button className="link small" onClick={() => setFiles(files.filter((_, k) => k !== i))}>Remove</button>
              </div>
            );
          })}
        </div>
      )}
      <p className="small muted">Prototype tip: name a file with “locked”, “blurry” or “motor” to see those states.</p>
      {fatal ? <Note tone="danger">{fatal}</Note> : null}
    </ScreenShell>
  );
}

export function UploadReading() {
  const { s, api, go } = useFlow();
  const docId = s.docIds[0];
  const [view, setView] = useState<DocumentStatusView | null>(null);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!docId) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const v = await api.docStatus(docId).catch(() => null);
      if (v) setView(v);
      if (v && (v.status === 'ready' || v.status === 'needs_review')) { go('U5', { replace: true }); return; }
      if (Date.now() - started.current > 90_000) setSlow(true);
      if (!v || !['failed'].includes(v.status)) setTimeout(tick, 700);
    };
    void tick();
    return () => { stop = true; };
  }, [docId, api, go]);

  const sendPassword = async () => {
    if (!docId) return;
    setPwErr(null);
    try {
      const v = await api.docPassword(docId, pw); setView(v); setPw('');
      if (v.needsPassword) setPwErr('That password did not open the file.');
    } catch (e) { setPwErr(errorOf(e).message); }
  };

  const status = view?.status ?? 'queued';
  const step = status === 'queued' ? 1 : status === 'reading' ? 2 : 3;

  if (view?.status === 'failed') return <UploadProblem reason={view.failureReason ?? 'other'} />;

  return (
    <ScreenShell label="U4 Reading" title="Reading your policy">
      <div style={{ display: 'grid', placeItems: 'center' }}><ReadingArt /></div>
      {view?.needsPassword ? (
        <div className="stack reveal">
          <h1 className="title">This file is locked</h1>
          <p className="muted">Enter the PDF password. It is often your date of birth or part of your name — check the insurer’s email.</p>
          <input className="input" type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="PDF password" />
          {pwErr ? <span className="field__err">{pwErr}</span> : <span className="field__why">The password is used once to open the file and never stored.</span>}
          <button className="btn btn--primary" disabled={!pw} onClick={sendPassword}>Open file</button>
        </div>
      ) : (
        <>
          <h1 className="title" style={{ textAlign: 'center' }}>Reading your policy</h1>
          <ol className="steps" aria-live="polite">
            {['Uploading', 'Reading your policy', 'Preparing your summary'].map((label, i) => (
              <li key={label} data-state={i + 1 < step ? 'done' : i + 1 === step ? 'active' : 'todo'}>
                <span className="steps__dot">{i + 1 < step ? <IconCheck size={14} strokeWidth={3} /> : null}</span>{label}
              </li>
            ))}
          </ol>
          <Note>{slow ? 'This is taking longer than usual. You can close this page — we will send your summary on WhatsApp when it is ready.'
            : 'Usually about a minute. You can close this page — we will send the summary on WhatsApp when it is ready.'}</Note>
        </>
      )}
    </ScreenShell>
  );
}

function UploadProblem({ reason }: { reason: string }) {
  const { go } = useFlow();
  const copy: Record<string, { t: string; b: string }> = {
    unreadable: { t: 'We could not read page 2', b: 'The photo looks blurry. Retake it in good light, or upload the PDF from your insurer’s email.' },
    not_health: { t: 'This looks like a different policy', b: 'It seems to be a motor, life or travel policy. Cover Check reads health policies — upload a different file.' },
    wrong_password: { t: 'The file stayed locked', b: 'After 3 tries we stopped. Upload an unlocked copy, or an advisor can help.' },
    other: { t: 'Something went wrong reading this file', b: 'Try again, or an advisor can help.' },
  };
  const c = copy[reason] ?? copy.other!;
  return (
    <ScreenShell label="U4 Exception" title="Reading your policy" footer={
      <>
        <button className="btn btn--primary" onClick={() => go('U3', { replace: true })}><IconUpload size={18} />Upload a different file</button>
        <button className="btn btn--secondary" onClick={() => go('S9')}><IconHeadset size={18} />Talk to an advisor</button>
      </>
    }>
      <div style={{ display: 'grid', placeItems: 'center' }}><BlurryArt /></div>
      <h1 className="title" style={{ textAlign: 'center' }}>{c.t}</h1>
      <p className="muted" style={{ textAlign: 'center' }}>{c.b}</p>
    </ScreenShell>
  );
}

export function UploadCheck() {
  const { s, api, go, patch } = useFlow();
  const docId = s.docIds[0];
  const [view, setView] = useState<DocumentStatusView | null>(null);
  const [edits, setEdits] = useState<Partial<Record<PolicyFactKey, string>>>({});
  const [editing, setEditing] = useState<PolicyFactKey | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (docId) api.docStatus(docId).then(setView); }, [docId, api]);
  if (!view) return null;

  const rows = KEY_FACTS.map((k) => view.facts.find((f) => f.key === k) ?? { key: k, label: k, value: null, sourcePage: null, confidence: null, userConfirmed: false, userValue: null });
  const missing = rows.filter((r) => !r.value && !edits[r.key]);
  const confirm = async () => {
    setBusy(true);
    try {
      const summary = await api.confirmFacts(docId!, Object.entries(edits).map(([key, v]) => ({ key: key as PolicyFactKey, userValue: v || null })));
      patch({ summary }); go('U6', { replace: true });
    } finally { setBusy(false); }
  };

  return (
    <ScreenShell label="U5 Check what we read" title="Check what we read" footer={
      <button className="btn btn--primary" disabled={busy} onClick={confirm}>Looks right</button>
    }>
      <h1 className="title">Is this right?</h1>
      <p className="muted">Fix anything we got wrong. This keeps your summary accurate.</p>
      <div className="factlist">
        {rows.map((f) => {
          const shown = edits[f.key] ?? f.userValue ?? f.value;
          return (
            <div key={f.key} className="factrow">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="factrow__k">{labelOf(f.key)}{f.sourcePage ? <span className="pagechip">p. {f.sourcePage}</span> : null}</div>
                {editing === f.key ? (
                  <input className="input" autoFocus defaultValue={shown ?? ''} aria-label={labelOf(f.key)}
                    onBlur={(e) => { setEdits({ ...edits, [f.key]: e.target.value.trim() }); setEditing(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                ) : shown ? <div className="factrow__v">{pretty(f.key, shown)}</div>
                  : <div className="factrow__v factrow__v--missing">Not found — please enter it</div>}
              </div>
              {editing !== f.key && <button className="link small row" onClick={() => setEditing(f.key)}><IconEdit size={16} />{shown ? 'Edit' : 'Add'}</button>}
            </div>
          );
        })}
      </div>
      {missing.length > 0 && <Note tone="amber" icon={<IconAlert size={18} />}>We never guess. If you leave a field empty, your summary will say it was not found.</Note>}
    </ScreenShell>
  );
}

const LABELS: Partial<Record<PolicyFactKey, string>> = {
  insurer_name: 'Insurer', product_name: 'Plan', policy_type: 'Policy type', sum_insured_inr: 'Sum insured', members: 'Members covered',
  start_date: 'Start date', end_date: 'End date',
};
const labelOf = (k: PolicyFactKey) => LABELS[k] ?? k;
const pretty = (k: PolicyFactKey, v: string) =>
  k === 'sum_insured_inr' && /^\d+$/.test(v) ? `₹${Number(v).toLocaleString('en-IN')}`
    : k === 'policy_type' ? ({ floater: 'Family floater', individual: 'Individual', group: 'Group' } as Record<string, string>)[v] ?? v
    : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : v;

export function UploadSummary() {
  const { s, go } = useFlow();
  const sum = s.summary;
  if (!sum) return null;
  return (
    <ScreenShell label="U6 Cover summary" title="Your cover summary" footer={
      <button className="btn btn--primary" onClick={() => go('U7')}>See {sum.points.length} points to review</button>
    }>
      <span className="eyebrow">In plain words</span>
      <h1 className="title">What your policy says</h1>
      {sum.sections.map((sec) => (
        <section key={sec.id} className="section">
          <h2>{sec.title}</h2>
          <ul>{sec.lines.map((l, i) => <li key={i} className={l.found ? '' : 'missing'}>{l.text}{l.page ? <span className="pagechip">p. {l.page}</span> : null}</li>)}</ul>
        </section>
      ))}
      <p className="disclaimer">Read from your document. Page numbers show where each line came from. Not advice to change your policy.</p>
    </ScreenShell>
  );
}

export function UploadPoints() {
  const { s, api, go } = useFlow();
  const sum = s.summary;
  if (!sum) return null;
  return (
    <ScreenShell label="U7 Points to review" title="Points to review" footer={
      <button className="btn btn--primary" onClick={() => go('U8')}>How Turtlemint can help</button>
    }>
      <h1 className="title">Points worth a look</h1>
      {sum.points.map((p) => (
        <article key={p.ruleId} className="point" onClick={() => api.event('point_opened', 'U7', { rule: p.ruleId })}>
          <SeverityBadge s={p.severity} />
          <b>{p.text}</b>
          <p className="small muted">{p.meaning}</p>
          <div className="point__help"><IconHeadset size={18} />{p.howWeHelp}</div>
        </article>
      ))}
    </ScreenShell>
  );
}
