import { Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DROPOFF_WINDOWS, type DropoffWindow } from '@/lib/orderCutoff';

interface DeliveryTimeSelectProps {
  value: DropoffWindow | '';
  onChange: (value: DropoffWindow) => void;
}

export function DeliveryTimeSelect({ value, onChange }: DeliveryTimeSelectProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Clock className="h-4 w-4 text-primary" />
        Preferred Dropoff Window
      </label>
      <Select value={value} onValueChange={(v) => onChange(v as DropoffWindow)}>
        <SelectTrigger className="w-full">
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
      <p className="text-xs text-muted-foreground">
        Deliveries are on Sunday. Choose your preferred time window.
      </p>
    </div>
  );
}
