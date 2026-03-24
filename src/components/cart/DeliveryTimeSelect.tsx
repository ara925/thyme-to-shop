import { Clock, MapPin, Truck } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DROPOFF_WINDOWS, PICKUP_WINDOWS, type FulfillmentMethod, type FulfillmentWindow } from '@/lib/orderCutoff';

interface DeliveryTimeSelectProps {
  fulfillmentMethod: FulfillmentMethod;
  value: FulfillmentWindow | '';
  onMethodChange: (method: FulfillmentMethod) => void;
  onWindowChange: (value: FulfillmentWindow) => void;
}

export function DeliveryTimeSelect({ fulfillmentMethod, value, onMethodChange, onWindowChange }: DeliveryTimeSelectProps) {
  const windows = fulfillmentMethod === 'pickup' ? PICKUP_WINDOWS : DROPOFF_WINDOWS;

  return (
    <div className="space-y-3">
      {/* Fulfillment toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => onMethodChange('delivery')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            fulfillmentMethod === 'delivery'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Truck className="h-4 w-4" />
          Delivery
        </button>
        <button
          type="button"
          onClick={() => onMethodChange('pickup')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            fulfillmentMethod === 'pickup'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <MapPin className="h-4 w-4" />
          Pickup
        </button>
      </div>

      {/* Time window select */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 text-primary" />
          {fulfillmentMethod === 'pickup' ? 'Preferred Pickup Window' : 'Preferred Dropoff Window'}
        </label>
        <Select value={value} onValueChange={(v) => onWindowChange(v as FulfillmentWindow)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={`Select a ${fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery'} time`} />
          </SelectTrigger>
          <SelectContent>
            {windows.map((w) => (
              <SelectItem key={w.value} value={w.value}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {fulfillmentMethod === 'pickup'
            ? 'Pick up on Sunday at our location.'
            : 'Deliveries are on Sunday. Choose your preferred time window.'}
        </p>
      </div>
    </div>
  );
}
