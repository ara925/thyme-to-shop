import { useMemo, useState } from 'react';
import { ArrowRight, ImageOff, Loader2, PackageOpen, ShoppingCart, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProducts } from '@/hooks/useProducts';
import { formatPrice, type ShopifyProduct } from '@/lib/shopify';
import { getShopifyImageSrcSet, getShopifyImageUrl } from '@/lib/images';
import { useCartStore } from '@/stores/cartStore';

const PICK_AND_CHOOSE_TITLE = 'pick n choose bundle';

function normalizeBundleTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u2018\u2019\u02bc']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function getPurchasableVariant(product: ShopifyProduct) {
  return product.node.variants.edges.find(
    ({ node }) => node.availableForSale && !node.requiresComponents,
  )?.node;
}

function JuiceBundleLoadingState() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading juice bundles</span>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="flex h-full flex-col overflow-hidden border-border/70 bg-card shadow-sm">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <CardContent className="flex flex-1 flex-col p-6">
              <Skeleton className="h-7 w-2/3" />
              <div className="mt-3 flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-11 w-28 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const JuiceBundleCards = () => {
  const {
    data: bundleProducts = [],
    isLoading: productsLoading,
    isError,
  } = useProducts(50, 'product_type:"Juice Bundle"');
  const addItem = useCartStore((state) => state.addItem);
  const cartIsLoading = useCartStore((state) => state.isLoading);
  const [addingId, setAddingId] = useState<string | null>(null);

  const { fixedBundles, pickAndChooseBundle } = useMemo(() => {
    const exactBundles = bundleProducts.filter(
      (product) => product.node.productType === 'Juice Bundle',
    );
    const pickBundle = exactBundles.find(
      (product) => normalizeBundleTitle(product.node.title) === PICK_AND_CHOOSE_TITLE,
    );
    const fixed = exactBundles
      .filter((product) => product.node.id !== pickBundle?.node.id)
      .sort((left, right) => left.node.title.localeCompare(right.node.title));

    return { fixedBundles: fixed, pickAndChooseBundle: pickBundle };
  }, [bundleProducts]);

  const handleAddBundle = async (product: ShopifyProduct) => {
    const variant = getPurchasableVariant(product);
    if (!variant) {
      toast.error(`${product.node.title} is currently unavailable.`, { position: 'top-center' });
      return;
    }

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
      toast.success(`${product.node.title} added to cart.`, { position: 'top-center' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The bundle could not be added.', {
        position: 'top-center',
      });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <section
      id="juice-bundles"
      className="scroll-mt-24 bg-gradient-to-b from-background to-muted/30 py-12 md:py-20"
      aria-busy={productsLoading}
    >
      <div className="container">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 overflow-hidden rounded-3xl border border-primary/20 bg-primary text-primary-foreground shadow-lg">
            <div className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-9">
              <div>
                <Badge className="mb-4 border-white/20 bg-white/10 text-white">
                  <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                  Build your own bundle
                </Badge>
                {productsLoading ? (
                  <div className="space-y-3" aria-hidden="true">
                    <Skeleton className="h-9 w-56 bg-white/20" />
                    <Skeleton className="h-4 w-full max-w-xl bg-white/20" />
                    <Skeleton className="h-4 w-4/5 max-w-lg bg-white/20" />
                    <Skeleton className="h-5 w-32 bg-white/20" />
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-white md:text-3xl">
                      {pickAndChooseBundle?.node.title || "Pick n' Choose"}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
                      {pickAndChooseBundle?.node.description ||
                        'Bundle details are currently unavailable from Shopify.'}
                    </p>
                    {pickAndChooseBundle && (
                      <p className="mt-3 text-sm font-semibold text-white">
                        Live minimum:{' '}
                        {formatPrice(
                          pickAndChooseBundle.node.priceRange.minVariantPrice.amount,
                          pickAndChooseBundle.node.priceRange.minVariantPrice.currencyCode,
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
              <Button asChild size="lg" variant="secondary" className="w-full rounded-full md:w-auto">
                <Link to="/juices/pick-and-choose">
                  Build my bundle
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mb-10 text-center">
            <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary">
              <PackageOpen className="mr-1 h-3 w-3" aria-hidden="true" />
              Ready-made bundles
            </Badge>
            <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
              Grab a bundle and go
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Bundle contents, prices, and availability below come directly from the live store.
            </p>
          </div>

          {productsLoading ? (
            <JuiceBundleLoadingState />
          ) : isError ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
              The live bundle catalog could not be loaded. Please try again shortly.
            </p>
          ) : fixedBundles.length === 0 ? (
            <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
              No ready-made bundles are available right now.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {fixedBundles.map((product) => {
                const image = product.node.images.edges[0]?.node;
                const variant = getPurchasableVariant(product);
                const displayPrice = variant?.price || product.node.priceRange.minVariantPrice;
                const isAdding = addingId === product.node.id;

                return (
                  <Card
                    key={product.node.id}
                    className="group flex h-full flex-col overflow-hidden border-border/70 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      {image ? (
                        <img
                          src={getShopifyImageUrl(image.url, 720)}
                          srcSet={getShopifyImageSrcSet(image.url, [360, 540, 720])}
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          alt={image.altText || product.node.title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <ImageOff className="h-10 w-10" aria-hidden="true" />
                          <span className="sr-only">No product image available</span>
                        </div>
                      )}
                      {!variant && (
                        <Badge variant="secondary" className="absolute right-3 top-3">
                          Sold out
                        </Badge>
                      )}
                    </div>

                    <CardContent className="flex flex-1 flex-col p-6">
                      <h3 className="text-xl font-bold text-foreground">{product.node.title}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {product.node.description || 'Description unavailable from Shopify.'}
                      </p>

                      <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-2xl font-bold text-foreground">
                            {formatPrice(displayPrice.amount, displayPrice.currencyCode)}
                          </p>
                          <p className="text-xs text-muted-foreground">One-time bundle</p>
                        </div>
                        <div className="flex w-full gap-2 sm:w-auto">
                          <Button
                            asChild
                            variant="outline"
                            className="min-h-11 flex-1 rounded-full sm:flex-none"
                          >
                            <Link to={`/product/${encodeURIComponent(product.node.handle)}`}>Details</Link>
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleAddBundle(product)}
                            disabled={!variant || cartIsLoading || isAdding}
                            className="min-h-11 flex-1 rounded-full sm:flex-none"
                            aria-label={`Add ${product.node.title} to cart`}
                          >
                            {isAdding ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                            )}
                            <span className="ml-2">{isAdding ? 'Adding...' : 'Add'}</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
