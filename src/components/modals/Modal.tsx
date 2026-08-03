"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "lg",
  className,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-primary/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className={cn(
              "relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-sc border border-border bg-card shadow-sc-lg",
              sizeMap[size],
              className
            )}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/80 px-6 py-5">
              <div>
                <h2
                  id="modal-title"
                  className="text-lg font-semibold tracking-tight text-primary"
                >
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 text-sm text-muted">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-muted transition-colors duration-150 hover:bg-slate-100 hover:text-foreground"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-border/80 bg-slate-50/70 px-6 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
