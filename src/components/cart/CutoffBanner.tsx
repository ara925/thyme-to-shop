import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { formatCutoffCountdown, getOrderCutoffStatus } from '@/lib/orderCutoff';

export function CutoffBanner() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const status = getOrderCutoffStatus(now);
  const timeLeft = status.timeUntilCurrentCycleCutoff;
  const countdown = formatCutoffCountdown(now);
  const isUrgent = timeLeft && timeLeft.days === 0 && timeLeft.hours < 6;

  return (
    <div
      className={`flex items-center gap-2 text-sm ${isUrgent ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
      aria-live="polite"
    >
      {isUrgent ? (
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      ) : (
        <Clock className="h-4 w-4 flex-shrink-0" />
      )}
      <span>
        {timeLeft ? (
          <>Order by Thursday 6 PM · <strong>{countdown}</strong> left</>
        ) : (
          <>Cutoff passed — orders apply to next week</>
        )}
      </span>
    </div>
  );
}
