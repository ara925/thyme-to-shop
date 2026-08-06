import { useEffect, useState } from 'react';
import { getOrderCutoffStatus } from '@/lib/orderCutoff';
import { getOrderableWeekTag, getWeekLabel, type WeekTag } from '@/lib/weekRotation';

interface OrderCycleSnapshot {
  orderableWeek: WeekTag;
  orderableWeekLabel: string;
  cutoffPassed: boolean;
}

function readOrderCycle(): OrderCycleSnapshot {
  const now = new Date();
  const orderableWeek = getOrderableWeekTag(now);
  return {
    orderableWeek,
    orderableWeekLabel: getWeekLabel(orderableWeek),
    cutoffPassed: getOrderCutoffStatus(now).isCurrentCycleCutoffPassed,
  };
}

export function useOrderCycle(): OrderCycleSnapshot {
  const [cycle, setCycle] = useState(readOrderCycle);

  useEffect(() => {
    let intervalId: number | undefined;

    const refresh = () => {
      const next = readOrderCycle();
      setCycle((current) =>
        current.orderableWeek === next.orderableWeek && current.cutoffPassed === next.cutoffPassed
          ? current
          : next,
      );
    };

    // The cutoff is on an exact minute. Aligning the first tick keeps an open
    // catalog in sync without rerendering it every second.
    const firstTickDelay = 60_000 - (Date.now() % 60_000) + 50;
    const timeoutId = window.setTimeout(() => {
      refresh();
      intervalId = window.setInterval(refresh, 60_000);
    }, firstTickDelay);

    const refreshWhenVisible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  return cycle;
}
