import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Loader2, Sparkles, Zap, Crown, Star, FlameKindling } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { ShopifyProduct, formatPrice } from '@/lib/shopify';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';
import { useState } from 'react';

interface BundleConfig {
  keyword: string;
  items: string;
  discount: string;
  value?: string;
  icon: React.ReactNode;
  accent: string;
  popular?: boolean;
}

const BUNDLE_CONFIG: Record<string, BundleConfig> = {
  'Intro Pack Bundle': {
    keyword: 'intro pack',
    items: '4 Hearty Red, 4 Green Cleanse, 4 Ginger Shots, 4 Turmeric Shots, 4 Teas',
    discount: '15%',
    icon: <Star className="h-5 w-5" />,
    accent: 'from-herb/20 to-herb-light/40',
  },
  'Shot Bundle': {
    keyword: 'shot bundle',
    items: '10 Ginger Shots, 10 Turmeric Shots',
    discount: '10%',
    value: '$100',
    icon: <Zap className="h-5 w-5" />,
    accent: 'from-gold/20 to-wheat/40',
  },
  'Juice Bundle #1': {
    keyword: 'bundle #1',
    items: '5 Hearty Red, 5 Green Cleanse, 5 Ginger Shots, 5 Turmeric Shots',
    discount: '10%',
    icon: <FlameKindling className="h-5 w-5" />,
    accent: 'from-terracotta/15 to-terracotta-light/40',
  },
  'Juice Bundle #2': {
    keyword: 'bundle #2',
    items: '8 Hearty Red, 8 Green Cleanse, 8 Ginger Shots, 8 Turmeric Shots',
    discount: '15%',
    value: '$216',
    icon: <Sparkles className="h-5 w-5" />,
    accent: 'from-primary/15 to-herb-light/40',
    popular: true,
  },
  'Juice Bundle #3': {
    keyword: 'bundle #3',
    items: '10 Hearty Red, 10 Green Cleanse, 10 Ginger Shots, 10 Turmeric Shots',
    discount: '26%',
    value: '$270',
    icon: <Crown className="h-5 w-5" />,
    accent: 'from-gold/25 to-terracotta/10',
  },
};

const BUNDLE_ORDER = ['Intro Pack Bundle', 'Shot Bundle', 'Juice Bundle #1', 'Juice Bundle #2', 'Juice Bundle #3'];

export const JuiceBundleCards = () => {
  const { data: bundleProducts = [], isLoading: productsLoading } = useProducts(50, 'product_type:Juice Bundle');
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  const [addingId, setAddingId] = useState<string | null>(null);

  const sortedBundles = useMemo(() => {
    return BUNDLE_ORDER
      .map(name => bundleProducts.find(p => p.node.title === name))
      .filter(Boolean) as ShopifyProduct[];
  }, [bundleProducts]);

  const handleSubscribe = async (product: ShopifyProduct) => {
    const variant = product.node.variants.edges[0]?.node;
    if (!variant) return;

    setAddingId(product.node.id);
    try {
      await addItem({
        product,
        variantId: variant.id,
        variantTitle: variant.title,
        price: variant.price,
        quantity: 1,
        selectedOptions: variant.selectedOptions || [],
      });
      toast.success(`${product.node.title} added to cart!`, { position: 'top-center' });
    } catch {
      toast.error('Something went wrong.', { position: 'top-center' });
    } finally {
      setAddingId(null);
    }
  };

  if (productsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (sortedBundles.length === 0) return null;

  return (
    <section className="py-12 md:py-20 bg-gradient-to-b from-background to-muted/30">
      <div className="container">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
              <Sparkles className="mr-1 h-3 w-3" />
              Weekly Bundles
            </Badge>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
              Pre-Set Weekly Bundles
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Subscribe to a curated bundle and get it delivered automatically every week. The more you order, the more you save.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sortedBundles.map(product => {
              const config = BUNDLE_CONFIG[product.node.title];
              if (!config) return null;
              const price = product.node.priceRange.minVariantPrice;
              const isAdding = addingId === product.node.id;

              return (
                <Card
                  key={product.node.id}
                  className={`relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br ${config.accent} ${
                    config.popular ? 'ring-2 ring-primary shadow-lg md:scale-105' : ''
                  }`}
                >
                  {config.popular && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
                        MOST POPULAR
                      </div>
                    </div>
                  )}
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-2 rounded-lg bg-card/80 text-primary">
                        {config.icon}
                      </div>
                      <h3 className="font-serif text-lg font-bold text-foreground">
                        {product.node.title}
                      </h3>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                      {config.items}
                    </p>

                    <div className="flex items-end justify-between mb-4">
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {formatPrice(price.amount, price.currencyCode)}
                        </p>
                        <p className="text-xs text-muted-foreground">per week</p>
                      </div>
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-0 font-bold">
                        Save {config.discount}
                      </Badge>
                    </div>

                    {config.value && (
                      <p className="text-xs text-muted-foreground mb-4">
                        Value: {config.value}
                      </p>
                    )}

                    <Button
                      onClick={() => handleSubscribe(product)}
                      disabled={isLoading || isAdding}
                      className="w-full rounded-full bg-primary hover:bg-primary/90 shadow-md"
                    >
                      {isAdding ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Add to Cart
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Attach a selling plan in Shopify Subscriptions to enable automatic weekly recurring billing.
          </p>
        </div>
      </div>
    </section>
  );
};
