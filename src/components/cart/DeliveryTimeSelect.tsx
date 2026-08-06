import { useState } from 'react';
import { Clock, Loader2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DROPOFF_WINDOWS, type FulfillmentWindow } from '@/lib/orderCutoff';
import { getStorefrontErrorMessage } from '@/lib/shopify';

interface DeliveryTimeSelectProps {
  value: FulfillmentWindow | '';
  onWindowChange: (value: FulfillmentWindow) => Promise<void>;
  disabled?: boolean;
}

export function DeliveryTimeSelect({ value, onWindowChange, disabled }: DeliveryTimeSelectProps) {
  const [isSaving, setIsSaving] = useState(false);

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
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 text-sm font-medium">
        <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
        Sunday delivery
      </div>
      <div className="space-y-2">
        <label id="delivery-window-label" className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          Preferred dropoff window
        </label>
        <Select value={value} onValueChange={handleValueChange} disabled={disabled || isSaving}>
          <SelectTrigger className="w-full" aria-labelledby="delivery-window-label">
            <SelectValue placeholder="Select a delivery time" />
          </SelectTrigger>
          <SelectContent>
            {DROPOFF_WINDOWS.map((window) => (
              <SelectItem key={window.value} value={window.value}>
                {window.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSaving && (
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Saving delivery preference…
          </p>
        )}
        <p className="text-xs text-muted-foreground">Online checkout currently supports delivery only.</p>
      </div>
    </div>
  );
}
