/** Line icons, 24px grid, 1.75 stroke, currentColor. Drawn for Cover Check. */
import type { ReactElement, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 20, ...p }: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
});

export const IconBack = (p: P) => <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>;
export const IconCheck = (p: P) => <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconLock = (p: P) => <svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></svg>;
export const IconInfo = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></svg>;
export const IconQuestion = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.3M12 17v.1" /></svg>;
export const IconClock = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>;
export const IconList = (p: P) => <svg {...base(p)}><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" /></svg>;
export const IconNoUpload = (p: P) => <svg {...base(p)}><path d="M12 15V5M8 9l4-4 4 4M5 19h14" /><path d="M4 4l16 16" /></svg>;
export const IconUser = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></svg>;
export const IconUsers = (p: P) => <svg {...base(p)}><circle cx="9" cy="8.5" r="3" /><circle cx="17" cy="9.5" r="2.5" /><path d="M3.5 19c.6-3 2.9-4.8 5.5-4.8s4.9 1.8 5.5 4.8M15 14.6c2.6-.3 4.8 1.2 5.5 4" /></svg>;
export const IconBriefcase = (p: P) => <svg {...base(p)}><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5M3.5 12.5h17" /></svg>;
export const IconShieldOff = (p: P) => <svg {...base(p)}><path d="M12 3.5l7 2.6v5.4c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6.1z" /><path d="M9.5 12h5" /></svg>;
export const IconShield = (p: P) => <svg {...base(p)}><path d="M12 3.5l7 2.6v5.4c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6.1z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></svg>;
export const IconFile = (p: P) => <svg {...base(p)}><path d="M14 3.5H7.5a2 2 0 00-2 2v13a2 2 0 002 2h9a2 2 0 002-2V8z" /><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" /></svg>;
export const IconUpload = (p: P) => <svg {...base(p)}><path d="M12 15V4.5M7.5 9L12 4.5 16.5 9M5 15.5v2a2 2 0 002 2h10a2 2 0 002-2v-2" /></svg>;
export const IconHeadset = (p: P) => <svg {...base(p)}><path d="M4.5 14v-2a7.5 7.5 0 0115 0v2" /><rect x="3.5" y="13" width="4" height="6" rx="1.5" /><rect x="16.5" y="13" width="4" height="6" rx="1.5" /><path d="M18.5 19c0 1.2-1.5 2-4 2h-2" /></svg>;
export const IconSparkle = (p: P) => <svg {...base(p)}><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>;
export const IconChat = (p: P) => <svg {...base(p)}><path d="M20 11.5a8 8 0 01-11.6 7.1L4 20l1.4-4.2A8 8 0 1120 11.5z" /><path d="M8.5 10.5h7M8.5 13.5h4.5" /></svg>;
export const IconPhone = (p: P) => <svg {...base(p)}><path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 005.2 5.2l1.3-2 4 1.5v3a2 2 0 01-2.2 2A16 16 0 014.5 5.7a2 2 0 012-2.2z" /></svg>;
export const IconEdit = (p: P) => <svg {...base(p)}><path d="M14.5 5.5l4 4M4.5 19.5l1-4.5L15.8 4.7a1.4 1.4 0 012 0l1.5 1.5a1.4 1.4 0 010 2L9 18.5z" /></svg>;
export const IconStop = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M8.5 15.5l7-7" /></svg>;
export const IconLink = (p: P) => <svg {...base(p)}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>;
export const IconMinus = (p: P) => <svg {...base(p)}><path d="M6 12h12" /></svg>;
export const IconPlus = (p: P) => <svg {...base(p)}><path d="M12 6v12M6 12h12" /></svg>;
export const IconAlert = (p: P) => <svg {...base(p)}><path d="M12 4l9 15.5H3z" /><path d="M12 10v4.5M12 17v.1" /></svg>;
export const IconChild = (p: P) => <svg {...base(p)}><circle cx="12" cy="7" r="2.8" /><path d="M7 20l1.4-6.5A3.6 3.6 0 0112 10.5a3.6 3.6 0 013.6 3L17 20M8.6 16h6.8" /></svg>;
export const IconHeart = (p: P) => <svg {...base(p)}><path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0112 7a4.2 4.2 0 017.5 2.5c0 5.6-7.5 10-7.5 10z" /></svg>;
export const IconCalendar = (p: P) => <svg {...base(p)}><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3.5v4M16 3.5v4" /></svg>;
export const IconRupee = (p: P) => <svg {...base(p)}><path d="M7 5h10M7 9h10M7 5c4.5 0 6 1.5 6 4s-2 4-6 4l7 6" /></svg>;
export const IconBed = (p: P) => <svg {...base(p)}><path d="M3.5 18.5V6.5M3.5 14h17v4.5M20.5 14v-2.5a3 3 0 00-3-3h-7v5.5" /><circle cx="7" cy="10.5" r="2" /></svg>;

export const MEMBER_ICON: Record<string, (p: P) => ReactElement> = {
  self: IconUser, spouse: IconHeart, children: IconChild, parents: IconUsers, parents_in_law: IconUsers,
  none: IconShieldOff, own: IconShield, group: IconBriefcase,
};
