import enJson from '../locales/en.json';
import plJson from '../locales/pl.json';

export type Language = 'en' | 'pl';

export const enTranslations: Record<string, string> = enJson as Record<string, string>;
export const plTranslations: Record<string, string> = plJson as Record<string, string>;

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: enTranslations,
  pl: plTranslations,
};

export function normalizeLanguage(lang?: string | null): Language {
  if (typeof lang === 'string' && lang.toLowerCase().startsWith('pl')) return 'pl';
  return 'en';
}

export function getTranslations(lang?: string | null): Record<string, string> {
  const normalized = normalizeLanguage(lang);
  return TRANSLATIONS[normalized] || enTranslations;
}

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name) => {
    const value = vars[name];
    return value == null ? '' : String(value);
  });
}

export function t(
  key: string,
  langOrVars?: string | Record<string, unknown> | null,
  vars?: Record<string, unknown>,
): string {
  let lang: string | null | undefined;
  let variables: Record<string, unknown> | undefined;
  if (typeof langOrVars === 'string' || langOrVars == null) {
    lang = langOrVars as string | null | undefined;
    variables = vars;
  } else {
    lang = 'en';
    variables = langOrVars;
  }
  const translations = getTranslations(lang);
  const template = translations[key] ?? enTranslations[key] ?? key;
  return interpolate(template, variables);
}
