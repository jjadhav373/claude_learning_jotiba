/** Flow state for one person's journey. Screens read and update it through useFlow(). */
import { createContext, useCallback, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Bootstrap, CoverSummary, Door, Language, QuizAnswers, Readout, ScreenId, Slot } from '@cover-check/shared';
import type { CoverCheckApi } from '../api/types';

export type Screen = ScreenId | 'BOOT' | 'ERROR';
export type NextAction = 'policy' | 'advisor' | 'plans' | 'summary';

export interface FlowState {
  screen: Screen;
  history: Screen[];
  door: Door;
  language: Language;
  maskedMobile: string;
  mobileVerified: boolean;
  slots: Slot[];
  sessionId: string | null;
  answers: QuizAnswers;
  readout: Readout | null;
  captured: { firstName: string; city: string | null; summarySentAt: string } | null;
  result: { action: NextAction; slotLabel?: string; callLanguage?: Language; queued: boolean; at: string } | null;
  docIds: string[];
  summary: CoverSummary | null;
  fatal?: string;
}

type Action =
  | { type: 'boot'; boot: Bootstrap & { slots: Slot[] } }
  | { type: 'go'; screen: Screen; replace?: boolean }
  | { type: 'back' }
  | { type: 'patch'; patch: Partial<FlowState> }
  | { type: 'reset'; state: FlowState };

export const initialFlow = (door: Door = 'check'): FlowState => ({
  screen: 'BOOT', history: [], door, language: 'en', maskedMobile: '', mobileVerified: false, slots: [], sessionId: null,
  answers: {}, readout: null, captured: null, result: null, docIds: [], summary: null,
});

function reducer(s: FlowState, a: Action): FlowState {
  switch (a.type) {
    case 'boot':
      return { ...s, screen: 'S0', door: a.boot.door, language: a.boot.language, maskedMobile: a.boot.maskedMobile,
        mobileVerified: a.boot.mobileVerified, slots: a.boot.slots, sessionId: a.boot.sessionId, answers: a.boot.answers };
    case 'go':
      if (a.screen === s.screen) return s;
      return { ...s, screen: a.screen, history: a.replace ? s.history : [...s.history, s.screen].slice(-30) };
    case 'back': {
      const prev = s.history[s.history.length - 1];
      return prev ? { ...s, screen: prev, history: s.history.slice(0, -1) } : s;
    }
    case 'patch':
      return { ...s, ...a.patch };
    case 'reset':
      return a.state;
  }
}

interface Ctx {
  s: FlowState;
  api: CoverCheckApi;
  go(screen: Screen, opts?: { replace?: boolean }): void;
  back(): void;
  patch(p: Partial<FlowState>): void;
  dispatch: Dispatch<Action>;
}
const FlowCtx = createContext<Ctx | null>(null);

export function FlowProvider({ api, initial, children }: { api: CoverCheckApi; initial?: FlowState; children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, initial ?? initialFlow());
  const go = useCallback((screen: Screen, opts?: { replace?: boolean }) => {
    dispatch({ type: 'go', screen, replace: opts?.replace });
    if (typeof screen === 'string' && /^[SU]\d/.test(screen)) api.event('screen_viewed', screen as ScreenId);
  }, [api]);
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const patch = useCallback((p: Partial<FlowState>) => dispatch({ type: 'patch', patch: p }), []);
  const value = useMemo(() => ({ s, api, go, back, patch, dispatch }), [s, api, go, back, patch]);
  return <FlowCtx.Provider value={value}>{children}</FlowCtx.Provider>;
}

export function useFlow(): Ctx {
  const c = useContext(FlowCtx);
  if (!c) throw new Error('useFlow outside FlowProvider');
  return c;
}

/** Normalises errors from HttpApi and MockApi into { code, message, details }. */
export const errorOf = (e: unknown): { code: string; message: string; details?: any } => {
  const b = (e as { body?: { code: string; message: string; details?: unknown } })?.body;
  return b ?? { code: 'INTERNAL', message: 'Something went wrong. Your answers are saved — please try again.' };
};
