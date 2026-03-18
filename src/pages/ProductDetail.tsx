import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useProductByHandle } from '@/hooks/useProducts';
import { useCartStore } from '@/stores/cartStore';
import { formatPrice } from '@/lib/shopify';
import { getMealNutrition, getMealHeatingInstructions } from '@/lib/mealData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShoppingCart, ArrowLeft, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { NutritionLabel } from '@/components/products/NutritionLabel';
import { HeatingInstructions } from '@/components/products/HeatingInstructions';

const ProductDetail = () => {
  const { handle } = useParams<{ handle: string }>();
  const { data: product, isLoading } = useProductByHandle(handle || '');
  const addItem = useCartStore(state => state.addItem);
  const cartLoading = useCartStore(state => state.isLoading);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-16 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="font-serif text-2xl font-bold">Product not found</h1>
          <Button asChild className="mt-4">
            <Link to="/weekly-meals">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Menu
            </Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const { node } = product;
  const variants = node.variants.edges;
  const selectedVariant = variants[selectedVariantIndex]?.node;
  const images = node.images.edges;
  const mainImage = images[0]?.node;
  const nutrition = parseNutrition(node.metafields);
  const heatingInstructions = getHeatingInstructions(node.metafields);

  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    
    await addItem({
      product,
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price,
      quantity,
      selectedOptions: selectedVariant.selectedOptions || []
    });
    
    toast.success(`${node.title} added to cart`, {
      position: 'top-center',
    });
  };

  return (
    <Layout>
      <div className="container py-8 md:py-12">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/weekly-meals">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Menu
            </Link>
          </Button>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Image */}
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">
            {mainImage ? (
              <img
                src={mainImage.url}
                alt={mainImage.altText || node.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-herb-light">
                <span className="font-serif text-lg text-muted-foreground">No Image</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            {node.productType && (
              <Badge variant="secondary" className="w-fit mb-2">
                {node.productType}
              </Badge>
            )}
            
            <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
              {node.title}
            </h1>
            
            <p className="mt-2 text-2xl font-bold text-primary">
              {formatPrice(
                selectedVariant?.price.amount || node.priceRange.minVariantPrice.amount,
                selectedVariant?.price.currencyCode || node.priceRange.minVariantPrice.currencyCode
              )}
            </p>

            {node.description && (
              <p className="mt-6 text-muted-foreground leading-relaxed">
                {node.description}
              </p>
            )}

            {/* Variant Selection */}
            {variants.length > 1 && (
              <div className="mt-6">
                <label className="text-sm font-medium text-foreground">Options</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {variants.map((variant, index) => (
                    <Button
                      key={variant.node.id}
                      variant={selectedVariantIndex === index ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedVariantIndex(index)}
                      disabled={!variant.node.availableForSale}
                    >
                      {variant.node.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mt-6">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <div className="mt-2 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-lg font-medium">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Add to Cart */}
            <Button
              size="lg"
              className="mt-8 bg-primary hover:bg-primary/90"
              onClick={handleAddToCart}
              disabled={cartLoading || !selectedVariant?.availableForSale}
            >
              {cartLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Add to Cart — {formatPrice(
                    (parseFloat(selectedVariant?.price.amount || '0') * quantity).toString(),
                    selectedVariant?.price.currencyCode || 'USD'
                  )}
                </>
              )}
            </Button>

            {/* Tags */}
            {node.tags && node.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {node.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Nutrition & Heating Instructions */}
        {(nutrition || heatingInstructions) && (
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {nutrition && <NutritionLabel nutrition={nutrition} />}
            {heatingInstructions && <HeatingInstructions instructions={heatingInstructions} />}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ProductDetail;
