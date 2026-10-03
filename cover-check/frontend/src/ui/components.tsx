/** Cover Check component library. Behaviour + markup only; all styling lives in styles/app.css. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Language, Severity } from '@cover-check/shared';
import { IconBack, IconCheck, IconInfo, IconLock, IconMinus, IconPlus, IconQuestion } from './icons';
import { Emblem } from '../illustrations';
import { LANG_LABEL } from '../i18n';
import { errorOf, useFlow } from '../state/flow';

// ---------------------------------------------------------------- shell

export function ScreenShell(props: {
  title?: string; step?: number; wash?: boolean; canBack?: boolean; brand?: boolean; footer?: ReactNode; children: ReactNode; label: string;
}) {
  const { s, back, patch } = useFlow();
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.closest('.proto__screen')?.scrollTo({ top: 0 }); window.scrollTo?.({ top: 0 }); }, [props.label]);
  return (
    <section className={`screen${props.wash ? ' screen--wash' : ''}`} aria-label={props.label}>
      <header className="topbar">
        {props.canBack !== false && s.history.length > 0
          ? <button className="topbar__back" onClick={back} aria-label="Back"><IconBack size={22} /></button>
          : <span style={{ width: 8 }} />}
        {props.brand
          ? <span className="brandmark"><Emblem size={26} />Cover Check <small>by Turtlemint</small></span>
          : <span className="topbar__title">{props.title}</span>}
        <span className="spacer" />
        <LangSwitch value={s.language} onChange={(language) => patch({ language })} />
      </header>
      {props.step ? <Progress step={props.step} /> : null}
      <div className="body" ref={bodyRef} key={props.label}>{props.children}</div>
      {props.footer ? <footer className="footer">{props.footer}</footer> : null}
    </section>
  );
}

export function LangSwitch({ value, onChange }: { value: Language; onChange(l: Language): void }) {
  return (
    <div className="lang" role="group" aria-label="Language">
      {(['en', 'hi', 'mr'] as Language[]).map((l) => (
        <button key={l} aria-pressed={value === l} onClick={() => onChange(l)} lang={l}>{LANG_LABEL[l]}</button>
      ))}
    </div>
  );
}

export function Progress({ step }: { step: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={6} aria-valuenow={step} aria-label={`Step ${step} of 6`}>
      {Array.from({ length: 6 }, (_, i) => <span key={i} data-done={i < step} />)}
    </div>
  );
}

// ---------------------------------------------------------------- inputs

export function OptionTile(props: {
  label: string; selected: boolean; onSelect(): void; multi?: boolean; unsure?: boolean; icon?: ReactNode; big?: boolean;
}) {
  return (
    <button type="button" role={props.multi ? 'checkbox' : 'radio'} aria-checked={props.selected} onClick={props.onSelect}
      className={`tile${props.unsure ? ' tile--unsure' : ''}${props.big ? ' tile--big' : ''}`}>
      {props.icon ? <span className="tile__icon">{props.icon}</span> : props.unsure ? <span className="tile__icon"><IconQuestion /></span> : null}
      <span className="tile__label">{props.label}</span>
      <span className={`tile__mark${props.multi ? ' tile__mark--box' : ''}`}>{props.selected ? <IconCheck size={14} strokeWidth={3} /> : null}</span>
    </button>
  );
}

export function Chip({ label, on, onToggle }: { label: string; on: boolean; onToggle(): void }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onToggle}>{label}</button>;
}

export function Stepper({ value, min, max, onChange, label }: { value: number | undefined; min: number; max: number; onChange(n: number): void; label: string }) {
  const v = value ?? min;
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Fewer" disabled={v <= min} onClick={() => onChange(Math.max(min, v - 1))}><IconMinus /></button>
      <output aria-live="polite" className="num">{value ?? '–'}</output>
      <button type="button" aria-label="More" disabled={value !== undefined && v >= max} onClick={() => onChange(value === undefined ? min : Math.min(max, v + 1))}><IconPlus /></button>
    </div>
  );
}

export function Field(props: { label: string; why?: string; error?: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{props.label}</label>
      {props.children(id)}
      {props.error ? <span className="field__err" role="alert">{props.error}</span> : props.hint ? <span className="field__hint">{props.hint}</span> : null}
      {props.why ? <span className="field__why"><IconInfo size={16} />Why: {props.why}</span> : null}
    </div>
  );
}

export function ConsentBox({ checked, onChange, children, sub }: { checked: boolean; onChange(v: boolean): void; children: ReactNode; sub?: string }) {
  return (
    <label className="consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="consent__text">{children}{sub ? <span className="consent__sub">{sub}</span> : null}</span>
    </label>
  );
}

// ---------------------------------------------------------------- feedback

export const Notice = ({ children }: { children: ReactNode }) => <p className="notice"><IconLock size={16} /><span>{children}</span></p>;

export const Note = ({ tone = 'info', icon, children }: { tone?: 'info' | 'amber' | 'danger'; icon?: ReactNode; children: ReactNode }) => (
  <div className={`note${tone !== 'info' ? ` note--${tone}` : ''}`} role={tone === 'danger' ? 'alert' : undefined}>{icon ?? <IconInfo size={18} />}<div>{children}</div></div>
);

const SEV_LABEL: Record<Severity, string> = { review: 'Review', ask: 'Worth asking', info: 'Fine' };
export const SeverityBadge = ({ s }: { s: Severity }) => <span className={`badge badge--${s}`}>{SEV_LABEL[s]}</span>;

// ---------------------------------------------------------------- OTP sheet (S9 call request, U2)

export function OtpForm({ purpose, onVerified, inSheet }: { purpose: 'upload' | 'call'; onVerified(): void; inSheet?: boolean }) {
  const { s, api, patch } = useFlow();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(3);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const send = async () => {
    setErr(null);
    try { const r = await api.sendOtp(purpose); setWait(r.resendAfterSec); setLeft(r.attemptsLeft); refs.current[0]?.focus(); }
    catch (e) { setErr(errorOf(e).message); }
  };
  useEffect(() => { void send(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const verify = async (code: string) => {
    setBusy(true); setErr(null);
    try { await api.verifyOtp(code); patch({ mobileVerified: true }); onVerified(); }
    catch (e) {
      const x = errorOf(e);
      setErr(x.message); setLeft(x.details?.attemptsLeft ?? 0); setDigits(['', '', '', '', '', '']); refs.current[0]?.focus();
    } finally { setBusy(false); }
  };
  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) { // pasted / autofilled
      const all = clean.slice(0, 6).split('');
      const next = [...digits].map((_, k) => all[k] ?? '');
      setDigits(next); if (all.length === 6) void verify(all.join('')); return;
    }
    const next = [...digits]; next[i] = clean; setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(''));
  };

  return (
    <div className="stack">
      {!inSheet && <h1 className="title">Verify your number</h1>}
      <p className="muted">We sent a 6 digit code to <b className="num">{s.maskedMobile}</b>. {purpose === 'upload'
        ? 'Your policy is personal, so we check it is you.' : 'So the call reaches you and nobody else.'}</p>
      <div className="otp" role="group" aria-label="6 digit code">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={6} value={d} aria-label={`Digit ${i + 1}`} disabled={busy || left <= 0}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus(); }} />
        ))}
      </div>
      {err ? <span className="field__err" role="alert">{err}{left > 0 && err.includes('not right') ? ` ${left} ${left === 1 ? 'try' : 'tries'} left.` : ''}</span> : null}
      <div className="row small">
        <span className="muted">Didn’t get it?</span>
        {wait > 0 ? <span className="muted num">Resend in {wait}s</span> : <button className="link" onClick={send}>Resend code</button>}
      </div>
    </div>
  );
}

export function Sheet({ onClose, children, label }: { onClose(): void; children: ReactNode; label: string }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <span className="sheet__grip" />
        {children}
      </div>
    </div>
  );
}
