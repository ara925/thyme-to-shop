import { useEffect, useState } from 'react';
import { Clock, Loader2, MapPin, Truck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type FulfillmentMethod,
} from '@/lib/orderCutoff';
import { getStorefrontErrorMessage } from '@/lib/shopify';
import {
  DROPOFF_CONFIGURATION_ERROR,
  DROPOFF_WINDOWS,
  DELIVERY_SERVICE_AREA,
  LOCAL_FULFILLMENT_READY,
  PICKUP_ENABLED,
  PICKUP_WINDOWS,
  PICKUP_ADDRESS,
  type FulfillmentWindow,
} from '@/lib/fulfillmentConfig';

interface DeliveryTimeSelectProps {
  fulfillmentMethod: FulfillmentMethod;
  value: FulfillmentWindow | '';
  onMethodChange: (method: FulfillmentMethod) => void;
  onWindowChange: (value: FulfillmentWindow) => Promise<void>;
  disabled?: boolean;
}

export function DeliveryTimeSelect({
  fulfillmentMethod,
  value,
  onMethodChange,
  onWindowChange,
  disabled,
}: DeliveryTimeSelectProps) {
  const [isSaving, setIsSaving] = useState(false);
  const effectiveMethod = PICKUP_ENABLED ? fulfillmentMethod : 'delivery';
  const windows = effectiveMethod === 'pickup' ? PICKUP_WINDOWS : DROPOFF_WINDOWS;
  const controlsDisabled = disabled || isSaving || effectiveMethod !== fulfillmentMethod;
  const pickupScheduleLabel = PICKUP_WINDOWS.map((window) => window.label).join(' or ')
    || 'Monday after 9:00 AM';

  useEffect(() => {
    if (!PICKUP_ENABLED && fulfillmentMethod === 'pickup') {
      onMethodChange('delivery');
    }
  }, [fulfillmentMethod, onMethodChange]);

  const handleValueChange = async (nextValue: string) => {
    setIsSaving(true);
    try {
      await onWindowChange(nextValue as FulfillmentWindow);
    } catch (error) {
      toast.error(getStorefrontErrorMessage(error), { position: 'top-center' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {PICKUP_ENABLED && (
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Fulfillment method">
          <button
            type="button"
            onClick={() => onMethodChange('delivery')}
            disabled={controlsDisabled}
            aria-pressed={effectiveMethod === 'delivery'}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              effectiveMethod === 'delivery'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <Truck className="h-4 w-4" aria-hidden="true" />
            Delivery
          </button>
          <button
            type="button"
            onClick={() => onMethodChange('pickup')}
            disabled={controlsDisabled}
            aria-pressed={effectiveMethod === 'pickup'}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              effectiveMethod === 'pickup'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Pickup
          </button>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
        <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {LOCAL_FULFILLMENT_READY ? (
          <p>
            <span className="font-semibold">Eligible {DELIVERY_SERVICE_AREA} delivery:</span>{' '}
            $15 on orders of $99 or more.
            {PICKUP_ENABLED
              ? ` Free pickup is available at ${PICKUP_ADDRESS} on ${pickupScheduleLabel}.`
              : ''}{' '}
            Shipping is not currently offered.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Online ordering is in test mode.</span>{' '}
            Delivery and pickup checkout remain unavailable until launch activation is complete.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {windows.length > 0 ? (
          <>
            <label
              id="fulfillment-window-label"
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              {effectiveMethod === 'pickup'
                ? 'Preferred Pickup Time'
                : 'Preferred Local Delivery Day'}
            </label>
            <Select
              value={value}
              onValueChange={handleValueChange}
              disabled={controlsDisabled}
            >
              <SelectTrigger className="w-full" aria-labelledby="fulfillment-window-label">
                <SelectValue
                  placeholder={`Select a ${effectiveMethod === 'pickup' ? 'pickup time' : 'delivery day'}`}
                />
              </SelectTrigger>
              <SelectContent>
                {windows.map((window) => (
                  <SelectItem key={window.value} value={window.value}>
                    {window.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSaving && (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Saving {effectiveMethod} preference…
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {effectiveMethod === 'pickup'
                ? `Pickup is free at ${PICKUP_ADDRESS}.`
                : `Eligible ${DELIVERY_SERVICE_AREA} addresses are confirmed at checkout.`}
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <p className="font-semibold">Online local fulfillment is not available yet.</p>
            <p className="mt-1">
              {LOCAL_FULFILLMENT_READY
                ? 'Place in Thyme still needs to publish its approved Monday and Tuesday choices before online checkout can open.'
                : 'Checkout stays disabled while launch testing is in progress.'}
            </p>
            {DROPOFF_CONFIGURATION_ERROR && (
              <span className="sr-only">{DROPOFF_CONFIGURATION_ERROR}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
