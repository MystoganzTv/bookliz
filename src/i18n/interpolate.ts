export type TranslationVars = Record<string, string | number>;

/**
 * "{count|book|books}" picks the singular when that variable is exactly 1 and
 * the plural otherwise (0 included), which is the rule for both English and
 * Spanish. It also covers agreement around the number: "{count|Te falta|Te
 * faltan} {count} {count|libro|libros}".
 */
const PLURAL_PATTERN = /\{(\w+)\|([^|{}]*)\|([^|{}]*)\}/g;

export function interpolate(template: string, vars?: TranslationVars) {
  if (!vars) return template;
  const withPlurals = template.replace(PLURAL_PATTERN, (match, name: string, one: string, other: string) =>
    name in vars ? (Number(vars[name]) === 1 ? one : other) : match
  );
  return Object.entries(vars).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    withPlurals
  );
}
