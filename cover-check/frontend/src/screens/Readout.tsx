/** S7 — Readout. Free to read, no details asked. What you know / what to check. No score, no ranking. */
import { useEffect, useRef } from 'react';
import { ScreenShell, SeverityBadge } from '../ui/components';
import { IconCheck, IconSparkle } from '../ui/icons';
import { ReadoutArt } from '../illustrations';
import { useFlow } from '../state/flow';

export function Readout() {
  const { s, api, go } = useFlow();
  const shown = useRef(Date.now());
  useEffect(() => () => { if (s.sessionId) api.readoutDwell(s.sessionId, Date.now() - shown.current); }, []); // eslint-disable-line
  const r = s.readout;
  if (!r) return null;

  return (
    <ScreenShell label="S7 Readout" title="Your readout" footer={
      <>
        <button className="btn btn--primary" onClick={() => go('S8')}>Save and explain this to me</button>
        <button className="btn btn--secondary" onClick={() => go('U1')}>Check my full policy</button>
      </>
    }>
      <div className="readout-head">
        <ReadoutArt />
        <div className="stack-sm">
          <span className="eyebrow">Done in about a minute</span>
          <h1 className="title">Here is what we found</h1>
        </div>
      </div>

      <section className="panel" aria-labelledby="know">
        <h2 id="know" className="panel__head panel__head--know"><IconCheck size={18} />What you know</h2>
        <ul className="panel__list">
          {r.know.length ? r.know.map((k) => <li key={k}><IconCheck size={18} style={{ color: 'var(--mint-700)' }} />{k}</li>)
            : <li className="muted">Nothing certain yet — and that is fine.</li>}
        </ul>
      </section>

      <section className="panel" aria-labelledby="check">
        <h2 id="check" className="panel__head panel__head--check"><IconSparkle size={18} />What to check</h2>
        <ul className="panel__list">
          {r.check.length ? r.check.map((c) => (
            <li key={c.ruleId + (c.field ?? '')} style={{ flexDirection: 'column', gap: 6 }}>
              <SeverityBadge s={c.severity} /><span>{c.text}</span>
            </li>
          )) : <li>Nothing stands out from your answers. A full policy check can still show details the quiz cannot.</li>}
        </ul>
      </section>

      <p className="disclaimer">This is general information based on your answers, not advice about a specific policy or insurer.</p>
    </ScreenShell>
  );
}
