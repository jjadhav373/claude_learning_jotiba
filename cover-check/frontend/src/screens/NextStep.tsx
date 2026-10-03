/**
 * S9 — What next (also U8 after an upload). Four equal options, none pre-selected, no box pre-ticked.
 * A call is only possible with the unticked contact consent box ticked and the number verified.
 */
import { useMemo, useState } from 'react';
import type { Language, Topic } from '@cover-check/shared';
import { ConsentBox, Field, Note, OptionTile, OtpForm, ScreenShell, Sheet } from '../ui/components';
import { IconFile, IconHeadset, IconChat, IconSparkle, IconUpload } from '../ui/icons';
import { AdvisorArt } from '../illustrations';
import { errorOf, useFlow, type NextAction } from '../state/flow';

const OPTIONS: { id: NextAction; label: string; desc: string; Icon: typeof IconFile }[] = [
  { id: 'policy', label: 'Check my full policy', desc: 'Upload it and get a plain summary', Icon: IconFile },
  { id: 'advisor', label: 'Talk to an advisor', desc: 'At a time you choose', Icon: IconHeadset },
  { id: 'plans', label: 'See plans that fit', desc: 'Based on your answers', Icon: IconSparkle },
  { id: 'summary', label: 'Just send me the summary', desc: 'No call. Done.', Icon: IconChat },
];
const TOPICS: { v: Topic; l: string }[] = [
  { v: 'renewal', l: 'Renewal' }, { v: 'parents', l: "Parents' cover" }, { v: 'compare', l: 'Comparing plans' },
  { v: 'claim', l: 'A claim question' }, { v: 'other', l: 'Something else' },
];

export function NextStep({ fromUpload = false }: { fromUpload?: boolean }) {
  const { s, api, go, patch } = useFlow();
  const [choice, setChoice] = useState<NextAction | null>(null);
  const [day, setDay] = useState<'today' | 'tomorrow'>(s.slots.some((x) => x.day === 'today') ? 'today' : 'tomorrow');
  const [slot, setSlot] = useState<string | null>(null);
  const [callLang, setCallLang] = useState<Language | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [okToContact, setOkToContact] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const daySlots = useMemo(() => s.slots.filter((x) => x.day === day), [s.slots, day]);

  const pick = (id: NextAction) => {
    setChoice(id); setErrors({}); setFatal(null);
    if (id === 'policy') go('U1');
  };

  const submit = async (verifiedNow = false) => {
    if (!choice || choice === 'policy') return;
    const isCall = choice === 'advisor';
    const e: Record<string, string> = {};
    if (isCall) {
      if (!slot) e.slot = 'Pick a time';
      if (!callLang) e.lang = 'Pick a language';
      if (!consent) e.consent = 'Tick the box so we are allowed to call you';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    if (isCall && !s.mobileVerified && !verifiedNow) { setOtpOpen(true); return; }
    const sl = s.slots.find((x) => x.start === slot);
    setBusy(true); setFatal(null);
    try {
      const res = await api.handoff({
        requestedAction: isCall ? 'advisor_call' : choice === 'plans' ? 'see_plans' : 'summary_only',
        slotStart: sl?.start, slotEnd: sl?.end, callLanguage: callLang ?? undefined, topic: topic ?? undefined,
        note: note.trim() || undefined, contactConsent: isCall ? consent : okToContact, language: s.language,
      });
      patch({ result: { action: choice, slotLabel: sl ? `${sl.day === 'today' ? 'Today' : 'Tomorrow'}, ${sl.label}` : undefined,
        callLanguage: callLang ?? undefined, queued: res.queued, at: new Date().toISOString() } });
      go('S10');
    } catch (err) {
      const x = errorOf(err);
      if (x.code === 'OTP_REQUIRED') setOtpOpen(true); else setFatal(x.message);
    } finally { setBusy(false); }
  };

  const showSubmit = choice && choice !== 'policy';
  return (
    <ScreenShell label={fromUpload ? 'U8 How Turtlemint can help' : 'S9 What next'} title={fromUpload ? 'How Turtlemint can help' : 'What next'}
      footer={showSubmit ? (
        <button className="btn btn--primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Sending…' : choice === 'advisor' ? 'Request the call' : choice === 'plans' ? 'Continue' : 'Send my summary'}
        </button>
      ) : undefined}>
      <div className="stack-sm">
        <h1 className="title">{s.captured ? `Saved, ${s.captured.firstName}.` : 'Your summary is ready.'} What would help most?</h1>
        <p className="muted small">Pick one. You can always come back to this link.</p>
      </div>

      <div className="tiles tiles--grid" role="radiogroup" aria-label="Next step">
        {OPTIONS.map(({ id, label, desc, Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={choice === id} className="tile tile--stack" onClick={() => pick(id)}>
            <span className="tile__icon"><Icon size={22} /></span>
            <span className="tile__label">{label}</span>
            <span className="tile__desc">{desc}</span>
          </button>
        ))}
      </div>
      {fromUpload && <button className="btn btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('U3')}><IconUpload size={18} />Upload another policy</button>}

      {choice === 'advisor' && (
        <div className="form-card reveal">
          <div className="row"><AdvisorArt size={48} /><div><b>An advisor calls you</b><p className="small muted">Only in the slot you pick. Nobody calls outside it.</p></div></div>

          <div className="field">
            <span className="field__label">When should we call?</span>
            <div className="seg" role="group" aria-label="Day">
              {(['today', 'tomorrow'] as const).map((d) => (
                <button key={d} aria-pressed={day === d} disabled={!s.slots.some((x) => x.day === d)} onClick={() => { setDay(d); setSlot(null); }}>
                  {d === 'today' ? 'Today' : 'Tomorrow'}
                </button>
              ))}
            </div>
            <div className="slots" role="radiogroup" aria-label="Time slot">
              {daySlots.map((x) => <OptionTile key={x.start} label={x.label} selected={slot === x.start} onSelect={() => setSlot(x.start)} />)}
            </div>
            {errors.slot ? <span className="field__err">{errors.slot}</span> : <span className="field__why">Calls only between 9 am and 9 pm.</span>}
          </div>

          <div className="field">
            <span className="field__label">Language for the call</span>
            <div className="chips">
              {([['en', 'English'], ['hi', 'Hindi'], ['mr', 'Marathi']] as const).map(([v, l]) =>
                <button key={v} className="chip" aria-pressed={callLang === v} onClick={() => setCallLang(v)}>{l}</button>)}
            </div>
            {errors.lang ? <span className="field__err">{errors.lang}</span> : null}
          </div>

          <div className="field">
            <span className="field__label">What should we help with? <span className="muted">(optional)</span></span>
            <div className="chips">{TOPICS.map((x) => <button key={x.v} className="chip" aria-pressed={topic === x.v} onClick={() => setTopic(topic === x.v ? null : x.v)}>{x.l}</button>)}</div>
          </div>

          <Field label="One line in your words (optional)">
            {(id) => <textarea id={id} className="input" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. My premium went up this year" />}
          </Field>
          <div className="counter num" style={{ marginTop: -12 }}>{note.length}/140</div>

          <ConsentBox checked={consent} onChange={setConsent} sub="You can withdraw this any time.">
            Turtlemint can call me on <b className="num">{s.maskedMobile}</b> in this slot.
          </ConsentBox>
          {errors.consent ? <span className="field__err" role="alert">{errors.consent}</span> : null}
        </div>
      )}

      {choice === 'plans' && (
        <div className="stack reveal">
          <Note>Plans shown here need insurer-approved content. Until then, an advisor can walk you through options that fit your answers.</Note>
          <ConsentBox checked={okToContact} onChange={setOkToContact} sub="Optional. Leave it unticked and nobody calls.">
            It is OK for an advisor to contact me about plans.
          </ConsentBox>
        </div>
      )}

      {choice === 'summary' && (
        <div className="stack reveal">
          <Note>Your summary goes to <b className="num">{s.maskedMobile}</b> on WhatsApp. That is all — no call.</Note>
          <ConsentBox checked={okToContact} onChange={setOkToContact} sub="Optional. Leave it unticked and nobody calls.">
            It is OK for Turtlemint to contact me if something in my summary needs a closer look.
          </ConsentBox>
        </div>
      )}
      {fatal ? <Note tone="danger">{fatal}</Note> : null}

      {otpOpen && (
        <Sheet label="Verify your number" onClose={() => setOtpOpen(false)}>
          <h2 className="title">One quick check</h2>
          <OtpForm purpose="call" inSheet onVerified={() => { setOtpOpen(false); void submit(true); }} />
        </Sheet>
      )}
    </ScreenShell>
  );
}
