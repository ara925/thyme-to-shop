import { useState, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Leaf, Minus, Plus, ShoppingCart, Loader2, Check, AlertCircle } from 'lucide-react';
import {
  normalizeSellingPlanGroupName,
  useProducts,
  useSellingPlans,
} from '@/hooks/useProducts';
import { type ShopifyProduct, formatPrice } from '@/lib/shopify';
import { type CartItemInput, useCartStore } from '@/stores/cartStore';
import { getShopifyImageUrl } from '@/lib/images';
import { parsePositiveMoneyCents } from '@/lib/subscriptionMinimum';
import { SubscriptionProductSkeletons } from '@/components/subscriptions/SubscriptionProductSkeletons';
import { toast } from 'sonner';

const JUICE_PRODUCT_QUERY = 'product_type:Juice AND NOT product_type:"Juice Bundle"';
const JUICE_BUNDLE_PRODUCT_QUERY = 'product_type:"Juice Bundle"';
const PICK_AND_CHOOSE_PRODUCT_TITLE = "Pick n' Choose Bundle";
const JUICE_SELLING_PLAN_GROUP = 'Juice Subscription Bundels';
const WEEKS = [
  { id: 'week-a', label: 'Week 1', tag: 'week-a' },
  { id: 'week-b', label: 'Week 2', tag: 'week-b' },
  { id: 'week-c', label: 'Week 3', tag: 'week-c' },
];

type WeekSelections = Record<string, Record<string, number>>;

const JuiceSubscription = () => {
  const {
    data: allProducts = [],
    isLoading: productsLoading,
    isError: productsError,
  } = useProducts(50, JUICE_PRODUCT_QUERY);
  const {
    data: juiceBundleProducts = [],
    isLoading: juiceBundleLoading,
    isError: juiceBundleError,
  } = useProducts(50, JUICE_BUNDLE_PRODUCT_QUERY);
  const {
    data: sellingPlansByProduct,
    isLoading: sellingPlansLoading,
    isError: sellingPlansError,
  } = useSellingPlans(JUICE_PRODUCT_QUERY, JUICE_SELLING_PLAN_GROUP);
  const addItems = useCartStore(state => state.addItems);
  const isLoading = useCartStore(state => state.isLoading);
  const [activeTab, setActiveTab] = useState('week-a');
  const [selections, setSelections] = useState<WeekSelections>({
    'week-a': {},
    'week-b': {},
    'week-c': {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickAndChooseMatches = useMemo(() => {
    const normalizedTitle = normalizeSellingPlanGroupName(PICK_AND_CHOOSE_PRODUCT_TITLE);
    return juiceBundleProducts.filter(product => (
      product.node.productType === 'Juice Bundle'
      && normalizeSellingPlanGroupName(product.node.title) === normalizedTitle
    ));
  }, [juiceBundleProducts]);
  const pickAndChooseProduct = pickAndChooseMatches.length === 1
    ? pickAndChooseMatches[0]
    : null;
  const minimumMoney = pickAndChooseProduct?.node.priceRange.minVariantPrice;
  const minimumCents = minimumMoney
    ? parsePositiveMoneyCents(minimumMoney.amount)
    : null;
  const minimumPerWeek = minimumCents === null ? null : minimumCents / 100;
  const minimumDisplay = minimumMoney && minimumCents !== null
    ? formatPrice(minimumMoney.amount, minimumMoney.currencyCode)
    : null;

  // Keep only exact Juice products that can participate in the selected subscription plan.
  const individualJuices = useMemo(() => {
    const exactJuices = allProducts.filter(product => {
      if (product.node.productType !== 'Juice') return false;
      const variant = product.node.variants.edges[0]?.node;
      return Boolean(variant && !variant.requiresComponents);
    });

    if (sellingPlansLoading || sellingPlansError || !sellingPlansByProduct) return exactJuices;
    return exactJuices.filter(product => Boolean(sellingPlansByProduct[product.node.id]));
  }, [allProducts, sellingPlansByProduct, sellingPlansError, sellingPlansLoading]);

  const productsByWeek = useMemo(() => {
    const grouped: Record<string, ShopifyProduct[]> = {};
    WEEKS.forEach(week => {
      grouped[week.id] = individualJuices;
    });
    return grouped;
  }, [individualJuices]);

  const weekTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    WEEKS.forEach(week => {
      const weekSel = selections[week.id] || {};
      let total = 0;
      Object.entries(weekSel).forEach(([productId, qty]) => {
        const product = productsByWeek[week.id]?.find(p => p.node.id === productId);
        if (product && qty > 0) {
          const variant = product.node.variants.edges[0]?.node;
          if (variant) total += parseFloat(variant.price.amount) * qty;
        }
      });
      totals[week.id] = total;
    });
    return totals;
  }, [selections, productsByWeek]);

  const weeksWithSelections = WEEKS.filter(w => weekTotals[w.id] > 0);
  const selectedWeek = weeksWithSelections.length === 1 ? weeksWithSelections[0] : null;
  const hasExactlyOneSelectedWeek = selectedWeek !== null;
  const selectedWeekMeetsMinimum = Boolean(
    selectedWeek
    && minimumPerWeek !== null
    && weekTotals[selectedWeek.id] >= minimumPerWeek,
  );
  const anySelections = weeksWithSelections.length > 0;
  const hasSellingPlanConfiguration = Boolean(
    sellingPlansByProduct && Object.keys(sellingPlansByProduct).length > 0,
  );
  const configurationLoading = sellingPlansLoading || juiceBundleLoading;
  const hasPlannerConfiguration = Boolean(
    hasSellingPlanConfiguration
    && pickAndChooseProduct
    && minimumMoney
    && minimumCents !== null,
  );
  const configurationUnavailable = Boolean(
    sellingPlansError
    || juiceBundleError
    || !hasPlannerConfiguration,
  );
  const selectedItemsAreAvailable = selectedWeek
    ? Object.entries(selections[selectedWeek.id] || {}).every(([productId, qty]) => {
      if (qty <= 0) return true;
      const product = productsByWeek[selectedWeek.id]?.find(
        item => item.node.id === productId,
      );
      const variant = product?.node.variants.edges[0]?.node;
      return Boolean(variant?.availableForSale && sellingPlansByProduct?.[productId]);
    })
    : false;

  const updateQuantity = (weekId: string, productId: string, delta: number) => {
    setSelections(prev => {
      const current = prev[weekId]?.[productId] || 0;
      const newQty = Math.max(0, current + delta);
      return {
        ...prev,
        [weekId]: { ...prev[weekId], [productId]: newQty },
      };
    });
  };

  const handleAddAllToCart = async () => {
    if (weeksWithSelections.length === 0) {
      toast.error('Choose exactly one menu week before continuing.', { position: 'top-center' });
      return;
    }
    if (weeksWithSelections.length > 1) {
      toast.error('Choose exactly one menu week. Clear the selections from the other menu tabs.', {
        position: 'top-center',
      });
      return;
    }
    if (configurationLoading) {
      toast.error('Weekly subscription availability is still loading. Please wait a moment.', { position: 'top-center' });
      return;
    }

    if (
      configurationUnavailable
      || !sellingPlansByProduct
      || !pickAndChooseProduct
      || !minimumMoney
      || minimumCents === null
      || minimumDisplay === null
    ) {
      toast.error('Weekly juice subscriptions are temporarily unavailable. No one-time order was added.', { position: 'top-center' });
      return;
    }

    if (!selectedWeek || !selectedWeekMeetsMinimum) {
      toast.error(`Your weekly selection must meet the ${minimumDisplay} minimum.`, {
        position: 'top-center',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const cartItems: CartItemInput[] = [];
      const weekSel = selections[selectedWeek.id] || {};
      for (const [productId, qty] of Object.entries(weekSel)) {
        if (qty <= 0) continue;
        const product = productsByWeek[selectedWeek.id]?.find(p => p.node.id === productId);
        if (!product) {
          throw new Error('A selected juice is no longer available. Please update your weekly selection.');
        }
        const variant = product.node.variants.edges[0]?.node;
        if (!variant) {
          throw new Error(`${product.node.title} no longer has an available variant.`);
        }
        if (!variant.availableForSale) {
          throw new Error(`${product.node.title} is sold out. Please update ${selectedWeek.label}.`);
        }
        const sellingPlan = sellingPlansByProduct[product.node.id];
        if (!sellingPlan) {
          throw new Error(`${product.node.title} is not configured for the weekly juice subscription.`);
        }

        cartItems.push({
          product,
          variantId: variant.id,
          variantTitle: variant.title,
          price: variant.price,
          quantity: qty,
          selectedOptions: variant.selectedOptions || [],
          sellingPlanId: sellingPlan.id,
          attributes: [
            { key: 'Menu Week', value: selectedWeek.label },
            { key: '_minimum_group', value: `juice-plan:${selectedWeek.id}` },
            { key: '_minimum_cents', value: String(minimumCents) },
            { key: '_minimum_currency', value: minimumMoney.currencyCode },
            { key: '_minimum_label', value: `${selectedWeek.label} juice plan` },
          ],
        });
      }
      if (cartItems.length === 0) throw new Error('Select at least one available juice before continuing.');
      await addItems(cartItems);
      toast.success(`${selectedWeek.label} weekly juice selection added to cart.`, {
        position: 'top-center',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.', { position: 'top-center' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-primary/90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--herb-glow)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 backdrop-blur-sm">
              <Leaf className="mr-1 h-3 w-3" />
              Juice Subscription
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-white md:text-6xl tracking-tight">
              Weekly Juice Plan
            </h1>
            <p className="mt-4 text-lg text-white/70 max-w-lg">
              Compare all three menu weeks, then choose exactly one. Your selected juices and quantities repeat every week.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>
                <strong>{minimumDisplay || 'Live minimum unavailable'}</strong>
                {minimumDisplay ? ' minimum / week' : ''}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>Selected menu <strong>repeats weekly</strong></span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>Four-cycle commitment <strong>not enforced</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Juice Planner */}
      <section className="py-12 md:py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-2">
              Build Your Weekly Juice Selection
            </h2>
            <p className="text-muted-foreground mb-4">
              Browse all three tabs, but select juices in exactly one menu week before adding the subscription to cart.
            </p>

            <div className="mb-8 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm text-foreground" role="note">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <p>
                The one menu you select repeats every week. Automatic menu rotation is not configured, and a four-billing-cycle commitment is not enforced until Shopify/subscription-app setup is completed.
              </p>
            </div>

            {(configurationLoading || (!configurationLoading && configurationUnavailable)) && (
              <div
                className={`mb-6 flex items-start gap-2 rounded-xl border p-4 text-sm ${!configurationLoading && configurationUnavailable ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted/50 text-muted-foreground'}`}
                role="status"
              >
                {configurationLoading ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
                <span>
                  {configurationLoading
                    ? 'Confirming weekly juice subscription availability and live minimum…'
                    : 'The weekly juice subscription or its live Pick n\' Choose minimum is not configured right now. Adding a one-time order is disabled.'}
                </span>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 mb-8">
                {WEEKS.map(week => {
                  const total = weekTotals[week.id];
                  const meetsMin = minimumPerWeek !== null && total >= minimumPerWeek;
                  const hasSelections = total > 0;
                  return (
                    <TabsTrigger
                      key={week.id}
                      value={week.id}
                      className="relative flex flex-col gap-0.5 py-3"
                    >
                      <span className="font-semibold">{week.label}</span>
                      {hasSelections && (
                        <span className={`text-xs ${meetsMin ? 'text-primary' : 'text-destructive'}`}>
                          {formatPrice(total.toString())}
                        </span>
                      )}
                      {meetsMin && (
                        <Check className="absolute top-1 right-1 h-3.5 w-3.5 text-primary" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {WEEKS.map(week => {
                const weekProducts = productsByWeek[week.id] || [];
                const total = weekTotals[week.id];
                const meetsMin = minimumPerWeek !== null && total >= minimumPerWeek;
                const remaining = minimumPerWeek === null
                  ? null
                  : Math.max(0, minimumPerWeek - total);

                return (
                  <TabsContent key={week.id} value={week.id}>
                    {/* Week status bar */}
                    <div className={`mb-6 p-4 rounded-xl border ${meetsMin ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-border'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {meetsMin ? (
                            <Check className="h-5 w-5 text-primary" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className="font-semibold">
                            {week.label} Total: {formatPrice(total.toString())}
                          </span>
                        </div>
                        {!meetsMin && total > 0 && remaining !== null && (
                          <span className="text-sm text-muted-foreground">
                            {formatPrice(remaining.toString())} more to meet minimum
                          </span>
                        )}
                        {!meetsMin && total === 0 && (
                          <span className="text-sm text-muted-foreground">
                            {minimumDisplay
                              ? `${minimumDisplay} minimum`
                              : 'Live minimum unavailable'}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${meetsMin ? 'bg-primary' : 'bg-accent'}`}
                          style={{
                            width: `${minimumPerWeek === null
                              ? 0
                              : Math.min(100, (total / minimumPerWeek) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {productsLoading ? (
                      <SubscriptionProductSkeletons itemLabel="juice" />
                    ) : productsError ? (
                      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive">
                        The live juice catalog could not be loaded. Please refresh and try again.
                      </p>
                    ) : weekProducts.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">No juices found for this week.</p>
                    ) : (
                      <div className="space-y-3">
                        {weekProducts.map(product => {
                          const qty = selections[week.id]?.[product.node.id] || 0;
                          const variant = product.node.variants.edges[0]?.node;
                          const price = variant?.price || product.node.priceRange.minVariantPrice;
                          const image = product.node.images.edges[0]?.node;
                          const sellingPlan = sellingPlansByProduct?.[product.node.id];
                          const canSelect = Boolean(
                            variant?.availableForSale
                            && sellingPlan
                            && !configurationLoading
                            && !configurationUnavailable,
                          );

                          return (
                            <Card key={product.node.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                  {image ? (
                                    <img src={getShopifyImageUrl(image.url, 128)} alt={image.altText || product.node.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
                                  {variant?.availableForSale && !configurationLoading && !sellingPlan && (
                                    <p className="text-xs font-medium text-destructive">Not available for weekly subscription</p>
                                  )}
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
                                    disabled={qty === 0}
                                    aria-label={`Remove one ${product.node.title} from ${week.label}`}
                                  >
                                    <Minus className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                  <span className="w-8 text-center font-semibold">{qty}</span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-11 w-11 rounded-full"
                                    onClick={() => updateQuantity(week.id, product.node.id, 1)}
                                    disabled={!canSelect}
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

            {/* Summary & Add to Cart */}
            {anySelections && (
              <div className="mt-10 p-6 rounded-2xl bg-card border border-border shadow-lg">
                <h3 className="font-serif text-xl font-bold mb-4">Weekly Subscription Summary</h3>
                <div className="space-y-3 mb-6">
                  {WEEKS.map(week => {
                    const total = weekTotals[week.id];
                    const meetsMin = minimumPerWeek !== null && total >= minimumPerWeek;
                    if (total === 0) return null;

                    const weekSel = selections[week.id] || {};
                    const itemCount = Object.values(weekSel).reduce((sum, q) => sum + q, 0);

                    return (
                      <div key={week.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {meetsMin ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="font-medium">{week.label}</span>
                          <span className="text-sm text-muted-foreground">({itemCount} items)</span>
                        </div>
                        <span className={`font-bold ${meetsMin ? 'text-primary' : 'text-destructive'}`}>
                          {formatPrice(total.toString())}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border mb-6">
                  <span className="font-serif text-lg font-bold">Weekly recurring total</span>
                  <span className={`text-xl font-bold ${hasExactlyOneSelectedWeek ? 'text-primary' : 'text-destructive'}`}>
                    {selectedWeek
                      ? formatPrice(weekTotals[selectedWeek.id].toString())
                      : 'Choose one menu'}
                  </span>
                </div>

                {weeksWithSelections.length > 1 && (
                  <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Choose exactly one menu week. Clear every selection from the other menu tabs.
                    </p>
                  </div>
                )}

                {selectedWeek && !selectedWeekMeetsMinimum && (
                  <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {minimumDisplay
                        ? `Your weekly selection must meet the ${minimumDisplay} minimum to proceed.`
                        : 'The live weekly minimum is unavailable, so this selection cannot be added.'}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleAddAllToCart}
                  disabled={productsError || !hasExactlyOneSelectedWeek || !selectedWeekMeetsMinimum || !selectedItemsAreAvailable || configurationLoading || configurationUnavailable || isLoading || isSubmitting}
                  className="w-full rounded-full bg-primary hover:bg-primary/90 shadow-md"
                  size="lg"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Add Weekly Juice Selection to Cart
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Only the selected menu is added. It repeats weekly at the weekly recurring total shown above. Automatic rotation and a four-billing-cycle commitment are not enforced until Shopify/subscription-app setup is complete.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default JuiceSubscription;
