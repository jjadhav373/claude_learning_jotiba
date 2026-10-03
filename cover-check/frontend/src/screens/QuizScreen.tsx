/**
 * S1–S6 — one generic renderer over the shared quiz config. Single-question screens auto-advance on tap;
 * screens with more than one question (or a typed answer) get a Continue button.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { screensForAnswers, screenErrors, visibleQuestions, type AnswerField, type Question, type QuizAnswers, type ScreenId } from '@cover-check/shared';
import { Chip, Field, OptionTile, ScreenShell, Stepper, Note } from '../ui/components';
import { MEMBER_ICON } from '../ui/icons';
import { t } from '../i18n';
import { errorOf, useFlow } from '../state/flow';

export function QuizScreen({ id }: { id: ScreenId }) {
  const { s, api, go, patch } = useFlow();
  const [draft, setDraft] = useState<QuizAnswers>(s.answers);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const started = useRef(Date.now());
  useEffect(() => { setDraft(s.answers); started.current = Date.now(); setShowErrors(false); }, [id]); // eslint-disable-line

  const screens = screensForAnswers(draft);
  const screen = screens.find((x) => x.id === id) ?? screens[0]!;
  const questions = visibleQuestions(screen, draft);
  const errors = screenErrors(screen, draft);
  const autoAdvance = questions.length === 1 && questions[0]!.kind === 'single';

  const submit = async (answers: QuizAnswers) => {
    const errs = screenErrors(screen, answers);
    if (Object.keys(errs).length) { setShowErrors(true); return; }
    setBusy(true); setFatal(null);
    try {
      let sessionId = s.sessionId;
      if (!sessionId) { sessionId = (await api.startQuiz(s.language)).sessionId; patch({ sessionId }); }
      const patchBody: QuizAnswers = {};
      for (const q of visibleQuestions(screen, answers)) (patchBody as Record<string, unknown>)[q.field] = answers[q.field];
      const res = await api.saveScreen(sessionId, screen.id, patchBody, Date.now() - started.current);
      patch({ answers: res.answers });
      if (res.next === 'S7') {
        const readout = await api.completeQuiz(sessionId);
        patch({ readout });
        go('S7');
      } else go(res.next as ScreenId);
    } catch (e) { setFatal(errorOf(e).message); } finally { setBusy(false); }
  };

  const set = (field: AnswerField, value: unknown, advance = false) => {
    const next = { ...draft, [field]: value } as QuizAnswers;
    setDraft(next);
    if (advance) setTimeout(() => void submit(next), 220); // let the selection register visually
  };

  return (
    <ScreenShell label={`${screen.id} ${screen.title}`} title={t(s.language, 'step', { n: screen.step })} step={screen.step}
      footer={autoAdvance ? undefined : (
        <button className="btn btn--primary" disabled={busy} onClick={() => void submit(draft)}>{busy ? 'Saving…' : t(s.language, 'continue')}</button>
      )}>
      <div className="stack-sm">
        <h1 className="title">{screen.title}</h1>
        {screen.intro ? <p className="muted">{screen.intro}</p> : null}
      </div>
      {questions.map((q, i) => (
        <QuestionBlock key={q.field} q={q} hideLabel={i === 0 && q.label === screen.title} value={draft[q.field]}
          error={showErrors ? errors[q.field] : undefined}
          onChange={(v) => set(q.field, v, autoAdvance && q.kind === 'single')} />
      ))}
      {fatal ? <Note tone="danger">{fatal}</Note> : null}
    </ScreenShell>
  );
}

function QuestionBlock({ q, value, onChange, error, hideLabel }: { q: Question; value: unknown; onChange(v: unknown): void; error?: string; hideLabel: boolean }) {
  const label = hideLabel ? null : <span className="q__label">{q.label}</span>;
  const helper = q.helper ? <span className="q__helper">{q.helper}</span> : null;
  const err = error ? <span className="field__err" role="alert">{error}</span> : null;
  const isRouter = q.field === 'situation';

  switch (q.kind) {
    case 'single':
      return (
        <div className="q reveal" role="radiogroup" aria-label={q.label}>
          {label}{helper}
          <div className="tiles">
            {q.options.map((o) => {
              const Icon = isRouter ? MEMBER_ICON[o.value] : undefined;
              return <OptionTile key={o.value} label={o.label} unsure={o.unsure} selected={value === o.value} big={isRouter}
                icon={Icon ? <Icon size={22} /> : undefined} onSelect={() => onChange(o.value)} />;
            })}
          </div>
          {err}
        </div>
      );
    case 'multi': {
      const arr = (value as string[] | undefined) ?? [];
      const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="q reveal" role="group" aria-label={q.label}>
          {label ?? <span className="sr-only">{q.label}</span>}{helper}
          {q.style === 'chips'
            ? <div className="chips">{q.options.map((o) => <Chip key={o.value} label={o.label} on={arr.includes(o.value)} onToggle={() => toggle(o.value)} />)}</div>
            : <div className="tiles">{q.options.map((o) => {
                const Icon = MEMBER_ICON[o.value];
                return <OptionTile key={o.value} multi label={o.label} selected={arr.includes(o.value)} icon={Icon ? <Icon size={20} /> : undefined} onSelect={() => toggle(o.value)} />;
              })}</div>}
          {err}
        </div>
      );
    }
    case 'number':
      return (
        <div className="reveal">
          <Field label={q.label} error={error} why={q.helper}>
            {(id) => <input id={id} className="input num" inputMode="numeric" pattern="[0-9]*" placeholder={q.placeholder} aria-invalid={!!error}
              value={value === undefined ? '' : String(value)} maxLength={2}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); onChange(d ? Number(d) : undefined); }} />}
          </Field>
        </div>
      );
    case 'stepper':
      return (
        <div className="q reveal">
          <span className="q__label">{q.label}</span>
          <Stepper label={q.label} value={value as number | undefined} min={q.min} max={q.max} onChange={onChange} />
          {err}
        </div>
      );
    case 'text': {
      const v = (value as string | undefined) ?? '';
      return (
        <div className="reveal">
          <Field label={q.label} error={error}>
            {(id) => <input id={id} className="input" maxLength={q.maxLength} placeholder={q.placeholder} value={v} onChange={(e) => onChange(e.target.value || undefined)} />}
          </Field>
          <div className="counter num">{v.length}/{q.maxLength}</div>
        </div>
      );
    }
  }
}

export const useQuizIds = () => {
  const { s } = useFlow();
  return useMemo(() => screensForAnswers(s.answers).map((x) => x.id), [s.answers]);
};
