import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Loader2 } from 'lucide-react';
import { ShopifyProduct, formatPrice } from '@/lib/shopify';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';

interface ProductCardProps {
  product: ShopifyProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const { node } = product;
  const addItem = useCartStore(state => state.addItem);
  const isLoading = useCartStore(state => state.isLoading);
  
  const firstVariant = node.variants.edges[0]?.node;
  const image = node.images.edges[0]?.node;
  const price = node.priceRange.minVariantPrice;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!firstVariant) return;
    
    await addItem({
      product,
      variantId: firstVariant.id,
      variantTitle: firstVariant.title,
      price: firstVariant.price,
      quantity: 1,
      selectedOptions: firstVariant.selectedOptions || []
    });
    
    toast.success(`${node.title} added to cart`, {
      position: 'top-center',
    });
  };

  return (
    <Link to={`/product/${node.handle}`}>
      <Card className="group overflow-hidden border-0 bg-card shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 rounded-2xl">
        <div className="aspect-square overflow-hidden bg-muted relative">
          {image ? (
            <img
              src={image.url}
              alt={image.altText || node.title}
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
        </div>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-lg font-bold text-foreground line-clamp-2 leading-tight">
              {node.title}
            </h3>
            <p className="text-lg font-black text-accent whitespace-nowrap">
              {formatPrice(price.amount, price.currencyCode)}
            </p>
          </div>
          
          {node.description && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {node.description}
            </p>
          )}
          
          <Button 
            className="mt-4 w-full rounded-full bg-primary hover:bg-primary/90 shadow-md shadow-primary/15 transition-all"
            onClick={handleAddToCart}
            disabled={isLoading || !firstVariant?.availableForSale}
          >
            {isLoading ? (
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
    </Link>
  );
}