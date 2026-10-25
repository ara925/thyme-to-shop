import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/shopify';
import { previewMealRotation, rotationApiUrl, rotationDateLabel, rotationWeekLabel, ROTATION_WEEKS, type RotationPreview, type RotationSelections } from '@/lib/rotationService';
import { MealEnrollmentCheckout } from './SubscriptionCheckout';

export function MealRotationReview({ selections }: { selections: RotationSelections | null }) {
  const key = JSON.stringify(selections);
  const [result, setResult] = useState<{ key: string; preview: RotationPreview } | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => {
    setError('');
    setPending(false);
    controller.current?.abort();
    return () => controller.current?.abort();
  }, [key]);

  async function review() {
    if (!selections) return;
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setError('');
    setResult(null);
    try {
      const preview = await previewMealRotation(selections, current.signal);
      if (!current.signal.aborted) setResult({ key, preview });
    } catch (error) {
      if (!current.signal.aborted) setError(error instanceof Error ? error.message : 'Please try again.');
    } finally { if (!current.signal.aborted) setPending(false); }
  }
  const preview = result?.key === key ? result.preview : null;
  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <h4 className="font-serif text-lg font-bold">Check Your Rotation</h4>
      <p className="mt-1 text-sm text-muted-foreground">Verify all three menus against current store prices and see which menu is scheduled first. This does not place an order or start billing.</p>
      <Button type="button" variant="outline" className="mt-4 h-auto min-h-11 w-full whitespace-normal py-3" disabled={!selections || pending || !rotationApiUrl()} onClick={review}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {pending ? 'Checking live meals…' : 'Review Rotation — No Charge'}
      </Button>
      {!rotationApiUrl() && <p className="mt-3 text-sm text-muted-foreground">Live review opens when the independent Shopify app is connected. Your planner and manual setup request remain available.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {preview && <MealRotationReviewResult preview={preview} />}
      {preview?.enrollmentReady && selections && <MealEnrollmentCheckout key={key} selections={selections} preview={preview} />}
    </div>
  );
}

export function MealRotationReviewResult({ preview }: { preview: RotationPreview }) {
  return <div role="status" className="mt-4 space-y-3 text-sm">
        <p className="font-semibold">Prices verified. First eligible service week: {rotationDateLabel(preview.firstServiceDate)} ({rotationWeekLabel(preview.firstWeek)}).</p>
        <p className="text-muted-foreground">Monday pickup after 9am, or Monday–Tuesday delivery. The team confirms your first service date during enrollment.</p>
        <ol className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => {
            const week = ROTATION_WEEKS[(ROTATION_WEEKS.indexOf(preview.firstWeek) + index) % 3];
            return <li key={index} className="flex justify-between gap-4"><span>{index === 0 ? 'First week' : `Following week ${index}`}: {rotationWeekLabel(week)}</span><strong>{formatPrice((preview.weeks[week].subtotalCents / 100).toFixed(2), 'USD')}</strong></li>;
          })}
        </ol>
        <p className="text-muted-foreground">Only the active week’s meals are charged each week. Tax and the $15 local-delivery fee, if selected, are separate; pickup is free.</p>
        <p className="font-medium">{preview.enrollmentReady ? 'Your plan can continue to a separate Shopify checkout below. This review itself has not started a subscription.' : 'Online enrollment is not yet open. Send your verified selections below for manual setup. This review has not started a subscription.'}</p>
      </div>;
}
