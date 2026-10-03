/** S0 — Landing. States the promise, the effort and the privacy line. Asks nothing. */
import { useEffect } from 'react';
import { ScreenShell, Notice } from '../ui/components';
import { IconClock, IconList, IconNoUpload, IconUpload } from '../ui/icons';
import { HeroArt } from '../illustrations';
import { headline, t } from '../i18n';
import { useFlow } from '../state/flow';

export function Landing() {
  const { s, api, go } = useFlow();
  const L = s.language;
  useEffect(() => { api.event('landing_viewed', 'S0', { door: s.door }); }, [api, s.door]);

  return (
    <ScreenShell label="S0 Landing" brand wash footer={
      <>
        <Notice>{t(L, 'notice')}</Notice>
        <button className="btn btn--primary" onClick={() => go('S1')}>{t(L, 'start')}</button>
        <button className="btn btn--ghost" style={{ alignSelf: 'center' }} onClick={() => go('U1')}>
          <IconUpload size={18} />{t(L, 'upload')}
        </button>
      </>
    }>
      <div className="hero">
        <div className="hero__art"><HeroArt /></div>
        <h1 className="title title--display" lang={L}>{headline(L, s.door)}</h1>
        <p className="lede" lang={L}>{t(L, 'sub')}</p>
        <div className="facts" lang={L}>
          <span className="fact"><IconClock size={16} />{t(L, 'fact.time')}</span>
          <span className="fact"><IconList size={16} />{t(L, 'fact.qs')}</span>
          <span className="fact"><IconNoUpload size={16} />{t(L, 'fact.noup')}</span>
        </div>
      </div>
      <div className="trust" lang={L}>
        {[1, 2, 3].map((n) => <div key={n}><b>{t(L, `trust.${n}t`)}</b>{t(L, `trust.${n}`)}</div>)}
      </div>
    </ScreenShell>
  );
}
