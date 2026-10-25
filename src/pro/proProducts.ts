/**
 * Bookliz Pro catalogue. The ids must match App Store Connect (subscription
 * group "Bookliz Pro" + one non-consumable) and ios/Booklio/Bookliz.storekit.
 * Prices live in App Store Connect; these are only the fallbacks shown when
 * StoreKit has not answered yet (or in a build without the native module).
 */
import type { StoreEntitlement, StoreProduct } from "../../modules/store-kit";

export const PRO_PRODUCT_IDS = {
  monthly: "com.mystodev.booklio.pro.monthly",
  yearly: "com.mystodev.booklio.pro.yearly",
  lifetime: "com.mystodev.booklio.pro.lifetime",
} as const;

export type ProPlan = keyof typeof PRO_PRODUCT_IDS;

export const PRO_PLANS: ProPlan[] = ["yearly", "monthly", "lifetime"];

export const ALL_PRO_PRODUCT_IDS: string[] = PRO_PLANS.map((plan) => PRO_PRODUCT_IDS[plan]);

export const FALLBACK_PRICES: Record<ProPlan, string> = {
  monthly: "$3.99",
  yearly: "$29.99",
  lifetime: "$59.99",
};

export function planOfProduct(productId: string): ProPlan | null {
  const match = PRO_PLANS.find((plan) => PRO_PRODUCT_IDS[plan] === productId);
  return match ?? null;
}

export function productForPlan(products: StoreProduct[], plan: ProPlan): StoreProduct | undefined {
  return products.find((product) => product.id === PRO_PRODUCT_IDS[plan]);
}

/**
 * Whether a set of verified entitlements unlocks Pro right now. StoreKit
 * already drops expired/revoked rows from currentEntitlements; the expiry
 * check is for the cached copy read while offline.
 */
export function entitlementsUnlockPro(entitlements: StoreEntitlement[], now: number = Date.now()): boolean {
  return entitlements.some((row) => {
    if (!planOfProduct(row.productId)) return false;
    if (row.type === "nonConsumable") return true;
    if (row.expirationDate === undefined) return true;
    return row.expirationDate > now;
  });
}

/** The plan that is active (lifetime wins over a subscription bought before it). */
export function activePlan(entitlements: StoreEntitlement[], now: number = Date.now()): ProPlan | null {
  const live = entitlements.filter((row) => entitlementsUnlockPro([row], now));
  const plans = live.map((row) => planOfProduct(row.productId)).filter((plan): plan is ProPlan => plan !== null);
  if (plans.includes("lifetime")) return "lifetime";
  if (plans.includes("yearly")) return "yearly";
  if (plans.includes("monthly")) return "monthly";
  return null;
}

/** Yearly price expressed per month, for the "save X%" badge. */
export function yearlySavingsPercent(monthly?: StoreProduct, yearly?: StoreProduct): number | null {
  if (!monthly || !yearly || monthly.price <= 0) return null;
  const fullYear = monthly.price * 12;
  const saving = Math.round(((fullYear - yearly.price) / fullYear) * 100);
  return saving > 0 ? saving : null;
}
