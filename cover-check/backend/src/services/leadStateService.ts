/** Re-derives lead_state and priority after anything that could change them. */
import { computePriority, deriveLeadState, isQuizCoreComplete, type LeadState, type Priority } from '@cover-check/shared';
import type { Repos } from '../repositories/index.js';

export async function recomputeLeadState(r: Repos, leadId: string): Promise<{ state: LeadState; priority: Priority | null }> {
  const lead = await r.leads.get(leadId);
  if (!lead) throw new Error('lead not found');
  const session = await r.quiz.latestSession(leadId);
  const answers = session ? await r.quiz.getAnswers(session.session_id) : {};
  const doc = await r.documents.latestForLead(leadId);
  const docFacts = doc ? await r.documents.facts(doc.doc_id) : [];
  const docConfirmed = docFacts.length > 0 && docFacts.every((f) => f.userConfirmed);

  const captured = lead.mobile_confirmed && !!lead.first_name && !!lead.pincode;
  const completed = (captured && isQuizCoreComplete(answers)) || docConfirmed;

  const handoff = await r.handoffs.latest(leadId);
  const contact = await r.consents.isGranted(leadId, 'contact_call');
  const state = deriveLeadState({ completed, requestedAction: handoff?.requested_action ?? null, contactConsent: !!contact && !lead.do_not_contact });

  const findings = await r.findings.forLead(leadId);
  const priority = computePriority({ leadState: state, answers, reviewPoints: findings.filter((f) => f.severity === 'review').length });

  await r.leads.setStateAndPriority(leadId, state, priority);
  return { state, priority };
}
