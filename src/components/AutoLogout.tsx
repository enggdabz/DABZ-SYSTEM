"use client";

import { useEffect, useRef } from "react";

import { signOutAction } from "@/app/login/actions";

/**
 * Signs an idle person out (spec 4.1).
 *
 * The counter computer is shared, so an unattended screen left on the payroll
 * page is a real risk. Any real activity - a key, a click, a touch, a scroll -
 * resets the clock.
 *
 * The timer is only a convenience: the session itself expires server-side, and
 * every screen re-checks who is asking.
 */
export function AutoLogout({ minutes }: { minutes: number }) {
  // Held in a ref rather than state: changing it must not re-render the page
  // the person is reading.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const idleMs = Math.max(1, minutes) * 60_000;

    function signOut() {
      void signOutAction();
    }

    function resetTimer() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(signOut, idleMs);
    }

    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;
    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
      if (timer.current) clearTimeout(timer.current);
    };
  }, [minutes]);

  return null;
}
