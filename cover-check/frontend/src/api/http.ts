/** Real backend client. The link token comes from the WhatsApp button URL: https://…/c/<token> or ?t=<token>. */
import type { AgentApi, ApiError, CoverCheckApi } from './types';

export class HttpError extends Error {
  constructor(readonly status: number, readonly body: ApiError) { super(body.message); }
}

export function tokenFromLocation(loc = window.location): string | null {
  return loc.pathname.match(/\/c\/([^/]+)/)?.[1] ?? new URLSearchParams(loc.search).get('t');
}

export function createHttpApi(baseUrl: string, token: string): CoverCheckApi {
  const call = async <T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> => {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status, json.error ?? { code: 'INTERNAL', message: 'Something went wrong.' });
    return json as T;
  };
  const fire = (path: string, body: unknown) => { void call('POST', path, body).catch(() => undefined); };

  return {
    bootstrap: () => call('GET', `/link/${encodeURIComponent(token)}${window.location.search}`),
    event: (name, screenId, props) => fire('/events', { name, screenId, props }),
    startQuiz: (language) => call('POST', '/quiz/sessions', { language }),
    saveScreen: (id, screenId, answers, timeOnScreenMs) => call('PUT', `/quiz/sessions/${id}`, { screenId, answers, timeOnScreenMs }),
    completeQuiz: (id) => call('POST', `/quiz/sessions/${id}/complete`),
    readoutDwell: (id, dwellMs) => fire(`/quiz/sessions/${id}/dwell`, { dwellMs }),
    pincode: (pin) => call('GET', `/pincode/${pin}`),
    capture: (input) => call('POST', '/capture', input),
    sendOtp: (purpose) => call('POST', '/otp/send', { purpose }),
    verifyOtp: (code) => call('POST', '/otp/verify', { code }),
    slots: () => call('GET', '/slots'),
    handoff: (input) => call('POST', '/handoff', input),
    withdraw: () => call('POST', '/consents/withdraw', {}),
    docConsent: (language) => call('POST', '/documents/consent', { language }),
    uploadDocs: (files) => { const f = new FormData(); files.forEach((x) => f.append('files', x)); return call('POST', '/documents', f, true); },
    docPassword: (id, password) => call('POST', `/documents/${id}/password`, { password }),
    docStatus: (id) => call('GET', `/documents/${id}`),
    confirmFacts: (id, edits) => call('POST', `/documents/${id}/confirm`, { edits }),
    docSummary: (id) => call('GET', `/documents/${id}/summary`),
  };
}

export function createAgentHttpApi(baseUrl: string, agentKey: string, agentName: string): AgentApi {
  return {
    card: async (leadId) => {
      const res = await fetch(`${baseUrl}/api/v1/agent/leads/${leadId}/card`, { headers: { 'x-agent-key': agentKey, 'x-agent-name': agentName } });
      if (!res.ok) throw new Error('Could not load lead');
      return res.json();
    },
  };
}
