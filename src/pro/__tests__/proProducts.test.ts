import type { StoreEntitlement, StoreProduct } from "../../../modules/store-kit";
import {
  activePlan,
  entitlementsUnlockPro,
  planOfProduct,
  PRO_PRODUCT_IDS,
  yearlySavingsPercent,
} from "../proProducts";

const NOW = Date.UTC(2026, 9, 24);
const DAY = 86_400_000;

const row = (productId: string, extra: Partial<StoreEntitlement> = {}): StoreEntitlement => ({
  productId,
  originalTransactionId: "1",
  purchaseDate: NOW - DAY,
  isUpgraded: false,
  type: "autoRenewable",
  ...extra,
});

const product = (id: string, price: number): StoreProduct => ({
  id,
  displayName: id,
  description: "",
  displayPrice: `$${price}`,
  price,
  currencyCode: "USD",
  type: "autoRenewable",
});

describe("Pro entitlements", () => {
  it("unlocks with a live subscription and not with an expired one", () => {
    expect(entitlementsUnlockPro([row(PRO_PRODUCT_IDS.monthly, { expirationDate: NOW + DAY })], NOW)).toBe(true);
    expect(entitlementsUnlockPro([row(PRO_PRODUCT_IDS.monthly, { expirationDate: NOW - 1 })], NOW)).toBe(false);
  });

  it("lifetime never expires", () => {
    expect(entitlementsUnlockPro([row(PRO_PRODUCT_IDS.lifetime, { type: "nonConsumable" })], NOW)).toBe(true);
  });

  it("ignores products that are not Bookliz Pro", () => {
    expect(entitlementsUnlockPro([row("com.other.app.pro", { expirationDate: NOW + DAY })], NOW)).toBe(false);
    expect(planOfProduct("com.other.app.pro")).toBeNull();
  });

  it("nothing bought means no plan", () => {
    expect(entitlementsUnlockPro([], NOW)).toBe(false);
    expect(activePlan([], NOW)).toBeNull();
  });

  it("lifetime wins over a subscription still running", () => {
    const rows = [
      row(PRO_PRODUCT_IDS.yearly, { expirationDate: NOW + 100 * DAY }),
      row(PRO_PRODUCT_IDS.lifetime, { type: "nonConsumable" }),
    ];
    expect(activePlan(rows, NOW)).toBe("lifetime");
  });

  it("an expired yearly does not count next to a live monthly", () => {
    const rows = [
      row(PRO_PRODUCT_IDS.yearly, { expirationDate: NOW - DAY }),
      row(PRO_PRODUCT_IDS.monthly, { expirationDate: NOW + DAY }),
    ];
    expect(activePlan(rows, NOW)).toBe("monthly");
  });
});

describe("yearly savings badge", () => {
  it("compares the yearly price with twelve months", () => {
    // 3.99 × 12 = 47.88 → 29.99 saves 37%
    expect(yearlySavingsPercent(product(PRO_PRODUCT_IDS.monthly, 3.99), product(PRO_PRODUCT_IDS.yearly, 29.99))).toBe(37);
  });

  it("is hidden without both prices or when there is no saving", () => {
    expect(yearlySavingsPercent(undefined, product(PRO_PRODUCT_IDS.yearly, 29.99))).toBeNull();
    expect(yearlySavingsPercent(product(PRO_PRODUCT_IDS.monthly, 1), product(PRO_PRODUCT_IDS.yearly, 20))).toBeNull();
  });
});
