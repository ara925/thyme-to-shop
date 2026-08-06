import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
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
import { formatPrice, getShopifyImageUrl, getStorefrontErrorMessage } from '@/lib/shopify';
import { useCartStore } from '@/stores/cartStore';
import { CutoffBanner } from './CutoffBanner';
import { DeliveryTimeSelect } from './DeliveryTimeSelect';

export function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    items,
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
  } = useCartStore();
  const totalItems = getTotalItems();

  useEffect(() => {
    if (isOpen) void syncCart();
  }, [isOpen, syncCart]);

  useEffect(() => {
    if (fulfillmentMethod !== 'delivery') setFulfillmentMethod('delivery');
  }, [fulfillmentMethod, setFulfillmentMethod]);

  const runLineOperation = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (operationError) {
      toast.error(getStorefrontErrorMessage(operationError), { position: 'top-center' });
    }
  };

  const handleCheckout = async () => {
    try {
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
          className="relative"
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
      <SheetContent className="flex h-full w-full flex-col sm:max-w-lg">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="font-serif">Shopping Cart</SheetTitle>
          <SheetDescription>
            {totalItems === 0
              ? 'Your cart is empty'
              : `${totalItems} item${totalItems === 1 ? '' : 's'} in your cart`}
          </SheetDescription>
          {totalItems > 0 && (
            <div className="pt-1">
              <CutoffBanner />
            </div>
          )}
        </SheetHeader>

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

        <div className="flex min-h-0 flex-1 flex-col pt-6">
          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
                <p className="text-muted-foreground">Your cart is empty</p>
                <p className="mt-2 text-sm text-muted-foreground">Add a meal or juice to get started.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                <div className="space-y-4">
                  {items.map((item) => {
                    const image = item.product.node.images.edges[0]?.node;

                    return (
                      <div key={item.lineId} className="flex gap-3 rounded-lg bg-secondary/30 p-3">
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                          {image && (
                            <img
                              src={getShopifyImageUrl(image.url, 128)}
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
                          <h3 className="truncate text-sm font-medium">{item.product.node.title}</h3>
                          {item.variantTitle !== 'Default Title' && (
                            <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                          )}
                          <p className="mt-1 font-semibold text-primary">
                            {formatPrice(item.lineSubtotal.amount, item.lineSubtotal.currencyCode)}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-2">
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
                              onClick={() => runLineOperation(() => updateQuantity(item.lineId, item.quantity - 1))}
                              disabled={isLoading || isSyncing}
                              aria-label={`Decrease ${item.product.node.title} quantity`}
                            >
                              <Minus className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <span className="w-8 text-center text-sm" aria-label={`${item.quantity} in cart`}>
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => runLineOperation(() => updateQuantity(item.lineId, item.quantity + 1))}
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

              <div className="flex-shrink-0 space-y-4 border-t border-border bg-background pt-4">
                <DeliveryTimeSelect
                  value={deliveryWindow}
                  onWindowChange={setDeliveryWindow}
                  disabled={isLoading || isSyncing}
                />
                <div className="flex items-center justify-between">
                  <span className="font-serif text-lg font-semibold">Subtotal</span>
                  <span className="text-xl font-bold text-primary">
                    {subtotal ? formatPrice(subtotal.amount, subtotal.currencyCode) : '—'}
                  </span>
                </div>
                <Button
                  onClick={handleCheckout}
                  className="w-full"
                  size="lg"
                  disabled={
                    items.length === 0 ||
                    !deliveryWindow ||
                    !fulfillmentAttributesConfirmed ||
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
      </SheetContent>
    </Sheet>
  );
}
