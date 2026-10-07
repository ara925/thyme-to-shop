import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { formatPrice, getStorefrontErrorMessage } from '@/lib/shopify';
import {
  LOCAL_FULFILLMENT_READY,
  PICKUP_ENABLED,
} from '@/lib/fulfillmentConfig';
import { useOrderCutoffStatus } from '@/hooks/useOrderCutoffStatus';
import {
  getDeliveryMinimumStatus,
  validateFulfillmentForCheckout,
} from '@/lib/fulfillmentRules';
import { getCartValidationMessage, useCartStore } from '@/stores/cartStore';
import { DeliveryTimeSelect } from './DeliveryTimeSelect';

export function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    items,
    warnings,
    subtotal,
    error,
    isLoading,
    isSyncing,
    updateQuantity,
    removeItem,
    prepareCheckout,
    syncCart,
    getTotalItems,
    deliveryWindow,
    setDeliveryWindow,
    fulfillmentMethod,
    setFulfillmentMethod,
    fulfillmentAttributesConfirmed,
    clearError,
    clearWarnings,
  } = useCartStore();
  const totalItems = getTotalItems();
  const cartValidationMessage = getCartValidationMessage(items);
  const deliveryMinimum = getDeliveryMinimumStatus(subtotal, fulfillmentMethod);
  const { isCurrentCycleCutoffPassed } = useOrderCutoffStatus();
  const orderCutoffOpen = LOCAL_FULFILLMENT_READY && !isCurrentCycleCutoffPassed;

  useEffect(() => {
    if (isOpen) void syncCart();
  }, [isOpen, syncCart]);

  const runLineOperation = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (operationError) {
      toast.error(getStorefrontErrorMessage(operationError), { position: 'top-center' });
    }
  };

  const handleCheckout = async () => {
    try {
      validateFulfillmentForCheckout(subtotal, fulfillmentMethod);
      const checkoutUrl = await prepareCheckout();
      setIsOpen(false);
      window.location.assign(checkoutUrl);
    } catch (checkoutError) {
      toast.error(getStorefrontErrorMessage(checkoutError), { position: 'top-center' });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-11 w-11"
          aria-label={`Open cart, ${totalItems} item${totalItems === 1 ? '' : 's'}`}
        >
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {totalItems > 0 && (
            <Badge className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent p-0 text-xs text-accent-foreground">
              {totalItems}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex h-[100dvh] w-full flex-col gap-0 p-4 sm:max-w-lg sm:p-6">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="font-serif">Shopping Cart</SheetTitle>
          <SheetDescription>
            {totalItems === 0
              ? 'Your cart is empty'
              : `${totalItems} item${totalItems === 1 ? '' : 's'} in your cart`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4 pr-1">

        {error && (
          <div
            className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <span className="flex-1">{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearError}
              aria-label="Dismiss cart error"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {warnings.length > 0 && (
          <div
            className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100"
            role="status"
            aria-live="polite"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Your cart was updated</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {warnings.map((warning, index) => (
                  <li key={`${warning.code}-${warning.target}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearWarnings}
              aria-label="Dismiss cart updates"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        <div className="flex flex-col pt-2">
          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <ShoppingCart
                  className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-muted-foreground">Your cart is empty</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add some delicious meals, juices, or bundles.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div aria-label="Cart items">
                <div className="space-y-4">
                  {items.map((item) => {
                    const image = item.product.node.images.edges[0]?.node;
                    const bundleLabel = item.attributes?.find(
                      (attribute) => attribute.key === '_bundle_label',
                    )?.value;
                    const menuWeek = item.attributes?.find(
                      (attribute) => attribute.key === 'Menu Week',
                    )?.value;
                    return (
                      <div key={item.lineId} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 rounded-lg bg-secondary/30 p-3">
                        <div className="h-12 w-12 overflow-hidden rounded-md bg-muted">
                          {image && (
                            <img
                              src={image.url}
                              alt={image.altText || item.product.node.title}
                              width="64"
                              height="64"
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-medium leading-snug">
                            <Link to={`/product/${item.product.node.handle}`} onClick={() => setIsOpen(false)} className="underline-offset-4 hover:underline">{item.product.node.title}</Link>
                          </h3>
                          {item.variantTitle !== 'Default Title' && (
                            <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                          )}
                          {item.sellingPlanId && (
                            <p className="mt-1 text-xs text-muted-foreground">Weekly subscription · billed and delivered every week</p>
                          )}
                          {(bundleLabel || menuWeek) && (
                            <p className="text-xs text-muted-foreground">
                              {bundleLabel || menuWeek}
                            </p>
                          )}
                          <p className="mt-1 font-semibold text-primary">
                            {formatPrice(item.lineSubtotal.amount, item.lineSubtotal.currencyCode)}
                            {item.sellingPlanId && <span className="text-xs font-normal"> / week</span>}
                          </p>
                        </div>
                        <div className="col-span-2 flex items-center justify-between gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => runLineOperation(() => removeItem(item.lineId))}
                            disabled={isLoading || isSyncing}
                            aria-label={`Remove ${item.product.node.title} from cart`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                runLineOperation(() =>
                                  updateQuantity(item.lineId, item.quantity - 1),
                                )
                              }
                              disabled={isLoading || isSyncing}
                              aria-label={`Decrease ${item.product.node.title} quantity`}
                            >
                              <Minus className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <span
                              className="w-8 text-center text-sm"
                              aria-label={`${item.quantity} in cart`}
                            >
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                runLineOperation(() =>
                                  updateQuantity(item.lineId, item.quantity + 1),
                                )
                              }
                              disabled={isLoading || isSyncing}
                              aria-label={`Increase ${item.product.node.title} quantity`}
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 space-y-4 border-t border-border bg-background pt-4 pb-2">
                <DeliveryTimeSelect
                  fulfillmentMethod={fulfillmentMethod}
                  value={deliveryWindow}
                  onMethodChange={setFulfillmentMethod}
                  onWindowChange={setDeliveryWindow}
                  disabled={isLoading || isSyncing}
                />
                <div className="flex items-center justify-between">
                  <span className="font-serif text-lg font-semibold">Subtotal</span>
                  <span className="text-xl font-bold text-primary">
                    {subtotal ? formatPrice(subtotal.amount, subtotal.currencyCode) : '—'}
                  </span>
                </div>
                {cartValidationMessage && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{cartValidationMessage}</p>}
                {LOCAL_FULFILLMENT_READY
                  && !deliveryMinimum.isMet
                  && fulfillmentMethod === 'delivery' && (
                  <p className="text-sm text-destructive" role="alert">
                    {deliveryMinimum.message}
                  </p>
                )}
                <Button
                  onClick={handleCheckout}
                  className="w-full bg-primary hover:bg-primary/90"
                  size="lg"
                  disabled={
                    items.length === 0 ||
                    Boolean(cartValidationMessage) ||
                    !deliveryWindow ||
                    !fulfillmentAttributesConfirmed ||
                    !deliveryMinimum.isMet ||
                    !orderCutoffOpen ||
                    (!PICKUP_ENABLED && fulfillmentMethod === 'pickup') ||
                    isLoading ||
                    isSyncing
                  }
                >
                  {isLoading || isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />
                      Proceed to Checkout
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
