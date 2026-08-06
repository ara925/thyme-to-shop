import { useState } from 'react';
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
  DROPOFF_WINDOWS,
  PICKUP_WINDOWS,
  type FulfillmentMethod,
  type FulfillmentWindow,
} from '@/lib/orderCutoff';
import { getStorefrontErrorMessage } from '@/lib/shopify';

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
  const windows = fulfillmentMethod === 'pickup' ? PICKUP_WINDOWS : DROPOFF_WINDOWS;
  const controlsDisabled = disabled || isSaving;

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
      <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Fulfillment method">
        <button
          type="button"
          onClick={() => onMethodChange('delivery')}
          disabled={controlsDisabled}
          aria-pressed={fulfillmentMethod === 'delivery'}
          className={`flex min-h-11 flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            fulfillmentMethod === 'delivery'
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
          aria-pressed={fulfillmentMethod === 'pickup'}
          className={`flex min-h-11 flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            fulfillmentMethod === 'pickup'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Pickup
        </button>
      </div>

      <div className="space-y-2">
        <label
          id="fulfillment-window-label"
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          {fulfillmentMethod === 'pickup'
            ? 'Preferred Pickup Window'
            : 'Preferred Dropoff Window'}
        </label>
        <Select
          value={value}
          onValueChange={handleValueChange}
          disabled={controlsDisabled}
        >
          <SelectTrigger className="w-full" aria-labelledby="fulfillment-window-label">
            <SelectValue
              placeholder={`Select a ${fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery'} time`}
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
            Saving {fulfillmentMethod} preference…
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {fulfillmentMethod === 'pickup'
            ? 'Pick up on Sunday during your selected window.'
            : 'Sunday delivery during your selected window.'}
        </p>
      </div>
    </div>
  );
}
