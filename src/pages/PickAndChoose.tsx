import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ImageOff, Loader2, Minus, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  normalizeSellingPlanGroupName,
  useProducts,
} from '@/hooks/useProducts';
import { formatPrice, type ShopifyProduct, type ShopifyVariant } from '@/lib/shopify';
import { getShopifyImageSrcSet, getShopifyImageUrl } from '@/lib/images';
import {
  HIBISCUS_ADD_ON_ATTRIBUTE_VALUE,
  HIBISCUS_ADD_ON_TITLE,
  HIBISCUS_ADD_ON_TYPE_ATTRIBUTE,
  hasExpectedHibiscusAddOnPrice,
} from '@/lib/hibiscusAddOn';
import {
  PICK_AND_CHOOSE_BUNDLE_TITLE,
  normalizeJuiceBundleTitle,
  resolveJuiceBundleCatalog,
} from '@/lib/juiceBundleCatalog';
import { type CartItemInput, useCartStore } from '@/stores/cartStore';

export type QuantitiesByProductId = Record<string, number>;

export function moneyToCents(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function getSelectableVariant(product: ShopifyProduct): ShopifyVariant | undefined {
  return product.node.variants.edges.find(
    ({ node }) => node.availableForSale && !node.requiresComponents,
  )?.node;
}

export function findPickAndChooseBundle(products: ShopifyProduct[]): ShopifyProduct | undefined {
  const normalizedTitle = normalizeJuiceBundleTitle(PICK_AND_CHOOSE_BUNDLE_TITLE);
  const matches = products.filter(
    (product) =>
      product.node.productType === 'Juice Bundle' &&
      normalizeJuiceBundleTitle(product.node.title) === normalizedTitle,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function findHibiscusTeaAddOn(products: ShopifyProduct[]): ShopifyProduct | undefined {
  const normalizedTitle = normalizeSellingPlanGroupName(HIBISCUS_ADD_ON_TITLE);
  const matches = products.filter(
    (product) =>
      product.node.productType === 'Juice'
      && normalizeSellingPlanGroupName(product.node.title) === normalizedTitle,
  );
  if (matches.length !== 1) return undefined;

  const variant = getSelectableVariant(matches[0]);
  return variant && hasExpectedHibiscusAddOnPrice(variant.price) ? matches[0] : undefined;
}

export function getEligiblePickAndChooseProducts(
  products: ShopifyProduct[],
): ShopifyProduct[] {
  return products
    .filter(
      (product) =>
        product.node.productType === 'Juice'
        && normalizeSellingPlanGroupName(product.node.title)
          !== normalizeSellingPlanGroupName(HIBISCUS_ADD_ON_TITLE)
        && Boolean(getSelectableVariant(product)),
    )
    .sort((left, right) => left.node.title.localeCompare(right.node.title));
}

export function buildHibiscusAddOnCartItem(
  product: ShopifyProduct | undefined,
  quantity: number,
  bundleLabel: string,
  bundleInstance: string,
): CartItemInput | null {
  if (!product || quantity <= 0) return null;
  const variant = getSelectableVariant(product);
  if (!variant) {
    throw new Error(`${HIBISCUS_ADD_ON_TITLE} is no longer available.`);
  }
  if (!hasExpectedHibiscusAddOnPrice(variant.price)) {
    throw new Error('The approved $3.00 USD Hibiscus add-on price could not be verified.');
  }
  return {
    product,
    variantId: variant.id,
    variantTitle: variant.title,
    price: variant.price,
    quantity,
    selectedOptions: variant.selectedOptions || [],
    sellingPlanId: undefined,
    attributes: [
      { key: '_bundle_instance', value: bundleInstance },
      { key: '_bundle_label', value: `Hibiscus add-on for ${bundleLabel}` },
      { key: '_bundle_role', value: 'add-on' },
      { key: HIBISCUS_ADD_ON_TYPE_ATTRIBUTE, value: HIBISCUS_ADD_ON_ATTRIBUTE_VALUE },
    ],
  };
}

export function calculateSelectionCents(
  products: ShopifyProduct[],
  quantities: QuantitiesByProductId,
): number {
  return products.reduce((total, product) => {
    const quantity = quantities[product.node.id] || 0;
    const variant = getSelectableVariant(product);
    return total + (variant ? moneyToCents(variant.price.amount) * quantity : 0);
  }, 0);
}

export function buildPickAndChooseCartItems(
  products: ShopifyProduct[],
  quantities: QuantitiesByProductId,
  bundleLabel: string,
  bundleInstance: string,
  minimumCents: number,
  currencyCode: string,
): CartItemInput[] {
  return products.flatMap((product) => {
    const quantity = quantities[product.node.id] || 0;
    const variant = getSelectableVariant(product);
    if (quantity === 0) return [];
    if (!variant) {
      throw new Error(`${product.node.title} is no longer available for this bundle.`);
    }

    return [
      {
        product,
        variantId: variant.id,
        variantTitle: variant.title,
        price: variant.price,
        quantity,
        selectedOptions: variant.selectedOptions || [],
        attributes: [
          { key: '_bundle_instance', value: bundleInstance },
          { key: '_bundle_label', value: bundleLabel },
          { key: '_minimum_group', value: bundleInstance },
          { key: '_minimum_cents', value: String(minimumCents) },
          { key: '_minimum_currency', value: currencyCode },
          { key: '_minimum_label', value: bundleLabel },
          { key: '_bundle_role', value: 'primary' },
        ],
      },
    ];
  });
}

function createBundleInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pick-${crypto.randomUUID()}`;
  }
  return `pick-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function PickAndChooseBuilderLoadingState() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the Pick n&apos; Choose builder</span>
      <div
        className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
        aria-hidden="true"
      >
        <div>
          <div className="mb-7 space-y-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-full max-w-lg" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className="overflow-hidden border-border/70">
                <div className="grid h-full grid-cols-1">
                  <Skeleton className="aspect-[4/3] w-full rounded-none" />
                  <CardContent className="flex min-w-0 flex-col justify-between p-4 sm:p-5">
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                      <Skeleton className="h-10 w-16 rounded-full" />
                      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                    </div>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-6 shadow-lg">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="mt-3 h-4 w-48" />
          <Skeleton className="mt-8 h-20 w-full rounded-xl" />
          <div className="mt-5 border-t pt-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2 h-9 w-36" />
            <Skeleton className="mt-5 h-2 w-full rounded-full" />
            <Skeleton className="mt-4 h-4 w-4/5" />
            <Skeleton className="mt-6 h-11 w-full rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

const PickAndChoose = () => {
  const {
    data: juiceCatalog = [],
    isLoading: juicesLoading,
    isError: juicesError,
  } = useProducts(50, 'product_type:Juice AND NOT product_type:"Juice Bundle"');
  const {
    data: bundleCatalog = [],
    isLoading: bundlesLoading,
    isError: bundlesError,
  } = useProducts(50, 'product_type:"Juice Bundle"');
  const addItems = useCartStore((state) => state.addItems);
  const cartIsLoading = useCartStore((state) => state.isLoading);
  const [quantities, setQuantities] = useState<QuantitiesByProductId>({});
  const [hibiscusAddOnQuantity, setHibiscusAddOnQuantity] = useState(0);

  const bundleCatalogContract = useMemo(
    () => resolveJuiceBundleCatalog(bundleCatalog),
    [bundleCatalog],
  );
  const parentBundle = bundleCatalogContract.isValid
    ? bundleCatalogContract.pickAndChooseBundle
    : undefined;
  const eligibleProducts = useMemo(
    () => getEligiblePickAndChooseProducts(juiceCatalog),
    [juiceCatalog],
  );
  const hibiscusAddOnProduct = useMemo(
    () => findHibiscusTeaAddOn(juiceCatalog),
    [juiceCatalog],
  );
  const hibiscusAddOnVariant = hibiscusAddOnProduct
    ? getSelectableVariant(hibiscusAddOnProduct)
    : undefined;

  const minimumMoney = parentBundle?.node.priceRange.minVariantPrice;
  const minimumCents = moneyToCents(minimumMoney?.amount || '0');
  const selectedCents = calculateSelectionCents(eligibleProducts, quantities);
  const selectedUnits = eligibleProducts.reduce(
    (total, product) => total + (quantities[product.node.id] || 0),
    0,
  );
  const remainingCents = Math.max(0, minimumCents - selectedCents);
  const progress = minimumCents > 0 ? Math.min(100, (selectedCents / minimumCents) * 100) : 0;
  const parentVariant = parentBundle ? getSelectableVariant(parentBundle) : undefined;
  const parentAvailable = Boolean(parentVariant);
  const isLoading = juicesLoading || bundlesLoading;
  const hasConfigurationError =
    juicesError
    || bundlesError
    || !bundleCatalogContract.isValid
    || !parentBundle
    || minimumCents <= 0;
  const canAdd =
    !isLoading &&
    !hasConfigurationError &&
    parentAvailable &&
    minimumCents > 0 &&
    selectedUnits > 0 &&
    selectedCents >= minimumCents &&
    (hibiscusAddOnQuantity === 0 || Boolean(hibiscusAddOnVariant)) &&
    !cartIsLoading;

  const updateQuantity = (productId: string, nextQuantity: number) => {
    const safeQuantity = Number.isFinite(nextQuantity) ? Math.max(0, Math.floor(nextQuantity)) : 0;
    setQuantities((current) => ({ ...current, [productId]: safeQuantity }));
  };

  const handleAddBundle = async () => {
    if (!parentBundle || minimumCents <= 0) {
      toast.error('The live Pick n\' Choose bundle is not configured right now.', {
        position: 'top-center',
      });
      return;
    }
    if (!parentAvailable) {
      toast.error(`${parentBundle.node.title} is currently unavailable.`, {
        position: 'top-center',
      });
      return;
    }
    if (selectedCents < minimumCents) {
      toast.error(
        `Add ${formatPrice(
          (remainingCents / 100).toFixed(2),
          minimumMoney?.currencyCode,
        )} more to reach the live minimum.`,
        { position: 'top-center' },
      );
      return;
    }

    try {
      const bundleInstance = createBundleInstanceId();
      const selectedItems = buildPickAndChooseCartItems(
        eligibleProducts,
        quantities,
        parentBundle.node.title,
        bundleInstance,
        minimumCents,
        minimumMoney?.currencyCode || 'USD',
      );

      if (selectedItems.length === 0) return;
      const addOnItem = buildHibiscusAddOnCartItem(
        hibiscusAddOnProduct,
        hibiscusAddOnQuantity,
        parentBundle.node.title,
        bundleInstance,
      );
      if (addOnItem) selectedItems.push(addOnItem);
      await addItems(selectedItems);
      setQuantities({});
      setHibiscusAddOnQuantity(0);
      toast.success(
        `${parentBundle.node.title}${hibiscusAddOnQuantity > 0 ? ' with Hibiscus Tea add-on' : ''} added to cart.`,
        { position: 'top-center' },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The bundle could not be added.', {
        position: 'top-center',
      });
    }
  };

  const currencyCode = minimumMoney?.currencyCode || 'USD';
  const selectedProducts = eligibleProducts.filter((product) => (quantities[product.node.id] || 0) > 0);
  return (
    <Layout>
      <section
        className="border-b bg-gradient-to-br from-herb-light via-background to-terracotta-light/60"
        aria-busy={isLoading}
      >
        <div className="container py-10 md:py-16">
          <Button asChild variant="ghost" className="mb-6 -ml-4 rounded-full">
            <Link to="/juices">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to juices
            </Link>
          </Button>

          <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                Custom juice bundle
              </Badge>
              {isLoading ? (
                <div className="space-y-4" aria-hidden="true">
                  <Skeleton className="h-12 w-4/5 md:h-16" />
                  <Skeleton className="h-5 w-full max-w-xl" />
                  <Skeleton className="h-5 w-5/6 max-w-lg" />
                  <Skeleton className="h-6 w-48" />
                </div>
              ) : (
                <>
                  <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-6xl">
                    {parentBundle?.node.title || PICK_AND_CHOOSE_BUNDLE_TITLE}
                  </h1>
                  <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                    {parentBundle?.node.description ||
                      'Bundle details are currently unavailable from Shopify.'}
                  </p>
                  {minimumMoney && (
                    <p className="mt-5 text-base font-semibold text-primary">
                      One-time bundle minimum:{' '}
                      {formatPrice(minimumMoney.amount, minimumMoney.currencyCode)}
                    </p>
                  )}
                  <Button asChild variant="link" className="mt-3 h-auto p-0 text-primary">
                    <Link to="/subscribe/juices">Want the 10%-off four-week juice plan?</Link>
                  </Button>
                </>
              )}
            </div>

            {isLoading ? (
              <Skeleton className="aspect-[4/3] w-full rounded-3xl shadow-xl" aria-hidden="true" />
            ) : parentBundle?.node.images.edges[0]?.node ? (
              <img
                src={getShopifyImageUrl(parentBundle.node.images.edges[0].node.url, 960)}
                srcSet={getShopifyImageSrcSet(parentBundle.node.images.edges[0].node.url, [480, 720, 960])}
                sizes="(min-width: 1024px) 40vw, 100vw"
                alt={parentBundle.node.images.edges[0].node.altText || parentBundle.node.title}
                className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl"
                loading="eager"
                decoding="async"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-3xl bg-muted text-muted-foreground">
                <ImageOff className="h-12 w-12" aria-hidden="true" />
                <span className="sr-only">No bundle image available</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-12 md:py-20" aria-busy={isLoading}>
        <div className="container">
          {isLoading ? (
            <PickAndChooseBuilderLoadingState />
          ) : hasConfigurationError ? (
            <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/5 p-7 text-center">
              <h2 className="text-xl font-bold text-foreground">This bundle needs a store update</h2>
              {juicesError || bundlesError ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The live bundle product or minimum could not be loaded. No substitute product or price has been applied.
                </p>
              ) : !bundleCatalogContract.isValid ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    The live Juice Bundle catalog does not match the approved setup. No substitute bundle or price has been applied.
                  </p>
                  <ul className="mt-4 list-disc space-y-1 pl-5 text-left text-sm text-muted-foreground">
                    {bundleCatalogContract.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The live bundle minimum is unavailable. No substitute price has been applied.
                </p>
              )}
            </div>
          ) : eligibleProducts.length === 0 ? (
            <div role="status" className="mx-auto max-w-2xl rounded-2xl border bg-card p-7 text-center">
              <h2 className="text-xl font-bold text-foreground">No eligible items are available</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Available individual juices, shots, and teas will appear here from Shopify.
              </p>
            </div>
          ) : (
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div>
                <div className="mb-7">
                  <h2 className="text-3xl font-bold text-foreground">Choose your mix</h2>
                  <p className="mt-2 text-muted-foreground">
                    Choose any mix that reaches the live minimum value.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  {eligibleProducts.map((product) => {
                    const variant = getSelectableVariant(product);
                    const image = product.node.images.edges[0]?.node;
                    const quantity = quantities[product.node.id] || 0;
                    const displayPrice = variant?.price || product.node.priceRange.minVariantPrice;

                    return (
                      <Card key={product.node.id} className="overflow-hidden border-border/70">
                        <div className="grid h-full grid-cols-1">
                          <div className="aspect-[4/3] overflow-hidden bg-muted">
                            {image ? (
                              <img
                                src={getShopifyImageUrl(image.url, 640)}
                                srcSet={getShopifyImageSrcSet(image.url, [240, 400, 640])}
                                sizes="(min-width: 640px) 50vw, 7rem"
                                alt={image.altText || product.node.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted-foreground">
                                <ImageOff className="h-8 w-8" aria-hidden="true" />
                              </div>
                            )}
                          </div>
                          <CardContent className="flex min-w-0 flex-col justify-between p-4 sm:p-5">
                            <div>
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="font-serif text-lg font-bold text-foreground">
                                  {product.node.title}
                                </h3>
                                {!variant && <Badge variant="secondary">Sold out</Badge>}
                              </div>
                              <p className="mt-1 text-sm font-semibold text-primary">
                                {formatPrice(displayPrice.amount, displayPrice.currencyCode)} each
                              </p>
                              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                {product.node.description ||
                                  'Product details are currently unavailable from Shopify.'}
                              </p>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11 shrink-0 rounded-full"
                                onClick={() => updateQuantity(product.node.id, quantity - 1)}
                                disabled={!variant || quantity === 0 || cartIsLoading}
                                aria-label={`Remove one ${product.node.title}`}
                              >
                                <Minus className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                value={quantity}
                                onChange={(event) =>
                                  updateQuantity(product.node.id, Number(event.target.value))
                                }
                                disabled={!variant || cartIsLoading}
                                aria-label={`${product.node.title} quantity`}
                                className="w-16 rounded-full text-center"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11 shrink-0 rounded-full"
                                onClick={() => updateQuantity(product.node.id, quantity + 1)}
                                disabled={!variant || cartIsLoading}
                                aria-label={`Add one ${product.node.title}`}
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </CardContent>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {hibiscusAddOnProduct && hibiscusAddOnVariant && (
                  <Card className="mt-6 border-accent/30 bg-accent/5">
                    <CardContent className="flex flex-col items-stretch gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-[12rem] flex-1">
                        <h3 className="font-serif text-lg font-bold text-foreground">
                          Optional one-time Hibiscus Tea add-on
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatPrice(hibiscusAddOnVariant.price.amount, hibiscusAddOnVariant.price.currencyCode)} each. Added once, with no selling plan, charged separately, and excluded from the {formatPrice((minimumCents / 100).toFixed(2), currencyCode)} minimum.
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-2 self-end sm:self-auto"
                        role="group"
                        aria-label="One-time Hibiscus Tea add-on quantity"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-11 w-11 rounded-full"
                          onClick={() => setHibiscusAddOnQuantity((quantity) => Math.max(0, quantity - 1))}
                          disabled={hibiscusAddOnQuantity === 0 || cartIsLoading}
                          aria-label="Remove one one-time Hibiscus Tea add-on"
                        >
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <span className="w-8 text-center font-semibold" role="status" aria-live="polite" aria-atomic="true">
                          <span className="sr-only">One-time Hibiscus Tea add-on quantity: </span>
                          {hibiscusAddOnQuantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-11 w-11 rounded-full"
                          onClick={() => setHibiscusAddOnQuantity((quantity) => quantity + 1)}
                          disabled={cartIsLoading}
                          aria-label="Add one one-time Hibiscus Tea add-on"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {!hibiscusAddOnProduct && (
                  <p role="status" className="mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
                    The optional $3.00 USD Hibiscus Tea add-on is currently unavailable. It remains excluded from the bundle minimum.
                  </p>
                )}
              </div>

              <aside className="rounded-3xl border bg-card p-6 shadow-lg lg:sticky lg:top-28" aria-label="Bundle summary">
                <h2 className="text-2xl font-bold text-foreground">Your bundle</h2>
                <p className="mt-1 text-sm text-muted-foreground">Purchase option: one time</p>
                {!parentAvailable && (
                  <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    This bundle is currently unavailable in the live store.
                  </p>
                )}

                <div className="mt-6 space-y-4">
                  {selectedProducts.length === 0 ? (
                    <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                      Use the + buttons to start building your mix.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm" aria-label="Selected bundle items">
                      {selectedProducts.map((product) => {
                        const quantity = quantities[product.node.id] || 0;
                        const variant = getSelectableVariant(product);
                        const lineTotal = variant
                          ? moneyToCents(variant.price.amount) * quantity
                          : 0;
                        return (
                          <li key={product.node.id} className="flex justify-between gap-3">
                            <span className="min-w-0 text-muted-foreground">
                              {quantity} x {product.node.title}
                            </span>
                            <span className="shrink-0 font-semibold">
                              {formatPrice((lineTotal / 100).toFixed(2), currencyCode)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {hibiscusAddOnQuantity > 0 && hibiscusAddOnVariant && (
                    <div className="flex justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
                      <span className="text-muted-foreground">
                        {hibiscusAddOnQuantity} x one-time Hibiscus add-on
                      </span>
                      <span className="font-semibold">
                        {formatPrice(
                          ((moneyToCents(hibiscusAddOnVariant.price.amount) * hibiscusAddOnQuantity) / 100).toFixed(2),
                          hibiscusAddOnVariant.price.currencyCode,
                        )}
                      </span>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Selected value</p>
                        <p className="text-3xl font-bold text-foreground" aria-live="polite">
                          {formatPrice((selectedCents / 100).toFixed(2), currencyCode)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selectedUnits} {selectedUnits === 1 ? 'item' : 'items'}
                      </p>
                    </div>

                    <Progress
                      value={progress}
                      className="mt-4 h-2"
                      aria-label={`${Math.round(progress)}% of the minimum bundle value selected`}
                    />

                    <div className="mt-3 min-h-5 text-sm" aria-live="polite">
                      {remainingCents > 0 ? (
                        <p className="text-muted-foreground">
                          Add {formatPrice((remainingCents / 100).toFixed(2), currencyCode)} more to reach the minimum.
                        </p>
                      ) : (
                        <p className="flex items-center font-semibold text-primary">
                          <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                          Minimum reached
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    className="h-auto min-h-11 w-full whitespace-normal rounded-full py-3 text-center leading-tight"
                    onClick={handleAddBundle}
                    disabled={!canAdd}
                  >
                    {cartIsLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {cartIsLoading ? 'Adding bundle...' : 'Add one-time bundle to cart'}
                  </Button>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default PickAndChoose;
