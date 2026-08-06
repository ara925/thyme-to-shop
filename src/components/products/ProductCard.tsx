import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Loader2, Flame, Dumbbell, Sparkles, PackageOpen } from 'lucide-react';
import { ShopifyProduct, formatPrice, getStorefrontErrorMessage } from '@/lib/shopify';
import { getMealNutrition } from '@/lib/mealData';
import { getShopifyImageSrcSet, getShopifyImageUrl } from '@/lib/images';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';

interface ProductCardProps {
  product: ShopifyProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const { node } = product;
  const navigate = useNavigate();
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  
  const firstVariant = node.variants.edges.find(
    ({ node: variant }) => variant.availableForSale && !variant.requiresComponents,
  )?.node;
  const isComponentOnly =
    node.variants.edges.length > 0 &&
    node.variants.edges.every(({ node: variant }) => variant.requiresComponents);
  const image = node.images.edges[0]?.node;
  const price = firstVariant?.price || node.priceRange.minVariantPrice;
  const nutrition = getMealNutrition(node.handle);
  const isPickAndChoose = node.handle === 'pick-n-choose-bundle';
  const productHref = isPickAndChoose
    ? '/juices/pick-and-choose'
    : `/product/${encodeURIComponent(node.handle)}`;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isPickAndChoose) {
      navigate('/juices/pick-and-choose');
      return;
    }

    if (!firstVariant) return;
    
    try {
      await addItem({
        product,
        variantId: firstVariant.id,
        variantTitle: firstVariant.title,
        price: firstVariant.price,
        quantity: 1,
        selectedOptions: firstVariant.selectedOptions || [],
      });
      toast.success(`${node.title} added to cart`, {
        position: 'top-center',
      });
    } catch (error) {
      toast.error(getStorefrontErrorMessage(error), { position: 'top-center' });
    }
  };

  return (
    <Card className="group overflow-hidden rounded-2xl border-0 bg-card shadow-md transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
      <Link
        to={productHref}
        className="block rounded-t-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="aspect-square overflow-hidden bg-muted relative">
          {image ? (
            <img
              src={getShopifyImageUrl(image.url, 640)}
              srcSet={getShopifyImageSrcSet(image.url, [320, 480, 640, 800])}
              sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
              alt={image.altText || node.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-herb-light to-muted">
              <span className="font-serif text-lg text-muted-foreground">No Image</span>
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
                  <Flame className="mr-1 h-3 w-3 text-accent" />
                  {nutrition.calories} cal
                </Badge>
              )}
              {nutrition.protein && (
                <Badge className="bg-card/90 text-foreground backdrop-blur-sm border-0 shadow-sm text-xs font-semibold">
                  <Dumbbell className="mr-1 h-3 w-3 text-primary" />
                  {nutrition.protein}g protein
                </Badge>
              )}
            </div>
          )}
        </div>
        <CardContent className="p-5 pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-lg font-bold text-foreground line-clamp-2 leading-tight">
              {node.title}
            </h3>
            <p className="text-lg font-black text-accent whitespace-nowrap">
              {formatPrice(price.amount, price.currencyCode)}
            </p>
          </div>
          
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {node.description || 'Description unavailable from Shopify.'}
          </p>
          
        </CardContent>
      </Link>
      <CardContent className="px-5 pb-5 pt-0">
        {isComponentOnly && (
          <p className="mb-3 text-sm text-muted-foreground">
            Available only as part of a configured bundle.
          </p>
        )}
        <Button
          className="min-h-11 w-full rounded-full bg-primary shadow-md shadow-primary/15 transition-all hover:bg-primary/90"
          onClick={handleAddToCart}
          disabled={!isPickAndChoose && (isLoading || !firstVariant)}
        >
          {isPickAndChoose ? (
            <>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Build Bundle
            </>
          ) : isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span className="sr-only">Adding {node.title}</span>
            </>
          ) : isComponentOnly ? (
            <>
              <PackageOpen className="mr-2 h-4 w-4" aria-hidden="true" />
              Bundle component
            </>
          ) : !firstVariant ? (
            'Sold out'
          ) : (
            <>
              <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
              Add to Cart
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
