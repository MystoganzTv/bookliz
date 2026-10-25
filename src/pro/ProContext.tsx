/**
 * Bookliz Pro state. StoreKit is the source of truth; the last verified answer
 * is cached so Pro features keep working offline (a subscription's cached
 * expiry is still honoured, so an offline install cannot stay Pro forever).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import {
  currentEntitlements,
  getProducts,
  isStoreKitAvailable,
  onEntitlementsChanged,
  purchase,
  PurchaseStatus,
  restorePurchases,
  showManageSubscriptions,
  StoreEntitlement,
  StoreProduct,
} from "../../modules/store-kit";
import {
  activePlan,
  ALL_PRO_PRODUCT_IDS,
  entitlementsUnlockPro,
  PRO_PRODUCT_IDS,
  ProPlan,
} from "./proProducts";

const CACHE_KEY = "@bookliz/pro-entitlements";
/** Development-only switch (Settings > Debug) to try Pro without buying. */
export const DEBUG_PRO_KEY = "@bookliz/pro-debug";

export type ProFeature = "watchStandalone" | "cloudAudio" | "appIcons" | "accentThemes" | "yearInReview";

export const PRO_FEATURES: ProFeature[] = ["watchStandalone", "cloudAudio", "yearInReview", "accentThemes", "appIcons"];

type ProContextValue = {
  isPro: boolean;
  plan: ProPlan | null;
  /** Expiry of the active subscription (ms); undefined for lifetime or none. */
  renewsAt?: number;
  products: StoreProduct[];
  productsLoading: boolean;
  storeAvailable: boolean;
  debugPro: boolean;
  setDebugPro: (value: boolean) => void;
  buy: (plan: ProPlan) => Promise<PurchaseStatus>;
  restore: () => Promise<boolean>;
  manage: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const ProContext = createContext<ProContextValue>({
  isPro: false,
  plan: null,
  products: [],
  productsLoading: false,
  storeAvailable: false,
  debugPro: false,
  setDebugPro: () => {},
  buy: async () => "unavailable",
  restore: async () => false,
  manage: async () => false,
  refresh: async () => {},
});

function sanitizeEntitlements(value: unknown): StoreEntitlement[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is StoreEntitlement =>
      !!row && typeof row === "object" && typeof (row as StoreEntitlement).productId === "string",
  );
}

export function ProProvider({ children }: PropsWithChildren) {
  const [entitlements, setEntitlements] = useState<StoreEntitlement[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(isStoreKitAvailable);
  const [debugPro, setDebugProState] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  const accept = useCallback((rows: StoreEntitlement[]) => {
    if (!mounted.current) return;
    setEntitlements(rows);
    setNow(Date.now());
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows)).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!isStoreKitAvailable) return;
    try {
      accept(await currentEntitlements());
    } catch {
      // Offline or StoreKit busy: keep the cached answer.
    }
  }, [accept]);

  const loadProducts = useCallback(async () => {
    if (!isStoreKitAvailable) return;
    setProductsLoading(true);
    try {
      const rows = await getProducts(ALL_PRO_PRODUCT_IDS);
      if (mounted.current) setProducts(rows);
    } catch {
      // The paywall falls back to list prices and retries when opened.
    } finally {
      if (mounted.current) setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    AsyncStorage.multiGet([CACHE_KEY, DEBUG_PRO_KEY])
      .then(([[, cached], [, debug]]) => {
        if (!mounted.current) return;
        if (cached) {
          try {
            setEntitlements((current) => (current.length ? current : sanitizeEntitlements(JSON.parse(cached))));
          } catch {
            // A corrupt cache is simply ignored.
          }
        }
        if (__DEV__ && debug === "1") setDebugProState(true);
      })
      .catch(() => {});
    refresh();
    loadProducts();
    const updates = onEntitlementsChanged(accept);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      mounted.current = false;
      updates.remove();
      appState.remove();
    };
  }, [accept, loadProducts, refresh]);

  const buy = useCallback(
    async (plan: ProPlan): Promise<PurchaseStatus> => {
      const result = await purchase(PRO_PRODUCT_IDS[plan]);
      if (result.entitlements) accept(result.entitlements);
      else if (result.status === "success") await refresh();
      return result.status;
    },
    [accept, refresh],
  );

  const restore = useCallback(async () => {
    const rows = await restorePurchases();
    accept(rows);
    return entitlementsUnlockPro(rows);
  }, [accept]);

  const setDebugPro = useCallback((value: boolean) => {
    if (!__DEV__) return;
    setDebugProState(value);
    AsyncStorage.setItem(DEBUG_PRO_KEY, value ? "1" : "0").catch(() => {});
  }, []);

  const value = useMemo<ProContextValue>(() => {
    const plan = activePlan(entitlements, now);
    const subscription = plan && plan !== "lifetime"
      ? entitlements.find((row) => row.productId === PRO_PRODUCT_IDS[plan])
      : undefined;
    return {
      isPro: (__DEV__ && debugPro) || entitlementsUnlockPro(entitlements, now),
      plan,
      renewsAt: subscription?.expirationDate,
      products,
      productsLoading,
      storeAvailable: isStoreKitAvailable,
      debugPro,
      setDebugPro,
      buy,
      restore,
      manage: showManageSubscriptions,
      refresh,
    };
  }, [buy, debugPro, entitlements, now, products, productsLoading, refresh, restore, setDebugPro]);

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro() {
  return useContext(ProContext);
}
