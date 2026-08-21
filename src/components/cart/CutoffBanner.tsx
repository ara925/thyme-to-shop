import { Truck } from 'lucide-react';

export function CutoffBanner() {
  return (
    <div
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Truck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>Local delivery only · Monday and Tuesday scheduling</span>
    </div>
  );
}
