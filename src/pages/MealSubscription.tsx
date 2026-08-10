import { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CalendarDays, Check, Loader2, Mail, Minus, Plus } from 'lucide-react';
import { useProducts, useSellingPlans } from '@/hooks/useProducts';
import { ShopifyProduct, formatPrice } from '@/lib/shopify';
import { getShopifyImageUrl } from '@/lib/images';
import { parseMoneyAmountToCents } from '@/lib/mealRotation';
import { parseMealMinimumCents } from '@/lib/subscriptionMinimum';
import { SubscriptionProductSkeletons } from '@/components/subscriptions/SubscriptionProductSkeletons';

const MEAL_PRODUCT_QUERY = 'product_type:Meal';
const MEAL_SELLING_PLAN_GROUP = 'Weekly Meal Subscription - $120 Minimum';
const MEAL_MINIMUM_CENTS = parseMealMinimumCents(MEAL_SELLING_PLAN_GROUP);
const MEAL_MINIMUM_DISPLAY = MEAL_MINIMUM_CENTS === null
  ? null
  : formatPrice((MEAL_MINIMUM_CENTS / 100).toFixed(2), 'USD');
const ROTATION_REQUEST_EMAIL = 'info@placeinthyme.com';
const WEEKS = [
  { id: 'week-a', label: 'Week 1', tag: 'week-a' },
  { id: 'week-b', label: 'Week 2', tag: 'week-b' },
  { id: 'week-c', label: 'Week 3', tag: 'week-c' },
] as const;

type WeekId = typeof WEEKS[number]['id'];
type WeekSelections = Record<WeekId, Record<string, number>>;

const formatCents = (cents: number, currencyCode = 'USD') => (
  formatPrice((cents / 100).toFixed(2), currencyCode)
);

const MealSubscription = () => {
  const {
    data: allProducts = [],
    isLoading: productsLoading,
    isError: productsError,
  } = useProducts(50, MEAL_PRODUCT_QUERY);
  const {
    data: sellingPlansByProduct,
    isLoading: sellingPlansLoading,
    isError: sellingPlansError,
  } = useSellingPlans(MEAL_PRODUCT_QUERY, MEAL_SELLING_PLAN_GROUP);
  const [activeTab, setActiveTab] = useState<WeekId>('week-a');
  const [selections, setSelections] = useState<WeekSelections>({
    'week-a': {},
    'week-b': {},
    'week-c': {},
  });

  const productsByWeek = useMemo(() => {
    const grouped: Record<WeekId, ShopifyProduct[]> = {
      'week-a': [],
      'week-b': [],
      'week-c': [],
    };
    allProducts.forEach(product => {
      const tags = product.node.tags || [];
      WEEKS.forEach(week => {
        if (tags.includes(week.tag)) grouped[week.id].push(product);
      });
    });
    return grouped;
  }, [allProducts]);

  const weekTotalsCents = useMemo(() => {
    const totals: Record<WeekId, number> = { 'week-a': 0, 'week-b': 0, 'week-c': 0 };
    WEEKS.forEach(week => {
      totals[week.id] = Object.entries(selections[week.id]).reduce((total, [productId, quantity]) => {
        if (quantity <= 0) return total;
        const product = productsByWeek[week.id].find(item => item.node.id === productId);
        const amount = product?.node.variants.edges[0]?.node.price.amount;
        const priceCents = amount ? parseMoneyAmountToCents(amount) : null;
        return priceCents === null ? total : total + (priceCents * quantity);
      }, 0);
    });
    return totals;
  }, [productsByWeek, selections]);

  const selectedItemsAreAvailable = useMemo(() => WEEKS.every(week => (
    Object.entries(selections[week.id]).every(([productId, quantity]) => {
      if (quantity <= 0) return true;
      const product = productsByWeek[week.id].find(item => item.node.id === productId);
      return Boolean(product?.node.variants.edges[0]?.node.availableForSale);
    })
  )), [productsByWeek, selections]);

  const allWeeksMeetMinimum = MEAL_MINIMUM_CENTS !== null && WEEKS.every(
    week => weekTotalsCents[week.id] >= MEAL_MINIMUM_CENTS,
  );
  const anySelections = WEEKS.some(week => (
    Object.values(selections[week.id]).some(quantity => quantity > 0)
  ));
  const requestIsReady = Boolean(
    allWeeksMeetMinimum
    && selectedItemsAreAvailable
    && !productsLoading
    && !productsError,
  );
  const hasStandardWeeklyPlans = Boolean(
    sellingPlansByProduct && Object.keys(sellingPlansByProduct).length > 0,
  );

  const requestHref = useMemo(() => {
    if (!requestIsReady || MEAL_MINIMUM_CENTS === null) return null;

    const lines = [
      'Hello Place in Thyme,',
      '',
      'I would like to request this three-week meal-plan rotation:',
      'Week 1 -> Week 2 -> Week 3 -> repeat',
      '',
    ];

    WEEKS.forEach(week => {
      lines.push(`${week.label} - ${formatCents(weekTotalsCents[week.id])}`);
      Object.entries(selections[week.id]).forEach(([productId, quantity]) => {
        if (quantity <= 0) return;
        const product = productsByWeek[week.id].find(item => item.node.id === productId);
        const variant = product?.node.variants.edges[0]?.node;
        if (!product || !variant) return;
        const itemPriceCents = parseMoneyAmountToCents(variant.price.amount);
        const priceDetail = itemPriceCents === null
          ? ''
          : ` at ${formatCents(itemPriceCents, variant.price.currencyCode)} each`;
        lines.push(`- ${quantity} x ${product.node.title}${priceDetail}`);
      });
      lines.push('');
    });

    const rotationTotal = WEEKS.reduce(
      (total, week) => total + weekTotalsCents[week.id],
      0,
    );
    lines.push(`Three-week total: ${formatCents(rotationTotal)}`);
    lines.push(`Minimum per week: ${formatCents(MEAL_MINIMUM_CENTS)}`);
    lines.push('');
    lines.push('I understand the rotating Shopify subscription is not automated yet. Please confirm availability, the weekly billing amount, delivery schedule, and how to start.');

    const subject = 'Three-week meal rotation request';
    return `mailto:${ROTATION_REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }, [productsByWeek, requestIsReady, selections, weekTotalsCents]);

  const updateQuantity = (weekId: WeekId, productId: string, delta: number) => {
    setSelections(previous => {
      const current = previous[weekId][productId] || 0;
      return {
        ...previous,
        [weekId]: {
          ...previous[weekId],
          [productId]: Math.max(0, current + delta),
        },
      };
    });
  };

  return (
    <Layout>
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-primary/90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--herb-glow)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 backdrop-blur-sm">
              <CalendarDays className="mr-1 h-3 w-3" />
              Three-Week Meal Plan
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-white md:text-6xl tracking-tight">
              Build Your Meal Rotation
            </h1>
            <p className="mt-4 text-lg text-white/70 max-w-lg">
              Choose independent quantities for all three menus. The intended sequence is Week 1 → Week 2 → Week 3, then it starts again.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>
                <strong>{MEAL_MINIMUM_DISPLAY || 'Live minimum unavailable'}</strong>
                {MEAL_MINIMUM_DISPLAY ? ' minimum for each week' : ''}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>Planned rotation <strong>1 → 2 → 3</strong></span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>Setup <strong>needs team confirmation</strong></span>
            </div>
          </div>
        </div>
      </div>

      <section className="py-12 md:py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-2">
              Plan All Three Weeks
            </h2>
            <p className="text-muted-foreground mb-4">
              Fill every menu tab. Your choices stay in place while you move between weeks, and each week must meet the {MEAL_MINIMUM_DISPLAY || 'live'} minimum.
            </p>

            <div className="mb-8 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm text-foreground" role="note">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <p>
                <strong>Shopify setup note:</strong>{' '}
                {sellingPlansLoading
                  ? 'We are checking the current subscription setup. '
                  : sellingPlansError || !hasStandardWeeklyPlans
                    ? 'The automated three-week rotation is not available in checkout yet. '
                    : 'Standard weekly plans are present, but those plans do not alternate the three menus. '}
                This planner will not add three weekly sets to your cart, because that would charge for all three menus every week. Complete the plan below and email it to us for confirmation.
              </p>
              {sellingPlansLoading && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
            </div>

            <Tabs value={activeTab} onValueChange={value => setActiveTab(value as WeekId)}>
              <TabsList className="grid w-full grid-cols-3 mb-8">
                {WEEKS.map(week => {
                  const totalCents = weekTotalsCents[week.id];
                  const meetsMinimum = MEAL_MINIMUM_CENTS !== null && totalCents >= MEAL_MINIMUM_CENTS;
                  return (
                    <TabsTrigger
                      key={week.id}
                      value={week.id}
                      className="relative flex flex-col gap-0.5 py-3"
                    >
                      <span className="font-semibold">{week.label}</span>
                      <span className={`text-xs ${meetsMinimum ? 'text-primary' : 'text-muted-foreground'}`}>
                        {formatCents(totalCents)}
                      </span>
                      {meetsMinimum && <Check className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {WEEKS.map(week => {
                const weekProducts = productsByWeek[week.id];
                const totalCents = weekTotalsCents[week.id];
                const meetsMinimum = MEAL_MINIMUM_CENTS !== null && totalCents >= MEAL_MINIMUM_CENTS;
                const remainingCents = MEAL_MINIMUM_CENTS === null
                  ? null
                  : Math.max(0, MEAL_MINIMUM_CENTS - totalCents);

                return (
                  <TabsContent key={week.id} value={week.id}>
                    <div
                      className={`mb-6 p-4 rounded-xl border ${meetsMinimum ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-border'}`}
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          {meetsMinimum
                            ? <Check className="h-5 w-5 text-primary" />
                            : <AlertCircle className="h-5 w-5 text-muted-foreground" />}
                          <span className="font-semibold">
                            {week.label} Total: {formatCents(totalCents)}
                          </span>
                        </div>
                        {!meetsMinimum && remainingCents !== null && (
                          <span className="text-sm text-muted-foreground">
                            {formatCents(remainingCents)} more needed
                          </span>
                        )}
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${meetsMinimum ? 'bg-primary' : 'bg-accent'}`}
                          style={{
                            width: `${MEAL_MINIMUM_CENTS === null
                              ? 0
                              : Math.min(100, (totalCents / MEAL_MINIMUM_CENTS) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {productsLoading ? (
                      <SubscriptionProductSkeletons itemLabel="meal" />
                    ) : productsError ? (
                      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive">
                        The live meal catalog could not be loaded. Please refresh and try again.
                      </p>
                    ) : weekProducts.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">No meals found for this week.</p>
                    ) : (
                      <div className="space-y-3">
                        {weekProducts.map(product => {
                          const quantity = selections[week.id][product.node.id] || 0;
                          const variant = product.node.variants.edges[0]?.node;
                          const price = variant?.price || product.node.priceRange.minVariantPrice;
                          const image = product.node.images.edges[0]?.node;

                          return (
                            <Card key={product.node.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                  {image ? (
                                    <img
                                      src={getShopifyImageUrl(image.url, 128)}
                                      alt={image.altText || product.node.title}
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-herb-light to-muted">
                                      <span className="text-xs text-muted-foreground">No img</span>
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-[9rem] flex-1">
                                  <h3 className="font-serif font-bold text-foreground truncate">{product.node.title}</h3>
                                  <p className="text-sm text-muted-foreground line-clamp-1">{product.node.description}</p>
                                  {!variant?.availableForSale && <p className="text-xs font-medium text-destructive">Sold out</p>}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="font-bold text-accent">{formatPrice(price.amount, price.currencyCode)}</p>
                                </div>
                                <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-11 w-11 rounded-full"
                                    onClick={() => updateQuantity(week.id, product.node.id, -1)}
                                    disabled={quantity === 0}
                                    aria-label={`Remove one ${product.node.title} from ${week.label}`}
                                  >
                                    <Minus className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                  <span
                                    className="w-8 text-center font-semibold"
                                    role="status"
                                    aria-live="polite"
                                    aria-atomic="true"
                                    aria-label={`${product.node.title} quantity for ${week.label}`}
                                  >
                                    {quantity}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-11 w-11 rounded-full"
                                    onClick={() => updateQuantity(week.id, product.node.id, 1)}
                                    disabled={!variant?.availableForSale}
                                    aria-label={`Add one ${product.node.title} to ${week.label}`}
                                  >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>

            <div
              className="mt-10 p-6 rounded-2xl bg-card border border-border shadow-lg"
              role="region"
              aria-label="Three-week rotation summary"
            >
              <div className="mb-5">
                <h3 className="font-serif text-xl font-bold">Three-Week Rotation Summary</h3>
                <p className="mt-1 text-sm text-muted-foreground">Week 1 → Week 2 → Week 3 → repeat</p>
              </div>

              <div className="space-y-5 mb-6">
                {WEEKS.map(week => {
                  const totalCents = weekTotalsCents[week.id];
                  const meetsMinimum = MEAL_MINIMUM_CENTS !== null && totalCents >= MEAL_MINIMUM_CENTS;
                  const chosenItems = Object.entries(selections[week.id]).filter(([, quantity]) => quantity > 0);
                  const itemCount = chosenItems.reduce((total, [, quantity]) => total + quantity, 0);

                  return (
                    <div key={week.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          {meetsMinimum
                            ? <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                            : <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />}
                          <span className="font-medium">{week.label}</span>
                          <span className="text-sm text-muted-foreground">({itemCount} items)</span>
                        </div>
                        <span className={`font-bold ${meetsMinimum ? 'text-primary' : 'text-destructive'}`}>
                          {formatCents(totalCents)}
                        </span>
                      </div>
                      {chosenItems.length > 0 ? (
                        <ul className="mt-3 space-y-1 pl-6 text-sm text-muted-foreground">
                          {chosenItems.map(([productId, quantity]) => {
                            const product = productsByWeek[week.id].find(item => item.node.id === productId);
                            return <li key={productId}>{quantity} × {product?.node.title || 'Unavailable meal'}</li>;
                          })}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No meals selected yet.</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {!allWeeksMeetMinimum && MEAL_MINIMUM_DISPLAY && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Complete all three menus at {MEAL_MINIMUM_DISPLAY} or more per week to send your rotation request.
                  </p>
                </div>
              )}

              {anySelections && !selectedItemsAreAvailable && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    A selected meal is no longer available. Remove it before sending your request.
                  </p>
                </div>
              )}

              {requestHref ? (
                <Button asChild className="h-auto min-h-11 w-full whitespace-normal rounded-full bg-primary py-3 text-center leading-tight shadow-md hover:bg-primary/90" size="lg">
                  <a href={requestHref}>
                    <Mail className="mr-2 h-5 w-5" aria-hidden="true" />
                    Request This Three-Week Rotation
                  </a>
                </Button>
              ) : (
                <Button disabled className="h-auto min-h-11 w-full whitespace-normal rounded-full py-3 text-center leading-tight" size="lg">
                  <Mail className="mr-2 h-5 w-5" aria-hidden="true" />
                  Complete All Three Weeks to Request
                </Button>
              )}
              <p className="text-xs text-muted-foreground text-center mt-3">
                This opens a prefilled email to {ROTATION_REQUEST_EMAIL} with every selected meal and quantity. Our team will confirm availability, weekly billing, and delivery details before the plan starts.
              </p>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default MealSubscription;
