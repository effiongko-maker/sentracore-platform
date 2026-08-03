"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (input: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: "border-emerald-200 bg-white text-success",
  error: "border-red-200 bg-white text-danger",
  info: "border-blue-200 bg-white text-accent",
  warning: "border-amber-200 bg-white text-amber-700",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((input: Omit<ToastItem, "id">) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setItems((current) => [...current, { ...input, id }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {items.map((item) => {
            const Icon = icons[item.type];
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "pointer-events-auto flex items-start gap-3 rounded-sc border px-4 py-3 shadow-sc-lg",
                  styles[item.type]
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  {item.description ? (
                    <p className="mt-0.5 text-xs text-muted">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded-md p-1 text-muted transition-colors hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
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
