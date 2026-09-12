/**
 * LegalScreen builds its i18n keys at runtime (`legal.${group}.${id}Heading`),
 * so the static t("…") sweep in i18nParity cannot see them. A missing one
 * renders the raw dotted path in the middle of a legal document. Check them.
 */
import { translations } from "../i18n/translations";
import { PRIVACY_SECTION_IDS, TERMS_SECTION_IDS } from "../screens/legalSections";

const groups = [
  ["privacy", PRIVACY_SECTION_IDS],
  ["terms", TERMS_SECTION_IDS],
] as const;

describe("legal section keys", () => {
  for (const locale of ["en", "es"] as const) {
    for (const [group, ids] of groups) {
      it(`${locale}: every ${group} section has a heading and a body`, () => {
        const tree = (translations[locale] as Record<string, any>).legal[group];
        const missing = ids.flatMap((id) =>
          ["Heading", "Body"]
            .filter((part) => typeof tree?.[`${id}${part}`] !== "string" || !tree[`${id}${part}`].trim())
            .map((part) => `legal.${group}.${id}${part}`)
        );
        expect(missing).toEqual([]);
      });
    }
  }
});
