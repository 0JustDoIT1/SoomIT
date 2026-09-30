"use client";

import { useCallback, useRef, useState } from "react";

// The ref closes the same-tick double-click window before React re-renders.
export function useAnnotationMutation() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const begin = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    return true;
  }, []);
  const end = useCallback(() => {
    locked.current = false;
    setBusy(false);
  }, []);
  const isLocked = useCallback(() => locked.current, []);
  return { isLocked, busy, begin, end };
}
