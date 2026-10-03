/** Telecaller context card. Shows only what the person told us; "—" where they told us nothing. */
import { describeAskedFor, type LeadCard } from '@cover-check/shared';

const STATE_LABEL = { hand_raised: 'Hand raised', consented_warm: 'Warm, consented', data_only: 'Data only — do not call', incomplete: 'Incomplete — do not call' } as const;

export function LeadCardView({ card, example }: { card: LeadCard; example?: boolean }) {
  const callable = card.leadState === 'hand_raised' || card.leadState === 'consented_warm';
  const initial = (card.firstName ?? '?').slice(0, 1).toUpperCase();
  return (
    <article className="leadcard" aria-label="Lead card">
      <header className="leadcard__head">
        <span className="leadcard__avatar">{initial}</span>
        <div style={{ flex: 1 }}>
          <div className="leadcard__name">{card.firstName ?? 'Name not given yet'}</div>
          <div className="small muted">{STATE_LABEL[card.leadState]}</div>
        </div>
        {card.priority ? <span className={`badge badge--${card.priority.toLowerCase()}`}>{card.priority}</span> : null}
      </header>
      {example ? <div className="leadcard__tag" style={{ padding: '8px 22px 0' }}>Prototype data — not a real lead</div> : null}
      <dl>
        <dt>Where</dt><dd>{card.where.city ? `${card.where.city} ${card.where.pincode}` : card.where.pincode ?? '—'} · {card.where.mobileVerified ? 'mobile verified by OTP' : 'mobile not verified'}</dd>
        <dt>Asked for</dt><dd>{describeAskedFor(card)}</dd>
        <dt>Situation</dt><dd>{card.situationLine || '—'}</dd>
        <dt>Quiz</dt><dd>{card.quizLine}</dd>
        <dt>Told them</dt><dd>{card.toldThem.length ? card.toldThem.map((t) => `${t.ruleId} ${t.label}`).join(', ') : '—'}</dd>
        <dt>Policy upload</dt><dd>{card.policyUpload}</dd>
        <dt>Consent</dt><dd style={{ color: callable ? undefined : 'var(--danger-700)', fontWeight: callable ? undefined : 600 }}>{card.consentLine}</dd>
      </dl>
      {callable && (
        <div className="script">
          <h3>First minute of the call</h3>
          <blockquote>“{card.openingScript}”</blockquote>
          <ul>
            <li>Open with what they told us and nothing they did not.</li>
            <li>Ask one question to confirm, then explain, then ask permission before showing any plan.</li>
            <li>If they hesitate, offer the summary on WhatsApp and close.</li>
          </ul>
        </div>
      )}
    </article>
  );
}
