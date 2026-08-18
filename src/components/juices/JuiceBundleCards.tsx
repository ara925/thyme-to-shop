import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ImageOff,
  Loader2,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  normalizeSellingPlanGroupName,
  useJuiceBundleSellingPlans,
  useProducts,
} from '@/hooks/useProducts';
import { formatPrice, type SellingPlan, type ShopifyProduct } from '@/lib/shopify';
import { getShopifyImageSrcSet, getShopifyImageUrl } from '@/lib/images';
import {
  HIBISCUS_ADD_ON_ATTRIBUTE_VALUE,
  HIBISCUS_ADD_ON_TITLE,
  HIBISCUS_ADD_ON_TYPE_ATTRIBUTE,
  hasExpectedHibiscusAddOnPrice,
} from '@/lib/hibiscusAddOn';
import {
  PICK_AND_CHOOSE_BUNDLE_TITLE,
  resolveJuiceBundleCatalog,
} from '@/lib/juiceBundleCatalog';
import { type CartItemInput, useCartStore } from '@/stores/cartStore';

const JUICE_PRODUCT_QUERY = 'product_type:Juice AND NOT product_type:"Juice Bundle"';

function getPurchasableVariant(product: ShopifyProduct) {
  return product.node.variants.edges.find(
    ({ node }) => node.availableForSale && !node.requiresComponents,
  )?.node;
}

function createBundleInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `juice-bundle-${crypto.randomUUID()}`;
  }
  return `juice-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const {
    data: subscriptionPlans = {},
    isLoading: plansLoading,
    isError: plansError,
  } = useJuiceBundleSellingPlans();
  const {
    data: juiceProducts = [],
    isLoading: addOnProductsLoading,
    isError: addOnProductsError,
  } = useProducts(50, JUICE_PRODUCT_QUERY);
  const addItems = useCartStore((state) => state.addItems);
  const cartIsLoading = useCartStore((state) => state.isLoading);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [hibiscusQuantities, setHibiscusQuantities] = useState<Record<string, number>>({});

  const bundleCatalogContract = useMemo(
    () => resolveJuiceBundleCatalog(bundleProducts),
    [bundleProducts],
  );
  const { fixedBundles, pickAndChooseBundle } = bundleCatalogContract;
  const bundleCatalogReady =
    !productsLoading && !isError && bundleCatalogContract.isValid;

  const hibiscusMatches = useMemo(() => {
    const expectedTitle = normalizeSellingPlanGroupName(HIBISCUS_ADD_ON_TITLE);
    return juiceProducts.filter((product) => (
      product.node.productType === 'Juice'
      && normalizeSellingPlanGroupName(product.node.title) === expectedTitle
    ));
  }, [juiceProducts]);
  const hibiscusProduct = hibiscusMatches.length === 1 ? hibiscusMatches[0] : null;
  const hibiscusVariant = hibiscusProduct ? getPurchasableVariant(hibiscusProduct) : undefined;
  const hibiscusPrice = hibiscusVariant?.price;
  const addOnConfigurationLoading = addOnProductsLoading;
  const addOnProductAvailable = Boolean(
    !addOnProductsLoading
    && !addOnProductsError
    && hibiscusProduct
    && hibiscusVariant
    && hasExpectedHibiscusAddOnPrice(hibiscusVariant.price)
  );

  const updateHibiscusQuantity = (productId: string, delta: number) => {
    setHibiscusQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, (current[productId] || 0) + delta),
    }));
  };

  const handleAddBundle = async (
    product: ShopifyProduct,
    sellingPlan?: SellingPlan,
    hibiscusQuantity = 0,
  ) => {
    const variant = getPurchasableVariant(product);
    if (!variant) {
      toast.error(`${product.node.title} is currently unavailable.`, { position: 'top-center' });
      return;
    }

    if (
      hibiscusQuantity > 0
      && (!addOnProductAvailable || !hibiscusProduct || !hibiscusVariant)
    ) {
      toast.error('The Hibiscus Tea add-on is currently unavailable.', { position: 'top-center' });
      return;
    }
    const actionId = `${product.node.id}:${sellingPlan ? 'subscription' : 'one-time'}`;
    setAddingId(actionId);
    try {
      const bundleInstance = createBundleInstanceId();
      const groupingAttributes = hibiscusQuantity > 0
        ? [
            { key: '_bundle_instance', value: bundleInstance },
            { key: '_bundle_label', value: product.node.title },
            { key: '_bundle_role', value: 'primary' },
          ]
        : undefined;
      const items: CartItemInput[] = [{
        product,
        variantId: variant.id,
        variantTitle: variant.title,
        price: variant.price,
        quantity: 1,
        selectedOptions: variant.selectedOptions || [],
        sellingPlanId: sellingPlan?.id,
        attributes: groupingAttributes,
      }];

      if (hibiscusQuantity > 0 && hibiscusProduct && hibiscusVariant) {
        items.push({
          product: hibiscusProduct,
          variantId: hibiscusVariant.id,
          variantTitle: hibiscusVariant.title,
          price: hibiscusVariant.price,
          quantity: hibiscusQuantity,
          selectedOptions: hibiscusVariant.selectedOptions || [],
          sellingPlanId: undefined,
          attributes: [
            { key: '_bundle_instance', value: bundleInstance },
            { key: '_bundle_label', value: `Hibiscus add-on for ${product.node.title}` },
            { key: '_bundle_role', value: 'add-on' },
            { key: HIBISCUS_ADD_ON_TYPE_ATTRIBUTE, value: HIBISCUS_ADD_ON_ATTRIBUTE_VALUE },
          ],
        });
      }

      await addItems(items);
      setHibiscusQuantities((current) => ({ ...current, [product.node.id]: 0 }));
      toast.success(
        sellingPlan
          ? `${product.node.title} weekly subscription${hibiscusQuantity > 0 ? ' with Hibiscus Tea add-on' : ''} added to cart.`
          : `${product.node.title}${hibiscusQuantity > 0 ? ' with Hibiscus Tea add-on' : ''} added to cart.`,
        { position: 'top-center' },
      );
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
      aria-busy={productsLoading || plansLoading}
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
                ) : bundleCatalogReady && pickAndChooseBundle ? (
                  <>
                    <h2 className="text-2xl font-bold text-white md:text-3xl">
                      {pickAndChooseBundle.node.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
                      {pickAndChooseBundle.node.description ||
                        'Bundle details are currently unavailable from Shopify.'}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-white">
                      Live minimum:{' '}
                      {formatPrice(
                        pickAndChooseBundle.node.priceRange.minVariantPrice.amount,
                        pickAndChooseBundle.node.priceRange.minVariantPrice.currencyCode,
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-white md:text-3xl">
                      {PICK_AND_CHOOSE_BUNDLE_TITLE}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
                      The approved live juice bundle catalog needs a store update before this builder can open safely.
                    </p>
                  </>
                )}
              </div>
              {bundleCatalogReady ? (
                <Button asChild size="lg" variant="secondary" className="w-full rounded-full md:w-auto">
                  <Link to="/juices/pick-and-choose">
                    Build my bundle
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <Button size="lg" variant="secondary" className="w-full rounded-full md:w-auto" disabled>
                  Build my bundle
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              )}
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
            <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground" role="status">
              {addOnConfigurationLoading
                ? 'Checking the optional Hibiscus Tea add-on...'
                : addOnProductAvailable && hibiscusPrice
                  ? `Optional one-time add-on: ${HIBISCUS_ADD_ON_TITLE} for ${formatPrice(hibiscusPrice.amount, hibiscusPrice.currencyCode)} each. Choose a quantity on the bundle you want.`
                  : 'The optional Hibiscus Tea add-on is currently unavailable.'}
            </p>
          </div>

          {productsLoading ? (
            <JuiceBundleLoadingState />
          ) : isError ? (
            <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
              The live bundle catalog could not be loaded. Please try again shortly.
            </p>
          ) : !bundleCatalogContract.isValid ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              <h3 className="text-center text-lg font-bold text-foreground">
                The juice bundle catalog needs a store update
              </h3>
              <p className="mt-2 text-center">
                Bundle purchases are unavailable here until the approved catalog is restored.
              </p>
              <ul className="mx-auto mt-4 max-w-2xl list-disc space-y-1 pl-5">
                {bundleCatalogContract.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : fixedBundles.length === 0 ? (
            <p role="status" className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
              No ready-made bundles are available right now.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {fixedBundles.map((product) => {
                const image = product.node.images.edges[0]?.node;
                const variant = getPurchasableVariant(product);
                const displayPrice = variant?.price || product.node.priceRange.minVariantPrice;
                const subscriptionPlan = subscriptionPlans[product.node.id];
                const isAddingOnce = addingId === `${product.node.id}:one-time`;
                const isAddingSubscription = addingId === `${product.node.id}:subscription`;
                const hibiscusQuantity = hibiscusQuantities[product.node.id] || 0;
                const displayPriceText = formatPrice(
                  displayPrice.amount,
                  displayPrice.currencyCode,
                );

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
                            {displayPriceText}
                          </p>
                          <p className="text-xs text-muted-foreground">One-time bundle</p>
                        </div>
                      </div>

                      <p role="status" aria-live="polite" className="mt-3 text-xs font-medium text-muted-foreground">
                        {plansLoading
                          ? 'Checking the live weekly subscription option...'
                          : plansError
                            ? 'The weekly subscription option could not be verified. Refresh and try again.'
                          : subscriptionPlan
                            ? `Subscription repeats weekly at ${displayPriceText}.`
                            : 'Weekly subscription is unavailable for this bundle.'}
                      </p>

                      {addOnProductAvailable && hibiscusPrice && (
                        <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3">
                          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">Add Hibiscus Tea</p>
                              <p className="text-xs text-muted-foreground">
                                {formatPrice(hibiscusPrice.amount, hibiscusPrice.currencyCode)} each · optional add-on
                              </p>
                            </div>
                            <div
                              className="flex w-full flex-shrink-0 items-center justify-between sm:w-auto sm:justify-start sm:gap-2"
                              role="group"
                              aria-label={`Hibiscus Tea add-on quantity for ${product.node.title}`}
                            >
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-full"
                                onClick={() => updateHibiscusQuantity(product.node.id, -1)}
                                disabled={hibiscusQuantity === 0 || cartIsLoading}
                                aria-label={`Remove one Hibiscus Tea add-on from ${product.node.title}`}
                              >
                                <Minus className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <span
                                className="min-w-8 text-center text-sm font-bold"
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                                aria-label={`Hibiscus Tea add-on quantity for ${product.node.title}: ${hibiscusQuantity}`}
                              >
                                {hibiscusQuantity}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-11 w-11 rounded-full"
                                onClick={() => updateHibiscusQuantity(product.node.id, 1)}
                                disabled={cartIsLoading}
                                aria-label={`Add one Hibiscus Tea add-on to ${product.node.title}`}
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                          {hibiscusQuantity > 0 && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Added once to this order. It does not become a separate subscription or repeat with a weekly bundle.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-4 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button asChild variant="outline" className="min-h-11 rounded-full">
                          <Link to={`/product/${encodeURIComponent(product.node.handle)}`}>
                            Details
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleAddBundle(product, undefined, hibiscusQuantity)}
                          disabled={!variant || cartIsLoading || isAddingOnce}
                          className="min-h-11 rounded-full"
                          aria-label={`Add ${product.node.title} to cart one time`}
                        >
                          {isAddingOnce ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                          )}
                          <span className="ml-2">{isAddingOnce ? 'Adding...' : 'One-time'}</span>
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            if (subscriptionPlan) {
                              void handleAddBundle(product, subscriptionPlan, hibiscusQuantity);
                            }
                          }}
                          disabled={
                            !variant ||
                            !subscriptionPlan ||
                            plansLoading ||
                            plansError ||
                            cartIsLoading ||
                            isAddingSubscription
                          }
                          className="min-h-11 rounded-full sm:col-span-2"
                          aria-label={`Subscribe weekly to ${product.node.title}`}
                        >
                          {isAddingSubscription ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          )}
                          <span className="ml-2">
                            {isAddingSubscription ? 'Adding...' : 'Subscribe weekly'}
                          </span>
                        </Button>
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
