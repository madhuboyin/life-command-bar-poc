"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toastStyles } from "../../lib/ui";
import { useIsMobile } from "../../lib/use-is-mobile";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (input: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const isMobile = useIsMobile();

  const showToast = useCallback((input: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const item: ToastItem = { id, ...input };

    setItems((prev) => [...prev, item]);

    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div style={isMobile ? toastStyles.viewportMobile : toastStyles.viewport}>
        {items.map((item) => {
          const variantStyle =
            item.variant === "success"
              ? toastStyles.success
              : item.variant === "error"
                ? toastStyles.error
                : toastStyles.info;

          return (
            <div key={item.id} style={{ ...toastStyles.base, ...variantStyle }}>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              {item.description ? (
                <div style={{ marginTop: 4, fontSize: 13 }}>{item.description}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
