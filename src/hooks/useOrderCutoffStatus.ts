import { useEffect, useState } from 'react';
import {
  getNextOrderAvailabilityTransition,
  getOrderCutoffStatus,
} from '@/lib/orderCutoff';

const MAX_TIMER_DELAY_MS = 2_147_000_000;

/** Keeps cutoff-dependent UI current when an open page crosses a weekly boundary. */
export function useOrderCutoffStatus() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const transition = getNextOrderAvailabilityTransition(now);
    const delay = Math.min(
      Math.max(transition.getTime() - Date.now(), 0) + 50,
      MAX_TIMER_DELAY_MS,
    );
    const timer = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [now]);

  return getOrderCutoffStatus(now);
}
