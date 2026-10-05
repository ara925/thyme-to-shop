import { Truck } from 'lucide-react';
import {
  getCutoffBannerMessage,
} from '@/lib/orderCutoff';
import { LOCAL_FULFILLMENT_READY } from '@/lib/fulfillmentConfig';
import { useOrderCutoffStatus } from '@/hooks/useOrderCutoffStatus';

export function CutoffBanner() {
  const { isCurrentCycleCutoffPassed } = useOrderCutoffStatus();

  return (
    <div
      className="flex items-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <Truck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>{getCutoffBannerMessage(LOCAL_FULFILLMENT_READY, isCurrentCycleCutoffPassed)}</span>
    </div>
  );
}
