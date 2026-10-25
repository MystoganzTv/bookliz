/**
 * Bookliz Pro purchases (StoreKit 2). Every call degrades to "nothing for
 * sale" where the native module is not in the build — web, Expo Go, a binary
 * from before it existed — so the app never crashes over a paywall.
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type StoreProductType = "autoRenewable" | "nonConsumable" | "consumable" | "nonRenewable" | "unknown";
export type PeriodUnit = "day" | "week" | "month" | "year" | "unknown";

export type StoreProduct = {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  currencyCode: string;
  type: StoreProductType;
  period?: { unit: PeriodUnit; value: number };
  introOffer?: {
    displayPrice: string;
    paymentMode: "freeTrial" | "payAsYouGo" | "payUpFront" | "unknown";
    periodUnit: PeriodUnit;
    periodValue: number;
    periodCount: number;
  };
};

export type StoreEntitlement = {
  productId: string;
  originalTransactionId: string;
  purchaseDate: number;
  expirationDate?: number;
  isUpgraded: boolean;
  type: StoreProductType;
};

export type PurchaseStatus = "success" | "pending" | "cancelled" | "unverified" | "unavailable" | "unknown";
export type PurchaseResult = { status: PurchaseStatus; entitlements?: StoreEntitlement[] };

type Subscription = { remove(): void };

type StoreKitNative = {
  getProducts(ids: string[]): Promise<StoreProduct[]>;
  purchase(id: string): Promise<PurchaseResult>;
  restore(): Promise<StoreEntitlement[]>;
  currentEntitlements(): Promise<StoreEntitlement[]>;
  showManageSubscriptions(): Promise<boolean>;
  canMakePayments(): Promise<boolean>;
  addListener(
    event: "onEntitlementsChanged",
    listener: (payload: { entitlements: StoreEntitlement[] }) => void,
  ): Subscription;
};

const native: StoreKitNative | null =
  Platform.OS === "ios" ? requireOptionalNativeModule<StoreKitNative>("StoreKitBridge") : null;

export const isStoreKitAvailable = native !== null;

export async function getProducts(ids: string[]): Promise<StoreProduct[]> {
  if (!native) return [];
  return native.getProducts(ids);
}

export async function purchase(id: string): Promise<PurchaseResult> {
  if (!native) return { status: "unavailable" };
  return native.purchase(id);
}

export async function restorePurchases(): Promise<StoreEntitlement[]> {
  if (!native) return [];
  return native.restore();
}

export async function currentEntitlements(): Promise<StoreEntitlement[]> {
  if (!native) return [];
  return native.currentEntitlements();
}

export async function showManageSubscriptions(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.showManageSubscriptions();
  } catch {
    return false;
  }
}

export async function canMakePayments(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.canMakePayments();
  } catch {
    return false;
  }
}

export function onEntitlementsChanged(listener: (entitlements: StoreEntitlement[]) => void): Subscription {
  return native
    ? native.addListener("onEntitlementsChanged", (payload) => listener(payload?.entitlements ?? []))
    : { remove() {} };
}
