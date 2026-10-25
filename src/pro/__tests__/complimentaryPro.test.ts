import { createHash } from "crypto";
import { isComplimentaryHash, normalizeEmail } from "../complimentaryPro";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("complimentary Pro", () => {
  it("normalises before hashing, so case and spaces do not matter", () => {
    expect(normalizeEmail("  Enrique.Padron853@Gmail.com ")).toBe("enrique.padron853@gmail.com");
    expect(normalizeEmail(undefined)).toBe("");
  });

  it("matches the developer account and nothing else", () => {
    expect(isComplimentaryHash(sha(normalizeEmail("Enrique.Padron853@gmail.com")))).toBe(true);
    expect(isComplimentaryHash(sha("someone@else.com"))).toBe(false);
    expect(isComplimentaryHash(sha(""))).toBe(false);
  });
});
