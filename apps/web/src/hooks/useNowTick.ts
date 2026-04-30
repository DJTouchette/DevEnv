import { useEffect, useState } from "react";

// Re-renders on a fixed interval while `active` is true. Lets components
// recompute relative-time labels (e.g. "2m ago") without external state.
export function useNowTick(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(handle);
  }, [active, intervalMs]);
  return now;
}
