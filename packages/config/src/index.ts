/** The six product pillars — drive navigation, permissions, reporting and docs. */
export const PILLARS = [
  { key: 'people', en: 'People', sw: 'Watu' },
  { key: 'time', en: 'Time', sw: 'Muda' },
  { key: 'payroll', en: 'Payroll', sw: 'Mishahara' },
  { key: 'compliance', en: 'Compliance', sw: 'Uzingatiaji' },
  { key: 'experience', en: 'Employee Experience', sw: 'Huduma za Wafanyakazi' },
  { key: 'ai', en: 'AI Intelligence', sw: 'Akili Bandia' },
] as const;

export type PillarKey = (typeof PILLARS)[number]['key'];

export const LOCALES = ['en', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_TIMEZONE = 'Africa/Dar_es_Salaam';
export const DEFAULT_CURRENCY = 'TZS';
