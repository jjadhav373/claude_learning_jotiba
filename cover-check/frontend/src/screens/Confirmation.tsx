/** S10 — Confirmation. What happened, what happens next, and the way out. */
import { useState } from 'react';
import { ScreenShell, Note } from '../ui/components';
import { IconChat, IconLink, IconPhone, IconStop } from '../ui/icons';
import { DoneArt } from '../illustrations';
import { useFlow } from '../state/flow';

const LANG = { en: 'English', hi: 'Hindi', mr: 'Marathi' } as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

export function Confirmation() {
  const { s, api, go } = useFlow();
  const [withdrawn, setWithdrawn] = useState(false);
  const r = s.result;
  const isCall = r?.action === 'advisor';

  return (
    <ScreenShell label="S10 Confirmation" title="All set" canBack={false}>
      <div style={{ display: 'grid', placeItems: 'center' }}><DoneArt /></div>
      <h1 className="title" style={{ textAlign: 'center' }}>{isCall ? 'Your call is booked' : 'Your summary is on its way'}</h1>

      <div className="receipt">
        <div className="receipt__row">
          <span className="receipt__icon"><IconChat size={20} /></span>
          <div><b>Summary sent to WhatsApp</b><p className="small muted num">{s.maskedMobile}{s.captured ? ` · ${time(s.captured.summarySentAt)}` : ''}</p></div>
        </div>
        {isCall && !withdrawn && (
          <div className="receipt__row">
            <span className="receipt__icon"><IconPhone size={20} /></span>
            <div>
              <b>{r?.slotLabel}{r?.callLanguage ? ` · ${LANG[r.callLanguage]}` : ''}</b>
              {/* VALIDATION REQUIRED: callback wording — current CTA rules bar promising a call back. */}
              <p className="small muted">An advisor will use this slot only. Nobody calls outside it.</p>
            </div>
          </div>
        )}
        {!isCall && r?.queued && !withdrawn && (
          <div className="receipt__row">
            <span className="receipt__icon"><IconPhone size={20} /></span>
            <div><b>You said we may contact you</b><p className="small muted">At most one call, inside permitted hours.</p></div>
          </div>
        )}
        <div className="receipt__row">
          <span className="receipt__icon"><IconLink size={20} /></span>
          <div><b>This link stays valid</b><p className="small muted">Come back to resume or upload your policy later.</p>
            <button className="link small" onClick={() => go('U1')}>Upload my policy now</button></div>
        </div>
      </div>

      {withdrawn ? (
        <Note>Done. We will not call or message you about this. Your answers stay saved only to keep a record of your choice.</Note>
      ) : (
        <div className="stack-sm">
          <p className="small muted">Changed your mind? Reply <b>STOP</b> on WhatsApp, or:</p>
          <button className="btn btn--danger-ghost" onClick={async () => { await api.withdraw(); setWithdrawn(true); }}>
            <IconStop size={18} />Withdraw — no calls, no messages
          </button>
        </div>
      )}
    </ScreenShell>
  );
}
