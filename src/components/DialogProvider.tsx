/**
 * DialogProvider — app-wide replacement for the native Alert.alert.
 *
 * Mounts a single BooklizDialog at the root and exposes:
 *   const dialog = useDialog();
 *   dialog.alert(title, body)                          // one button
 *   dialog.alert(title, body, () => goBack())          // one button + callback
 *   dialog.confirm({ title, body, confirmLabel, destructive, onConfirm })
 *
 * Keeps every dialog on-brand (theme-aware, consistent typography) instead of
 * the OS-styled Alert popups.
 */
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useI18n } from "../i18n/LocalizationContext";
import { BooklizDialog } from "./BooklizDialog";

type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

type DialogContextValue = {
  alert: (title: string, body: string, onDone?: () => void) => void;
  confirm: (options: ConfirmOptions) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

type ActiveDialog = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  twoButtons: boolean;
};

export function DialogProvider({ children }: PropsWithChildren) {
  const { t } = useI18n();
  const [active, setActive] = useState<ActiveDialog | null>(null);

  const alert = useCallback((title: string, body: string, onDone?: () => void) => {
    setActive({
      title,
      body,
      confirmLabel: t("common.okay"),
      destructive: false,
      onConfirm: onDone,
      twoButtons: false,
    });
  }, [t]);

  const confirm = useCallback((options: ConfirmOptions) => {
    setActive({
      title: options.title,
      body: options.body,
      confirmLabel: options.confirmLabel ?? t("common.okay"),
      cancelLabel: options.cancelLabel ?? t("common.cancel"),
      destructive: options.destructive ?? false,
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
      twoButtons: true,
    });
  }, [t]);

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  // A button's callback must NOT run while the dialog's native modal is still
  // dismissing. The usual callback is navigation.goBack() on a screen that is
  // itself a native modal (the paywall): UIKit refuses to dismiss a view
  // controller while one it presented is mid-dismissal, so the goBack is
  // dropped and the RN Modal can be left behind as an invisible layer that
  // swallows every touch. App Review hit exactly that (1.3.0 rejection,
  // guideline 2.1: "back button does nothing", "unresponsive after purchase").
  // So: hide first, run the callback once the modal reports it is gone
  // (iOS onDismiss), with a timer as a fallback for Android and for the case
  // where onDismiss never arrives.
  const pendingRef = useRef<(() => void) | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(() => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    const cb = pendingRef.current;
    pendingRef.current = null;
    cb?.();
  }, []);

  const finish = useCallback((cb?: () => void) => {
    setActive(null);
    if (!cb) return;
    pendingRef.current = cb;
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    fallbackRef.current = setTimeout(flushPending, Platform.OS === "ios" ? 600 : 250);
  }, [flushPending]);

  useEffect(() => () => {
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
  }, []);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <BooklizDialog
        open={Boolean(active)}
        title={active?.title ?? ""}
        body={active?.body ?? ""}
        confirmLabel={active?.confirmLabel}
        cancelLabel={active?.cancelLabel}
        variant={active?.destructive ? "destructive" : "default"}
        onConfirm={() => finish(active?.onConfirm)}
        onCancel={active?.twoButtons ? () => finish(active?.onCancel) : undefined}
        onDismissed={flushPending}
      />
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used inside DialogProvider");
  }
  return context;
}
