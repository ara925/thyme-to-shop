import { useState, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays, Minus, Plus, ShoppingCart, Loader2, Check, AlertCircle } from 'lucide-react';
import { useProducts, useSellingPlans } from '@/hooks/useProducts';
import { ShopifyProduct, formatPrice } from '@/lib/shopify';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';

const MINIMUM_PER_WEEK = 120;
const WEEKS = [
  { id: 'week-a', label: 'Week 1', tag: 'week-a' },
  { id: 'week-b', label: 'Week 2', tag: 'week-b' },
  { id: 'week-c', label: 'Week 3', tag: 'week-c' },
];

type WeekSelections = Record<string, Record<string, number>>;

const MealSubscription = () => {
  const { data: allProducts = [], isLoading: productsLoading } = useProducts(50, 'product_type:Meal');
  const { data: sellingPlan = null } = useSellingPlans('product_type:Meal');
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const [activeTab, setActiveTab] = useState('week-a');
  const [selections, setSelections] = useState<WeekSelections>({
    'week-a': {},
    'week-b': {},
    'week-c': {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const productsByWeek = useMemo(() => {
    const grouped: Record<string, ShopifyProduct[]> = { 'week-a': [], 'week-b': [], 'week-c': [] };
    allProducts.forEach(product => {
      const tags = product.node.tags || [];
      WEEKS.forEach(week => {
        if (tags.includes(week.tag)) {
          grouped[week.id].push(product);
        }
      });
    });
    return grouped;
  }, [allProducts]);

  const weekTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    WEEKS.forEach(week => {
      const weekSel = selections[week.id] || {};
      let total = 0;
      Object.entries(weekSel).forEach(([productId, qty]) => {
        const product = productsByWeek[week.id]?.find(p => p.node.id === productId);
        if (product && qty > 0) {
          total += parseFloat(product.node.priceRange.minVariantPrice.amount) * qty;
        }
      });
      totals[week.id] = total;
    });
    return totals;
  }, [selections, productsByWeek]);

  const weeksWithSelections = WEEKS.filter(w => weekTotals[w.id] > 0);
  const allSelectedWeeksMeetMinimum = weeksWithSelections.length > 0 && weeksWithSelections.every(w => weekTotals[w.id] >= MINIMUM_PER_WEEK);
  const anySelections = weeksWithSelections.length > 0;

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
    if (!allWeeksMeetMinimum) {
      toast.error('Each week must meet the $120 minimum', { position: 'top-center' });
      return;
    }

    setIsSubmitting(true);
    try {
      for (const week of WEEKS) {
        const weekSel = selections[week.id] || {};
        for (const [productId, qty] of Object.entries(weekSel)) {
          if (qty <= 0) continue;
          const product = productsByWeek[week.id]?.find(p => p.node.id === productId);
          if (!product) continue;
          const variant = product.node.variants.edges[0]?.node;
          if (!variant) continue;

          await addItem({
            product,
            variantId: variant.id,
            variantTitle: variant.title,
            price: variant.price,
            quantity: qty,
            selectedOptions: variant.selectedOptions || [],
            sellingPlanId: sellingPlan?.id,
          });
        }
      }
      toast.success('All meals added to cart! Proceed to checkout.', { position: 'top-center' });
    } catch (error) {
      console.error('Failed to add meals to cart:', error);
      toast.error('Something went wrong. Please try again.', { position: 'top-center' });
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
              <CalendarDays className="mr-1 h-3 w-3" />
              Meal Plan Subscription
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-white md:text-6xl tracking-tight">
              Weekly Meal Plan
            </h1>
            <p className="mt-4 text-lg text-white/70 max-w-lg">
              Pre-select your meals for all 3 rotating weeks. Minimum $120 per week. 
              Cancel anytime — your plan, your way.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span><strong>$120</strong> minimum / week</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>Charged <strong>weekly</strong></span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>Cancel <strong>anytime</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Meal Planner */}
      <section className="py-12 md:py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-2">
              Build Your 3-Week Meal Plan
            </h2>
            <p className="text-muted-foreground mb-8">
              Select your meals for each week. You can modify your selections before each week's cutoff (Thursday 6PM).
            </p>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 mb-8">
                {WEEKS.map(week => {
                  const total = weekTotals[week.id];
                  const meetsMin = total >= MINIMUM_PER_WEEK;
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
                const meetsMin = total >= MINIMUM_PER_WEEK;
                const remaining = MINIMUM_PER_WEEK - total;

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
                        {!meetsMin && total > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {formatPrice(remaining.toString())} more to meet minimum
                          </span>
                        )}
                        {!meetsMin && total === 0 && (
                          <span className="text-sm text-muted-foreground">
                            ${MINIMUM_PER_WEEK} minimum
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${meetsMin ? 'bg-primary' : 'bg-accent'}`}
                          style={{ width: `${Math.min(100, (total / MINIMUM_PER_WEEK) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {productsLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : weekProducts.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">No meals found for this week.</p>
                    ) : (
                      <div className="space-y-3">
                        {weekProducts.map(product => {
                          const qty = selections[week.id]?.[product.node.id] || 0;
                          const price = product.node.priceRange.minVariantPrice;
                          const image = product.node.images.edges[0]?.node;

                          return (
                            <Card key={product.node.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                              <CardContent className="flex items-center gap-4 p-4">
                                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                  {image ? (
                                    <img src={image.url} alt={image.altText || product.node.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-herb-light to-muted">
                                      <span className="text-xs text-muted-foreground">No img</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-serif font-bold text-foreground truncate">{product.node.title}</h3>
                                  <p className="text-sm text-muted-foreground line-clamp-1">{product.node.description}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="font-bold text-accent">{formatPrice(price.amount, price.currencyCode)}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-full"
                                    onClick={() => updateQuantity(week.id, product.node.id, -1)}
                                    disabled={qty === 0}
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </Button>
                                  <span className="w-8 text-center font-semibold">{qty}</span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-full"
                                    onClick={() => updateQuantity(week.id, product.node.id, 1)}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
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
                <h3 className="font-serif text-xl font-bold mb-4">Order Summary</h3>
                <div className="space-y-3 mb-6">
                  {WEEKS.map(week => {
                    const total = weekTotals[week.id];
                    const meetsMin = total >= MINIMUM_PER_WEEK;
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
                  <span className="font-serif text-lg font-bold">Total (3 weeks)</span>
                  <span className="text-xl font-bold text-primary">
                    {formatPrice(Object.values(weekTotals).reduce((s, t) => s + t, 0).toString())}
                  </span>
                </div>

                {!allWeeksMeetMinimum && (
                  <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Each week must meet the ${MINIMUM_PER_WEEK} minimum to proceed.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleAddAllToCart}
                  disabled={!allWeeksMeetMinimum || isLoading || isSubmitting}
                  className="w-full rounded-full bg-primary hover:bg-primary/90 shadow-md"
                  size="lg"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Add All Meals to Cart
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  You'll be charged weekly. Cancel anytime before the weekly cutoff.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default MealSubscription;
