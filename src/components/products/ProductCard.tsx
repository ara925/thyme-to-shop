import { Link } from 'react-router-dom';
import { Dumbbell, Flame, Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  formatPrice,
  getShopifyImageUrl,
  getStorefrontErrorMessage,
  parseNutrition,
  type ShopifyProduct,
} from '@/lib/shopify';
import { useCartStore } from '@/stores/cartStore';

interface ProductCardProps {
  product: ShopifyProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const { node } = product;
  const addItem = useCartStore((state) => state.addItem);
  const isLoading = useCartStore((state) => state.isLoading);
  const variants = node.variants.edges.map(({ node: variant }) => variant);
  const availableVariants = variants.filter((variant) => variant.availableForSale);
  const directAddVariant = variants.length === 1 ? availableVariants[0] : undefined;
  const image = node.images.edges[0]?.node;
  const displayPrice = directAddVariant?.price || node.priceRange.minVariantPrice;
  const nutrition = parseNutrition(node.metafields);
  const requiresConfiguration = node.handle === 'pick-n-choose-bundle';

  const handleAddToCart = async () => {
    if (!directAddVariant || requiresConfiguration) return;
    try {
      await addItem({
        product,
        variantId: directAddVariant.id,
        variantTitle: directAddVariant.title,
        price: directAddVariant.price,
        quantity: 1,
        selectedOptions: directAddVariant.selectedOptions,
      });
      toast.success(`${node.title} added to cart`, { position: 'top-center' });
    } catch (error) {
      toast.error(getStorefrontErrorMessage(error), { position: 'top-center' });
    }
  };

  return (
    <Card className="group overflow-hidden border-0 bg-card shadow-md transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl rounded-2xl">
      <Link to={`/product/${node.handle}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`View ${node.title}`}>
        <div className="aspect-square overflow-hidden bg-muted relative">
          {image ? (
            <img
              src={getShopifyImageUrl(image.url, 720)}
              alt={image.altText || node.title}
              width={image.width || 720}
              height={image.height || 720}
              loading="lazy"
              decoding="async"
              sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-herb-light to-muted">
              <span className="font-serif text-lg text-muted-foreground">Image unavailable</span>
            </div>
          )}
          {node.productType && (
            <Badge className="absolute top-3 left-3 bg-card/90 text-foreground backdrop-blur-sm border-0 shadow-sm text-xs font-semibold">
              {node.productType}
            </Badge>
          )}
          {nutrition && (nutrition.calories || nutrition.protein) && (
            <div className="absolute bottom-3 left-3 flex gap-1.5">
              {nutrition.calories && (
                <Badge className="bg-card/90 text-foreground backdrop-blur-sm border-0 shadow-sm text-xs font-semibold">
                  <Flame className="mr-1 h-3 w-3 text-accent" aria-hidden="true" />
                  {nutrition.calories} cal
                </Badge>
              )}
              {nutrition.protein && (
                <Badge className="bg-card/90 text-foreground backdrop-blur-sm border-0 shadow-sm text-xs font-semibold">
                  <Dumbbell className="mr-1 h-3 w-3 text-primary" aria-hidden="true" />
                  {nutrition.protein}g protein
                </Badge>
              )}
            </div>
          )}
        </div>
        <CardContent className="p-5 pb-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-lg font-bold text-foreground line-clamp-2 leading-tight">{node.title}</h3>
            <p className="text-lg font-black text-accent whitespace-nowrap">
              {formatPrice(displayPrice.amount, displayPrice.currencyCode)}
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {node.description || 'Description unavailable.'}
          </p>
        </CardContent>
      </Link>
      <CardContent className="px-5 pb-5 pt-0">
        {variants.length > 1 ? (
          <Button asChild className="w-full rounded-full shadow-md">
            <Link to={`/product/${node.handle}`}>Choose options</Link>
          </Button>
        ) : requiresConfiguration ? (
          <Button type="button" className="w-full rounded-full" disabled>
            Builder unavailable
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full rounded-full shadow-md"
            onClick={handleAddToCart}
            disabled={isLoading || !directAddVariant}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Adding…
              </>
            ) : directAddVariant ? (
              <>
                <ShoppingCart aria-hidden="true" />
                Add to Cart
              </>
            ) : (
              'Sold out'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
