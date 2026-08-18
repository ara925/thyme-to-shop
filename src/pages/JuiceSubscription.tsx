import { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SubscriptionProductSkeletons } from '@/components/subscriptions/SubscriptionProductSkeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  normalizeSellingPlanGroupName,
  useProducts,
  useSellingPlans,
} from '@/hooks/useProducts';
import { getShopifyImageUrl } from '@/lib/images';
import {
  HIBISCUS_ADD_ON_TITLE,
  hasExpectedHibiscusAddOnPrice,
} from '@/lib/hibiscusAddOn';
import { type SellingPlan, type ShopifyProduct, formatPrice } from '@/lib/shopify';
import { parsePositiveMoneyCents } from '@/lib/subscriptionMinimum';
import {
  AlertCircle,
  Check,
  Leaf,
  Loader2,
  Mail,
  Minus,
  Plus,
} from 'lucide-react';

const JUICE_PRODUCT_QUERY = 'product_type:Juice AND NOT product_type:"Juice Bundle"';
const JUICE_BUNDLE_PRODUCT_QUERY = 'product_type:"Juice Bundle"';
const PICK_AND_CHOOSE_PRODUCT_TITLE = "Pick n' Choose Bundle";
const JUICE_SELLING_PLAN_GROUP = 'Pick n\u2019 Choose Bundle';
const REQUEST_EMAIL = 'info@placeinthyme.com';
const CONFIRMED_DISCOUNT_PERCENT = 10;

type Selections = Record<string, number>;
type BillingPreference = 'weekly' | 'prepaid';

const BILLING_PREFERENCE_COPY: Record<BillingPreference, string> = {
  weekly: 'Pay weekly for four weeks',
  prepaid: 'Prepay all four weeks',
};

function hasExactTenPercentAdjustment(plan: SellingPlan | undefined): boolean {
  if (!plan || plan.priceAdjustments.length !== 1) return false;

  const priceAdjustment = plan.priceAdjustments[0];
  const adjustment = priceAdjustment.adjustmentValue;
  return (
    // Shopify uses null to mean the adjustment always applies. The approved
    // subscription can renew after its four-week minimum, so a finite cap is
    // not sufficient even when it covers the first four orders.
    priceAdjustment.orderCount === null
    && adjustment.__typename === 'SellingPlanPercentagePriceAdjustment'
    && adjustment.percentage === CONFIRMED_DISCOUNT_PERCENT
  );
}

function formatCents(cents: number, currencyCode = 'USD'): string {
  return formatPrice((cents / 100).toFixed(2), currencyCode);
}

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
  const [selections, setSelections] = useState<Selections>({});
  const [billingPreference, setBillingPreference] = useState<BillingPreference | null>(null);
  const [hibiscusAddOnQuantity, setHibiscusAddOnQuantity] = useState(0);

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
  const minimumDisplay = minimumMoney && minimumCents !== null
    ? formatPrice(minimumMoney.amount, minimumMoney.currencyCode)
    : null;

  const standaloneJuices = useMemo(() => allProducts.filter(product => {
    if (product.node.productType !== 'Juice') return false;
    const variant = product.node.variants.edges[0]?.node;
    return Boolean(variant && !variant.requiresComponents);
  }), [allProducts]);
  const hibiscusAddOnMatches = useMemo(() => {
    const normalizedTitle = normalizeSellingPlanGroupName(HIBISCUS_ADD_ON_TITLE);
    return standaloneJuices.filter(product => (
      normalizeSellingPlanGroupName(product.node.title) === normalizedTitle
    ));
  }, [standaloneJuices]);
  const hibiscusAddOnProduct = hibiscusAddOnMatches.length === 1
    ? hibiscusAddOnMatches[0]
    : null;
  const hibiscusAddOnVariant = hibiscusAddOnProduct?.node.variants.edges[0]?.node;
  const hibiscusAddOnHasExpectedPrice = Boolean(
    hibiscusAddOnVariant
    && hasExpectedHibiscusAddOnPrice(hibiscusAddOnVariant.price),
  );
  const hibiscusAddOnPriceCents = hibiscusAddOnVariant && hibiscusAddOnHasExpectedPrice
    ? parsePositiveMoneyCents(hibiscusAddOnVariant.price.amount)
    : null;
  const hibiscusAddOnTotalCents = hibiscusAddOnPriceCents === null
    ? 0
    : hibiscusAddOnPriceCents * hibiscusAddOnQuantity;
  const individualJuices = useMemo(() => {
    const normalizedTitle = normalizeSellingPlanGroupName(HIBISCUS_ADD_ON_TITLE);
    return standaloneJuices.filter(product => (
      normalizeSellingPlanGroupName(product.node.title) !== normalizedTitle
    ));
  }, [standaloneJuices]);

  const selectedItems = useMemo(() => {
    const items: Array<{
      product: ShopifyProduct;
      quantity: number;
      priceCents: number;
      sellingPlan: SellingPlan | undefined;
    }> = [];

    Object.entries(selections).forEach(([productId, quantity]) => {
      if (quantity <= 0) return;
      const product = individualJuices.find(item => item.node.id === productId);
      const variant = product?.node.variants.edges[0]?.node;
      const priceCents = variant ? parsePositiveMoneyCents(variant.price.amount) : null;
      if (!product || !variant || priceCents === null) return;

      items.push({
        product,
        quantity,
        priceCents,
        sellingPlan: sellingPlansByProduct?.[productId],
      });
    });

    return items;
  }, [individualJuices, selections, sellingPlansByProduct]);

  const weeklyRetailCents = selectedItems.reduce(
    (total, item) => total + item.priceCents * item.quantity,
    0,
  );
  const anySelections = selectedItems.length > 0;
  const meetsMinimum = minimumCents !== null && weeklyRetailCents >= minimumCents;
  const remainingCents = minimumCents === null
    ? null
    : Math.max(0, minimumCents - weeklyRetailCents);
  const everySelectedItemHasExactWeeklyPlan = Boolean(
    anySelections
    && selectedItems.every(item => item.sellingPlan),
  );
  const everySelectedPlanHasExactDiscount = Boolean(
    everySelectedItemHasExactWeeklyPlan
    && selectedItems.every(item => hasExactTenPercentAdjustment(item.sellingPlan)),
  );
  const estimatedDiscountedWeeklyCents = everySelectedPlanHasExactDiscount
    ? Math.round(weeklyRetailCents * ((100 - CONFIRMED_DISCOUNT_PERCENT) / 100))
    : null;
  const estimatedPrepaidCents = estimatedDiscountedWeeklyCents === null
    ? null
    : estimatedDiscountedWeeklyCents * 4;
  const everyCatalogPlanHasExactDiscount = Boolean(
    individualJuices.length > 0
    && individualJuices.every(product => (
      hasExactTenPercentAdjustment(sellingPlansByProduct?.[product.node.id])
    )),
  );
  const selectedItemsRemainAvailable = selectedItems.every(item => {
    const variant = item.product.node.variants.edges[0]?.node;
    return Boolean(
      variant?.availableForSale
      && minimumMoney
      && variant.price.currencyCode === minimumMoney.currencyCode,
    );
  });
  const hibiscusAddOnSelectable = Boolean(
    hibiscusAddOnProduct
    && hibiscusAddOnVariant?.availableForSale
    && !hibiscusAddOnVariant.requiresComponents
    && hibiscusAddOnHasExpectedPrice
    && hibiscusAddOnPriceCents !== null
    && minimumMoney
    && hibiscusAddOnVariant.price.currencyCode === minimumMoney.currencyCode
  );
  const hibiscusAddOnSelectionValid = Boolean(
    hibiscusAddOnQuantity === 0
    || hibiscusAddOnSelectable
  );

  const configurationLoading = sellingPlansLoading || juiceBundleLoading;
  const minimumConfigurationUnavailable = Boolean(
    !juiceBundleLoading
    && (
      juiceBundleError
      || !pickAndChooseProduct
      || !minimumMoney
      || minimumCents === null
    ),
  );
  const canRequest = Boolean(
    meetsMinimum
    && everySelectedItemHasExactWeeklyPlan
    && selectedItemsRemainAvailable
    && hibiscusAddOnSelectionValid
    && !productsError
    && !sellingPlansError
    && !minimumConfigurationUnavailable
    && !configurationLoading,
  );

  const requestMailto = useMemo(() => {
    if (!canRequest || !minimumMoney || minimumCents === null || !billingPreference) return null;

    const itemLines = selectedItems.map(item => {
      const lineTotalCents = item.priceCents * item.quantity;
      return `- ${item.quantity} x ${item.product.node.title} = ${formatCents(lineTotalCents, minimumMoney.currencyCode)}`;
    });
    const subject = "4-week Pick n' Choose juice subscription request";
    const body = [
      'Hello Place in Thyme,',
      '',
      "I'd like to request the four-week Pick n' Choose juice subscription with this weekly mix:",
      '',
      ...itemLines,
      ...(hibiscusAddOnQuantity > 0 && hibiscusAddOnProduct
        ? [
            '',
            `Optional one-time add-on: ${hibiscusAddOnQuantity} x ${hibiscusAddOnProduct.node.title} = ${formatCents(hibiscusAddOnTotalCents, minimumMoney.currencyCode)}`,
            'The Hibiscus add-on is requested once, has no selling plan, and is excluded from the weekly minimum and 10% discount.',
          ]
        : []),
      '',
      `Weekly retail total: ${formatCents(weeklyRetailCents, minimumMoney.currencyCode)}`,
      ...(estimatedDiscountedWeeklyCents === null
        ? []
        : [`Estimated weekly total after verified 10% plan adjustment: ${formatCents(estimatedDiscountedWeeklyCents, minimumMoney.currencyCode)}`]),
      ...(billingPreference === 'prepaid' && estimatedPrepaidCents !== null
        ? [`Estimated four-week prepaid total: ${formatCents(estimatedPrepaidCents, minimumMoney.currencyCode)}`]
        : []),
      ...(hibiscusAddOnQuantity > 0
        ? [`One-time Hibiscus add-on total: ${formatCents(hibiscusAddOnTotalCents, minimumMoney.currencyCode)}`]
        : []),
      `Live weekly minimum: ${formatCents(minimumCents, minimumMoney.currencyCode)}`,
      '',
      'Confirmed subscription terms: 10% off the selected retail total and a minimum four-week commitment.',
      `Billing preference: ${BILLING_PREFERENCE_COPY[billingPreference]}.`,
      '',
      'Live Shopify configuration check:',
      `- Exact weekly plan on every selected juice: ${everySelectedItemHasExactWeeklyPlan ? 'Yes' : 'No'}`,
      `- Exact 10% percentage adjustment on every selected plan: ${everySelectedPlanHasExactDiscount ? 'Yes' : 'No'}`,
      '- Four-cycle commitment / prepaid option enforceable in online checkout: No; this is not currently exposed by the storefront configuration.',
      '',
      'Please send the manual enrollment or payment link, billing schedule, and delivery or pickup details before charging me.',
    ].join('\n');

    return `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [
    canRequest,
    billingPreference,
    everySelectedItemHasExactWeeklyPlan,
    everySelectedPlanHasExactDiscount,
    estimatedDiscountedWeeklyCents,
    estimatedPrepaidCents,
    hibiscusAddOnProduct,
    hibiscusAddOnQuantity,
    hibiscusAddOnTotalCents,
    minimumCents,
    minimumMoney,
    selectedItems,
    weeklyRetailCents,
  ]);

  const updateQuantity = (productId: string, delta: number) => {
    setSelections(previous => {
      const nextQuantity = Math.max(0, (previous[productId] || 0) + delta);
      return { ...previous, [productId]: nextQuantity };
    });
  };

  return (
    <Layout>
      <div className="relative overflow-hidden bg-gradient-to-b from-espresso to-primary/90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--herb-glow)/0.3),transparent_60%)]" />
        <div className="container relative py-16 md:py-24">
          <div className="max-w-2xl">
            <Badge className="mb-4 border-white/20 bg-white/10 text-white backdrop-blur-sm">
              <Leaf className="mr-1 h-3 w-3" />
              Pick n&apos; Choose
            </Badge>
            <h1 className="font-serif text-4xl font-bold tracking-tight text-white md:text-6xl">
              Build One Weekly Juice Mix
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/70">
              Choose the juices, shots, and teas you want each week. This is one Pick n&apos; Choose mix—not three rotating menus.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-5 py-2.5 text-sm text-white backdrop-blur-sm">
              <strong>{minimumDisplay || 'Live minimum unavailable'}</strong>
              {minimumDisplay ? <span>&nbsp;retail minimum / week</span> : null}
            </div>
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-5 py-2.5 text-sm text-white backdrop-blur-sm">
              Confirmed term: <strong>&nbsp;10% off</strong>
            </div>
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-5 py-2.5 text-sm text-white backdrop-blur-sm">
              Confirmed term: <strong>&nbsp;4-week minimum</strong>
            </div>
          </div>
        </div>
      </div>

      <section className="py-12 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-2 font-serif text-2xl font-bold text-foreground md:text-3xl">
              Build Your Pick n&apos; Choose Mix
            </h2>
            <p className="mb-4 text-muted-foreground">
              Product names, sizes, ingredients, and benefits below come directly from the live juice catalog. Choose any quantities until the live weekly retail minimum is met.
            </p>

            <div className="mb-8 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm text-foreground" role="note">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <div className="space-y-2">
                <p>
                  The confirmed subscription is 10% off with a four-week minimum commitment. Choose weekly billing or four-week prepayment below for manual enrollment.
                </p>
                <p>
                  {sellingPlansLoading
                    ? 'Checking the live weekly plans and discount configuration…'
                    : everyCatalogPlanHasExactDiscount
                      ? 'An exact 10% percentage adjustment is present on every live weekly juice plan. Online subscription checkout still remains unavailable until the four-cycle commitment or prepaid option can be verified and enforced.'
                      : 'Shopify still needs the confirmed exact 10% percentage adjustment on every live weekly juice plan. The four-cycle commitment and prepaid option also cannot currently be enforced in online checkout, so this page will not add a misleading subscription to the cart.'}
                </p>
                <p className="font-medium">
                  {everyCatalogPlanHasExactDiscount
                    ? 'The request below shows the live retail total and an estimated weekly total after the verified 10% plan adjustment. Enrollment and four-cycle enforcement remain manual.'
                    : 'The request below shows retail prices only; the confirmed discount must be configured or applied during manual enrollment.'}
                </p>
              </div>
            </div>

            {(configurationLoading || minimumConfigurationUnavailable || sellingPlansError) && (
              <div
                className={`mb-6 flex items-start gap-2 rounded-xl border p-4 text-sm ${minimumConfigurationUnavailable || sellingPlansError ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted/50 text-muted-foreground'}`}
                role="status"
              >
                {configurationLoading && !minimumConfigurationUnavailable && !sellingPlansError
                  ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                  : <AlertCircle className="mt-0.5 h-4 w-4" />}
                <span>
                  {configurationLoading && !minimumConfigurationUnavailable && !sellingPlansError
                    ? 'Confirming the exact live Pick n\' Choose minimum and weekly plan eligibility…'
                    : 'The exact live Pick n\' Choose minimum or weekly plan configuration is unavailable. Subscription requests are disabled until it can be verified.'}
                </span>
              </div>
            )}

            <div
              className={`mb-6 rounded-xl border p-4 ${meetsMinimum ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/50'}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {meetsMinimum
                    ? <Check className="h-5 w-5 text-primary" />
                    : <AlertCircle className="h-5 w-5 text-muted-foreground" />}
                  <span className="font-semibold">
                    Weekly retail total: {formatCents(weeklyRetailCents, minimumMoney?.currencyCode)}
                  </span>
                </div>
                {!meetsMinimum && remainingCents !== null && (
                  <span className="text-sm text-muted-foreground">
                    {weeklyRetailCents > 0
                      ? `${formatCents(remainingCents, minimumMoney?.currencyCode)} more to meet the minimum`
                      : `${minimumDisplay} minimum`}
                  </span>
                )}
                {minimumDisplay === null && (
                  <span className="text-sm text-destructive">Live minimum unavailable</span>
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${meetsMinimum ? 'bg-primary' : 'bg-accent'}`}
                  style={{
                    width: `${minimumCents === null
                      ? 0
                      : Math.min(100, (weeklyRetailCents / minimumCents) * 100)}%`,
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
            ) : individualJuices.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">No live juice products are available.</p>
            ) : (
              <div className="space-y-3">
                {individualJuices.map(product => {
                  const quantity = selections[product.node.id] || 0;
                  const variant = product.node.variants.edges[0]?.node;
                  const price = variant?.price || product.node.priceRange.minVariantPrice;
                  const image = product.node.images.edges[0]?.node;
                  const sellingPlan = sellingPlansByProduct?.[product.node.id];
                  const hasExactDiscount = hasExactTenPercentAdjustment(sellingPlan);
                  const currencyMatches = Boolean(
                    minimumMoney && price.currencyCode === minimumMoney.currencyCode,
                  );
                  const canSelect = Boolean(
                    variant?.availableForSale
                    && sellingPlan
                    && currencyMatches
                    && !configurationLoading
                    && !minimumConfigurationUnavailable
                    && !sellingPlansError,
                  );

                  return (
                    <Card key={product.node.id} className="border-0 shadow-sm transition-shadow hover:shadow-md">
                      <CardContent className="flex flex-wrap items-start gap-4 p-4">
                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                          {image ? (
                            <img
                              src={getShopifyImageUrl(image.url, 160)}
                              alt={image.altText || product.node.title}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-herb-light to-muted">
                              <span className="text-xs text-muted-foreground">No image</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-[12rem] flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="font-serif font-bold text-foreground">{product.node.title}</h3>
                            <p className="font-bold text-accent">{formatPrice(price.amount, price.currencyCode)}</p>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                            {product.node.description || 'Live product description unavailable.'}
                          </p>
                          {!variant?.availableForSale && (
                            <p className="mt-2 text-xs font-medium text-destructive">Sold out</p>
                          )}
                          {variant?.availableForSale && !sellingPlansLoading && !sellingPlan && (
                            <p className="mt-2 text-xs font-medium text-destructive">Exact weekly juice plan missing</p>
                          )}
                          {variant?.availableForSale && sellingPlan && !hasExactDiscount && (
                            <p className="mt-2 text-xs font-medium text-accent">Weekly plan found; exact 10% adjustment missing</p>
                          )}
                          {variant?.availableForSale && sellingPlan && hasExactDiscount && (
                            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              Weekly plan and exact 10% adjustment verified
                            </p>
                          )}
                          {variant?.availableForSale && minimumMoney && !currencyMatches && (
                            <p className="mt-2 text-xs font-medium text-destructive">Currency does not match the Pick n&apos; Choose minimum</p>
                          )}
                        </div>
                        <div className="ml-auto flex flex-shrink-0 items-center gap-2 self-center">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 rounded-full"
                            onClick={() => updateQuantity(product.node.id, -1)}
                            disabled={quantity === 0}
                            aria-label={`Remove one ${product.node.title}`}
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <span
                            className="w-8 text-center font-semibold"
                            aria-label={`${product.node.title} quantity`}
                          >
                            {quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 rounded-full"
                            onClick={() => updateQuantity(product.node.id, 1)}
                            disabled={!canSelect}
                            aria-label={`Add one ${product.node.title}`}
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

            {!productsLoading && !productsError && hibiscusAddOnProduct && hibiscusAddOnVariant && (
              <Card className="mt-6 border-accent/30 bg-accent/5 shadow-sm">
                <CardContent className="flex flex-col items-stretch gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="min-w-[12rem] flex-1">
                    <h3 className="font-serif font-bold text-foreground">
                      Optional one-time Hibiscus Tea add-on
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {formatPrice(hibiscusAddOnVariant.price.amount, hibiscusAddOnVariant.price.currencyCode)} each. Requested once with the first order, with no selling plan. It does not count toward the {minimumDisplay || 'weekly'} minimum and does not receive the 10% subscription discount.
                    </p>
                    {!hibiscusAddOnVariant.availableForSale && (
                      <p className="mt-2 text-xs font-medium text-destructive">Currently sold out</p>
                    )}
                    {minimumMoney && hibiscusAddOnVariant.price.currencyCode !== minimumMoney.currencyCode && (
                      <p className="mt-2 text-xs font-medium text-destructive">Currency does not match the Pick n&apos; Choose request</p>
                    )}
                    {!hibiscusAddOnHasExpectedPrice && (
                      <p className="mt-2 text-xs font-medium text-destructive">
                        The approved $3.00 USD add-on price could not be verified. Add-on selection is disabled.
                      </p>
                    )}
                  </div>
                  <div
                    className="flex flex-shrink-0 items-center gap-2 self-end sm:ml-auto sm:self-auto"
                    role="group"
                    aria-label="One-time Hibiscus Tea add-on quantity"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 rounded-full"
                      onClick={() => setHibiscusAddOnQuantity((quantity) => Math.max(0, quantity - 1))}
                      disabled={hibiscusAddOnQuantity === 0}
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
                      disabled={!hibiscusAddOnSelectable}
                      aria-label="Add one one-time Hibiscus Tea add-on"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!productsLoading && !productsError && hibiscusAddOnMatches.length !== 1 && (
              <p role="alert" className="mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
                The optional $3.00 Hibiscus Tea add-on is unavailable because one exact live product could not be verified. It remains excluded from the subscription mix.
              </p>
            )}

            {anySelections && (
              <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-lg">
                <h3 className="mb-4 font-serif text-xl font-bold">Four-Week Subscription Request</h3>
                <div className="mb-6 space-y-3">
                  {selectedItems.map(item => (
                    <div key={item.product.node.id} className="flex items-center justify-between gap-4">
                      <span className="font-medium">
                        {item.quantity} × {item.product.node.title}
                      </span>
                      <span className="font-bold">
                        {formatCents(item.priceCents * item.quantity, minimumMoney?.currencyCode)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mb-6 flex items-center justify-between border-t border-border pt-4">
                  <span className="font-serif text-lg font-bold">Weekly mix retail total</span>
                  <span className={`text-xl font-bold ${meetsMinimum ? 'text-primary' : 'text-destructive'}`}>
                    {formatCents(weeklyRetailCents, minimumMoney?.currencyCode)}
                  </span>
                </div>

                {hibiscusAddOnQuantity > 0 && hibiscusAddOnProduct && (
                  <div className="mb-6 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 p-4">
                    <div>
                      <span className="font-serif text-base font-bold">One-time Hibiscus add-on</span>
                      <p className="text-xs text-muted-foreground">Excluded from the weekly minimum and discount</p>
                    </div>
                    <span className="text-lg font-bold text-accent">
                      {formatCents(hibiscusAddOnTotalCents, minimumMoney?.currencyCode)}
                    </span>
                  </div>
                )}

                {estimatedDiscountedWeeklyCents !== null && (
                  <div className="mb-6 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <span className="font-serif text-lg font-bold">Estimated weekly total after verified 10%</span>
                    <span className="text-xl font-bold text-primary">
                      {formatCents(estimatedDiscountedWeeklyCents, minimumMoney?.currencyCode)}
                    </span>
                  </div>
                )}

                {!meetsMinimum && (
                  <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                    <p className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {minimumDisplay && remainingCents !== null
                        ? `Add ${formatCents(remainingCents, minimumMoney?.currencyCode)} more to meet the ${minimumDisplay} live weekly minimum.`
                        : 'The live weekly minimum is unavailable, so a request cannot be prepared.'}
                    </p>
                  </div>
                )}

                {meetsMinimum && !everySelectedPlanHasExactDiscount && (
                  <div className="mb-4 rounded-lg border border-accent/30 bg-accent/10 p-3">
                    <p className="flex items-start gap-2 text-sm text-foreground">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      The selected weekly plans do not all contain the confirmed exact 10% percentage adjustment. The enrollment request preserves that term, but this retail total is not presented as discounted pricing.
                    </p>
                  </div>
                )}

                <div className="mb-5 rounded-xl border border-border bg-muted/30 p-4">
                  <h3 className="font-serif text-base font-bold text-foreground">Billing preference</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Select how you want the confirmed four-week enrollment billed. This records a manual-enrollment choice; Shopify does not currently expose a four-payment commitment or prepaid plan for online checkout.
                  </p>
                  <RadioGroup
                    className="mt-4 gap-3"
                    value={billingPreference || ''}
                    onValueChange={(value) => setBillingPreference(value as BillingPreference)}
                    aria-label="Billing preference"
                  >
                    <Label htmlFor="juice-billing-weekly" className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 leading-relaxed">
                      <RadioGroupItem value="weekly" id="juice-billing-weekly" className="mt-0.5" />
                      <span>
                        <span className="block">Pay weekly for four weeks</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          Four weekly charges for the same mix. The confirmed four-cycle rule must be enforced during manual enrollment.
                        </span>
                      </span>
                    </Label>
                    <Label htmlFor="juice-billing-prepaid" className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 leading-relaxed">
                      <RadioGroupItem value="prepaid" id="juice-billing-prepaid" className="mt-0.5" />
                      <span>
                        <span className="block">Prepay all four weeks</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          One upfront payment covering four deliveries. No live prepaid selling plan is configured, so enrollment remains manual.
                        </span>
                      </span>
                    </Label>
                  </RadioGroup>
                  {billingPreference === 'prepaid' && estimatedPrepaidCents !== null && (
                    <p className="mt-3 text-sm font-semibold text-primary">
                      Estimated four-week prepaid total: {formatCents(estimatedPrepaidCents, minimumMoney?.currencyCode)}
                    </p>
                  )}
                  {!billingPreference && (
                    <p className="mt-3 text-xs font-medium text-accent" role="status">
                      Choose a billing preference to prepare the enrollment request.
                    </p>
                  )}
                </div>

                {requestMailto ? (
                  <Button asChild className="h-auto min-h-11 w-full whitespace-normal rounded-full bg-primary py-3 text-center leading-tight shadow-md hover:bg-primary/90" size="lg">
                    <a href={requestMailto}>
                      <Mail className="mr-2 h-5 w-5" />
                      Request This 4-Week Subscription
                    </a>
                  </Button>
                ) : (
                  <Button disabled className="h-auto min-h-11 w-full whitespace-normal rounded-full py-3 text-center leading-tight" size="lg">
                    <Mail className="mr-2 h-5 w-5" />
                    Request This 4-Week Subscription
                  </Button>
                )}
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  This opens a prefilled email to {REQUEST_EMAIL}. Nothing is added to the cart and no charge is made. Place in Thyme must manually apply the confirmed discount and four-week commitment, honor the selected billing preference, and provide fulfillment details before enrollment.
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
