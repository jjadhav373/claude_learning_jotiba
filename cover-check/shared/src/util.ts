/** Small helpers used by both sides. */

/** +919812345214 → "+91 98••• ••214" (spec format). */
export function maskMobile(e164: string): string {
  const m = e164.replace(/\s/g, '').match(/^\+91(\d{10})$/);
  if (!m) return '••••••••••';
  const d = m[1]!;
  return `+91 ${d.slice(0, 2)}••• ••${d.slice(7)}`;
}

export const isIndianMobile = (v: string) => /^\+91[6-9]\d{9}$/.test(v.replace(/\s/g, ''));
export const toE164 = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length === 10 ? `+91${d}` : d.length === 12 && d.startsWith('91') ? `+${d}` : v;
};

export const isPincode = (v: string) => /^[1-9]\d{5}$/.test(v);
export const isFirstName = (v: string) => v.trim().length >= 2 && v.trim().length <= 40 && /^[\p{L}\p{M} .'-]+$/u.test(v.trim());

/**
 * Demo pincode prefix map so the prototype can fill city/state offline.
 * Production uses the pincode_directory table (India Post data). See data/seeds.
 */
export const PINCODE_PREFIX_DEMO: Record<string, [string, string]> = {
  '110': ['New Delhi', 'Delhi'], '122': ['Gurugram', 'Haryana'], '201': ['Noida', 'Uttar Pradesh'],
  '226': ['Lucknow', 'Uttar Pradesh'], '302': ['Jaipur', 'Rajasthan'], '380': ['Ahmedabad', 'Gujarat'],
  '395': ['Surat', 'Gujarat'], '400': ['Mumbai', 'Maharashtra'], '401': ['Thane', 'Maharashtra'],
  '411': ['Pune', 'Maharashtra'], '422': ['Nashik', 'Maharashtra'], '431': ['Aurangabad', 'Maharashtra'],
  '440': ['Nagpur', 'Maharashtra'], '416': ['Kolhapur', 'Maharashtra'], '452': ['Indore', 'Madhya Pradesh'],
  '500': ['Hyderabad', 'Telangana'], '560': ['Bengaluru', 'Karnataka'], '600': ['Chennai', 'Tamil Nadu'],
  '682': ['Kochi', 'Kerala'], '700': ['Kolkata', 'West Bengal'], '800': ['Patna', 'Bihar'], '751': ['Bhubaneswar', 'Odisha'],
};
