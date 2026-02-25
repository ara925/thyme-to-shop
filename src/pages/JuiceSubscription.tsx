import { useState, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { JuiceBundleCards } from '@/components/juices/JuiceBundleCards';
import { DeliveryScheduler } from '@/components/delivery/DeliveryScheduler';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Leaf, Minus, Plus, ShoppingCart, Loader2, Check, AlertCircle, Percent } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { ShopifyProduct, formatPrice } from '@/lib/shopify';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';

const MINIMUM_ORDER = 134.99;
const DISCOUNT_PERCENT = 10;

const JuiceSubscription = () => {
  const { data: juiceProducts = [], isLoading: productsLoading } = useProducts(50, 'product_type:Juice');
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [billingOption, setBillingOption] = useState<'weekly' | 'full'>('weekly');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter to individual juices only (exclude bundles)
  const individualJuices = useMemo(() => {
    return juiceProducts.filter(p => p.node.productType === 'Juice');
  }, [juiceProducts]);

  const subtotal = useMemo(() => {
    let total = 0;
    Object.entries(selections).forEach(([productId, qty]) => {
      if (qty <= 0) return;
      const product = individualJuices.find(p => p.node.id === productId);
      if (product) {
        total += parseFloat(product.node.priceRange.minVariantPrice.amount) * qty;
      }
    });
    return total;
  }, [selections, individualJuices]);

  const discount = subtotal * (DISCOUNT_PERCENT / 100);
  const discountedTotal = subtotal - discount;
  const meetsMinimum = subtotal >= MINIMUM_ORDER;
  const remaining = MINIMUM_ORDER - subtotal;
  const totalItems = Object.values(selections).reduce((sum, q) => sum + q, 0);
  const fourWeekTotal = discountedTotal * 4;

  const updateQuantity = (productId: string, delta: number) => {
    setSelections(prev => {
      const current = prev[productId] || 0;
      const newQty = Math.max(0, current + delta);
      return { ...prev, [productId]: newQty };
    });
  };

  const handleAddToCart = async () => {
    if (!meetsMinimum) {
      toast.error(`Minimum order is $${MINIMUM_ORDER}`, { position: 'top-center' });
      return;
    }

    setIsSubmitting(true);
    try {
      for (const [productId, qty] of Object.entries(selections)) {
        if (qty <= 0) continue;
        const product = individualJuices.find(p => p.node.id === productId);
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
        });
      }
      toast.success('Juices added to cart! Proceed to checkout.', { position: 'top-center' });
    } catch (error) {
      console.error('Failed to add juices to cart:', error);
      toast.error('Something went wrong. Please try again.', { position: 'top-center' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-accent/80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(var(--terracotta)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 backdrop-blur-sm">
              <Leaf className="mr-1 h-3 w-3" />
              Juice Subscription
            </Badge>
            <h1 className="font-serif text-4xl font-bold text-white md:text-6xl tracking-tight">
              Juice Subscription
            </h1>
            <p className="mt-4 text-lg text-white/70 max-w-lg">
              Pick n' Choose your weekly juices, shots & teas. Commit to 4 weeks and save 10% on every order.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <Percent className="h-4 w-4 text-gold" />
              <span><strong>10% off</strong> every week</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span><strong>$134.99</strong> minimum / week</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span><strong>4-week</strong> commitment</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm text-white border border-white/10">
              <span>Cancel every <strong>4 weeks</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-Set Bundles */}
      <JuiceBundleCards />

      {/* Juice Builder */}
      <section className="py-12 md:py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-2">
              Build Your Weekly Juice Order
            </h2>
            <p className="text-muted-foreground mb-8">
              Choose as many juices, shots, and teas as you want. This selection repeats each week for 4 weeks.
            </p>

            {/* Progress bar */}
            <div className={`mb-8 p-4 rounded-xl border ${meetsMinimum ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {meetsMinimum ? (
                    <Check className="h-5 w-5 text-primary" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="font-semibold">
                    Subtotal: {formatPrice(subtotal.toString())}
                  </span>
                </div>
                {!meetsMinimum && subtotal > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {formatPrice(remaining.toString())} more to meet minimum
                  </span>
                )}
                {!meetsMinimum && subtotal === 0 && (
                  <span className="text-sm text-muted-foreground">
                    ${MINIMUM_ORDER} minimum
                  </span>
                )}
              </div>
              <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${meetsMinimum ? 'bg-primary' : 'bg-accent'}`}
                  style={{ width: `${Math.min(100, (subtotal / MINIMUM_ORDER) * 100)}%` }}
                />
              </div>
            </div>

            {/* Product list */}
            {productsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : individualJuices.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No juices found.</p>
            ) : (
              <div className="space-y-3">
                {individualJuices.map(product => {
                  const qty = selections[product.node.id] || 0;
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
                            onClick={() => updateQuantity(product.node.id, -1)}
                            disabled={qty === 0}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-8 text-center font-semibold">{qty}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={() => updateQuantity(product.node.id, 1)}
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

            {/* Summary */}
            {totalItems > 0 && (
              <div className="mt-10 p-6 rounded-2xl bg-card border border-border shadow-lg">
                <h3 className="font-serif text-xl font-bold mb-4">Subscription Summary</h3>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
                    <span>{formatPrice(subtotal.toString())}</span>
                  </div>
                  <div className="flex justify-between text-sm text-primary">
                    <span className="flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5" />
                      Subscription discount (10%)
                    </span>
                    <span>-{formatPrice(discount.toString())}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <span className="font-serif font-bold">Weekly total</span>
                  <span className="text-xl font-bold text-primary">{formatPrice(discountedTotal.toString())}</span>
                </div>

                {/* Billing option */}
                <div className="mt-6 p-4 rounded-xl bg-muted/50">
                  <p className="font-semibold text-sm mb-3">Billing preference</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setBillingOption('weekly')}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        billingOption === 'weekly' 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <p className="font-semibold text-sm">Pay weekly</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatPrice(discountedTotal.toString())} / week
                      </p>
                    </button>
                    <button
                      onClick={() => setBillingOption('full')}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        billingOption === 'full' 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <p className="font-semibold text-sm">Pay 4 weeks upfront</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatPrice(fourWeekTotal.toString())} total
                      </p>
                    </button>
                  </div>
                </div>

                {!meetsMinimum && (
                  <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Minimum order is ${MINIMUM_ORDER} per week.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleAddToCart}
                  disabled={!meetsMinimum || isLoading || isSubmitting}
                  className="w-full mt-6 rounded-full bg-primary hover:bg-primary/90 shadow-md"
                  size="lg"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Add to Cart
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  4-week minimum commitment. Cancel every 4 weeks. 10% discount applied at checkout.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Delivery Scheduling */}
      <DeliveryScheduler />
    </Layout>
  );
};

export default JuiceSubscription;
