import { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { formatCutoffCountdown, getOrderCutoffStatus } from '@/lib/orderCutoff';

export function CutoffBanner() {
  const [now, setNow] = useState(() => new Date());
  const status = getOrderCutoffStatus(now);
  const timeLeft = status.timeUntilCurrentCycleCutoff;
  const isUrgent = Boolean(timeLeft && timeLeft.days === 0 && timeLeft.hours < 6);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className={`flex items-center gap-2 text-sm ${
        isUrgent || status.isCurrentCycleCutoffPassed
          ? 'font-semibold text-destructive'
          : 'text-muted-foreground'
      }`}
    >
      {isUrgent || status.isCurrentCycleCutoffPassed ? (
        <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      ) : (
        <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      )}
      <span>
        {timeLeft ? (
          <>
            Order by Thursday 6 PM ET · <strong>{formatCutoffCountdown(now)}</strong> left
          </>
        ) : (
          <>This week’s cutoff has passed — orders apply to the following week.</>
        )}
      </span>
    </div>
  );
}
