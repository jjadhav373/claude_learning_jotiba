/**
 * UI strings. Landing and shared controls are translated; question copy is English-only until
 * compliance signs off the English and translation follows (spec: "All wording is a draft for compliance").
 */
import type { Door, Language } from '@cover-check/shared';

type Dict = Record<string, string>;
const en: Dict = {
  'head.get': 'Find the right health cover in 60 seconds',
  'head.check': 'Check your health cover in 60 seconds',
  'head.company': 'See what your company cover really covers',
  'head.review': 'Review your cover before you renew',
  'sub': 'Free · Plain language · A call only if you ask for one',
  'fact.time': '60 seconds', 'fact.qs': '6 questions', 'fact.noup': 'No upload, no login',
  'notice': 'We save your answers to build your summary. We do not share them with insurers.',
  'start': 'Start the quiz', 'upload': 'I have my policy handy — upload it',
  'continue': 'Continue', 'back': 'Back', 'step': 'Step {n} of 6',
  'trust.1t': 'No score', 'trust.1': 'Just what you know and what to check',
  'trust.2t': 'No ranking', 'trust.2': 'We never rank insurers here',
  'trust.3t': 'Your call', 'trust.3': 'Nobody phones unless you ask',
};
const hi: Dict = {
  'head.get': '60 सेकंड में जानिए कौन-सा हेल्थ कवर आपके लिए सही है',
  'head.check': '60 सेकंड में अपना हेल्थ कवर चेक करें',
  'head.company': 'जानिए आपका कंपनी कवर असल में क्या कवर करता है',
  'head.review': 'रिन्यू करने से पहले अपना कवर देख लें',
  'sub': 'मुफ़्त · आसान भाषा · कॉल सिर्फ़ आपके कहने पर',
  'fact.time': '60 सेकंड', 'fact.qs': '6 सवाल', 'fact.noup': 'न अपलोड, न लॉगिन',
  'notice': 'आपका सारांश बनाने के लिए हम आपके जवाब सेव करते हैं। हम इन्हें बीमा कंपनियों के साथ शेयर नहीं करते।',
  'start': 'क्विज़ शुरू करें', 'upload': 'मेरे पास पॉलिसी है — अपलोड करें',
  'continue': 'आगे बढ़ें', 'back': 'पीछे', 'step': 'स्टेप {n} / 6',
  'trust.1t': 'कोई स्कोर नहीं', 'trust.1': 'बस आप क्या जानते हैं और क्या चेक करना है',
  'trust.2t': 'कोई रैंकिंग नहीं', 'trust.2': 'हम यहाँ बीमा कंपनियों की रैंकिंग नहीं करते',
  'trust.3t': 'आपकी मर्ज़ी', 'trust.3': 'आपके कहे बिना कोई कॉल नहीं',
};
const mr: Dict = {
  'head.get': '६० सेकंदांत जाणून घ्या कोणतं हेल्थ कवर तुमच्यासाठी योग्य आहे',
  'head.check': '६० सेकंदांत तुमचं हेल्थ कवर तपासा',
  'head.company': 'तुमचं कंपनी कवर नक्की काय कवर करतं ते पाहा',
  'head.review': 'रिन्यू करण्याआधी तुमचं कवर तपासा',
  'sub': 'मोफत · सोपी भाषा · कॉल फक्त तुम्ही सांगितलं तरच',
  'fact.time': '६० सेकंद', 'fact.qs': '६ प्रश्न', 'fact.noup': 'अपलोड नाही, लॉगिन नाही',
  'notice': 'तुमचा सारांश तयार करण्यासाठी आम्ही तुमची उत्तरं सेव्ह करतो. आम्ही ती विमा कंपन्यांसोबत शेअर करत नाही.',
  'start': 'क्विझ सुरू करा', 'upload': 'माझ्याकडे पॉलिसी आहे — अपलोड करा',
  'continue': 'पुढे जा', 'back': 'मागे', 'step': 'पायरी {n} / ६',
  'trust.1t': 'स्कोर नाही', 'trust.1': 'फक्त तुम्हाला काय माहीत आहे आणि काय तपासायचं',
  'trust.2t': 'रँकिंग नाही', 'trust.2': 'आम्ही इथे विमा कंपन्यांची रँकिंग करत नाही',
  'trust.3t': 'तुमची निवड', 'trust.3': 'तुम्ही सांगितल्याशिवाय कॉल नाही',
};
const DICTS: Record<Language, Dict> = { en, hi, mr };

export const t = (lang: Language, key: string, vars: Record<string, string | number> = {}) =>
  (DICTS[lang][key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
export const headline = (lang: Language, door: Door) => t(lang, `head.${door}`);
export const LANG_LABEL: Record<Language, string> = { en: 'EN', hi: 'हिं', mr: 'मरा' };
