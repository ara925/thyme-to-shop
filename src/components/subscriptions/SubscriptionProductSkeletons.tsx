import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface SubscriptionProductSkeletonsProps {
  itemLabel: string;
}

export function SubscriptionProductSkeletons({
  itemLabel,
}: SubscriptionProductSkeletonsProps) {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading live {itemLabel} options</span>
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="border-0 shadow-sm" aria-hidden="true">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
            <div className="min-w-[9rem] flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3 max-w-64" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0" />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-11 w-11 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
