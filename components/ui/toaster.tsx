"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";

export const Toaster = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && toasts.length > 0) {
        removeToast(toasts[0]!.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [removeToast, toasts]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[999] flex flex-col items-end gap-3 p-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="assertive"
          className={cn(
            "pointer-events-auto w-full max-w-sm rounded-xl border border-white/10 bg-hubba-black/90 p-4 shadow-lg backdrop-blur",
            toast.variant === "destructive"
              ? "border-red-500/60 text-red-200"
              : "border-hubba-green/60 text-white"
          )}
        >
          <p className="text-lg font-semibold">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 text-sm text-slate-300">{toast.description}</p>
          ) : null}
        </div>
      ))}
    </div>,
    document.body
  );
};
