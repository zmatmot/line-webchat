"use client";

import { useEffect } from "react";

const DISMISS_AFTER_MS = 6000;

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
    >
      <p className="min-w-0 flex-1 break-words">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 font-semibold opacity-80 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
