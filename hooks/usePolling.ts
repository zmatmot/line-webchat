"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` immediately and then `intervalMs` after each run settles,
 * so slow responses never overlap. Polling stops while the tab is hidden and
 * resumes with an immediate run when it becomes visible again.
 */
export function usePolling(
  callback: () => Promise<void>,
  intervalMs: number,
  enabled = true,
): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async (): Promise<void> => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        await savedCallback.current();
      } catch {
        // Callbacks report their own errors; keep the loop alive regardless.
      } finally {
        inFlight = false;
      }
      if (active && !document.hidden) {
        timer = setTimeout(run, intervalMs);
      }
    };

    const onVisibilityChange = (): void => {
      clearTimeout(timer);
      if (!document.hidden) void run();
    };

    void run();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
