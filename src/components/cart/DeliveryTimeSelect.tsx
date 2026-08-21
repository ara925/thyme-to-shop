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
  PICKUP_ENABLED,
  PICKUP_WINDOWS,
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
      {PICKUP_ENABLED ? (
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
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            <span className="font-semibold">Local delivery only.</span>{' '}
            Address eligibility is confirmed during checkout.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {windows.length > 0 ? (
          <>
            <label
              id="fulfillment-window-label"
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              {effectiveMethod === 'pickup'
                ? 'Preferred Pickup Window'
                : 'Preferred Local Delivery Window'}
            </label>
            <Select
              value={value}
              onValueChange={handleValueChange}
              disabled={controlsDisabled}
            >
              <SelectTrigger className="w-full" aria-labelledby="fulfillment-window-label">
                <SelectValue
                  placeholder={`Select a ${effectiveMethod === 'pickup' ? 'pickup' : 'delivery'} window`}
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
                ? 'Pickup details are confirmed with your order.'
                : 'Delivery address eligibility is verified at checkout.'}
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <p className="font-semibold">Online delivery scheduling is not available yet.</p>
            <p className="mt-1">
              Place in Thyme still needs to publish its approved Monday and Tuesday windows before online checkout can open.
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
