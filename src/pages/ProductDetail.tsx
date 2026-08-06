import { useParams, Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useProductByHandle } from '@/hooks/useProducts';
import { useCartStore } from '@/stores/cartStore';
import { formatPrice, getStorefrontErrorMessage } from '@/lib/shopify';
import { getMealNutrition, getMealHeatingInstructions } from '@/lib/mealData';
import { getShopifyImageSrcSet, getShopifyImageUrl } from '@/lib/images';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ShoppingCart, ArrowLeft, Minus, Plus, PackageOpen } from 'lucide-react';
import { toast } from 'sonner';
import { NutritionLabel } from '@/components/products/NutritionLabel';
import { HeatingInstructions } from '@/components/products/HeatingInstructions';

const ProductDetail = () => {
  const { handle } = useParams<{ handle: string }>();
  const safeHandle = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(handle || '') ? handle || '' : '';
  const { data: product, isLoading, isError, refetch } = useProductByHandle(safeHandle);
  const addItem = useCartStore(state => state.addItem);
  const cartLoading = useCartStore(state => state.isLoading);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const seoVariant = product?.node.variants.edges[selectedVariantIndex]?.node;

  useEffect(() => {
    if (!product) return;
    const firstStandaloneVariant = product.node.variants.edges.findIndex(
      ({ node: variant }) => variant.availableForSale && !variant.requiresComponents,
    );
    setSelectedVariantIndex(firstStandaloneVariant >= 0 ? firstStandaloneVariant : 0);
    setQuantity(1);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const fullTitle = `${product.node.title} | Place in Thyme`;
    const title = fullTitle.length <= 60
      ? fullTitle
      : `${product.node.title.slice(0, 41).trimEnd()}… | Place in Thyme`;
    const description = (product.node.description || product.node.title)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 157);
    const setMeta = (selector: string, attribute: 'name' | 'property', key: string, value: string) => {
      const element = document.head.querySelector<HTMLMetaElement>(selector);
      if (element) {
        element.content = value;
      } else {
        const meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        meta.content = value;
        document.head.appendChild(meta);
      }
    };

    document.title = title;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'product');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    const componentOnly = product.node.variants.edges.every(
      ({ node: variant }) => variant.requiresComponents,
    );
    setMeta(
      'meta[name="robots"]',
      'name',
      'robots',
      componentOnly ? 'noindex,follow' : 'index,follow',
    );
    const primaryImage = product.node.images.edges[0]?.node.url;
    if (primaryImage) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', primaryImage);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', primaryImage);
      setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    }

    const schema = document.createElement('script');
    schema.id = 'place-in-thyme-product';
    schema.type = 'application/ld+json';
    schema.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.node.title,
      description,
      image: product.node.images.edges.map(({ node }) => node.url),
      offers: seoVariant && !seoVariant.requiresComponents
        ? {
            '@type': 'Offer',
            price: seoVariant.price.amount,
            priceCurrency: seoVariant.price.currencyCode,
            availability: seoVariant.availableForSale
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: window.location.href,
          }
        : undefined,
    });
    document.getElementById(schema.id)?.remove();
    document.head.appendChild(schema);

    return () => schema.remove();
  }, [product, seoVariant]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-8 md:py-12">
          <div role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">Loading product details</span>
            <div aria-hidden="true">
              <Skeleton className="mb-6 h-9 w-32 rounded-full" />
              <div className="grid gap-8 lg:grid-cols-2">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <div className="flex flex-col">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="mt-3 h-11 w-4/5" />
                  <Skeleton className="mt-3 h-8 w-28" />
                  <div className="mt-7 space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <div className="mt-7 space-y-3">
                    <Skeleton className="h-4 w-20" />
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-11 w-11 rounded-md" />
                      <Skeleton className="h-7 w-12" />
                      <Skeleton className="h-11 w-11 rounded-md" />
                    </div>
                  </div>
                  <Skeleton className="mt-8 h-12 w-full rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <div className="container flex min-h-[50vh] items-center justify-center py-16">
          <div
            role="alert"
            className="w-full max-w-xl rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
          >
            <h1 className="font-serif text-2xl font-bold text-foreground">
              We couldn&apos;t load this product
            </h1>
            <p className="mt-3 text-muted-foreground">
              The live product details are temporarily unavailable. Please try again.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button type="button" onClick={() => void refetch()}>
                Try again
              </Button>
              <Button asChild variant="outline">
                <Link to="/weekly-meals">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Menu
                </Link>
              </Button>
            </div>
          </div>
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
  const isComponentOnly =
    variants.length > 0 && variants.every(({ node: variant }) => variant.requiresComponents);
  const selectedVariantRequiresComponents = Boolean(selectedVariant?.requiresComponents);
  const images = node.images.edges;
  const mainImage = images[0]?.node;
  const nutrition = getMealNutrition(node.handle);
  const heatingInstructions = getMealHeatingInstructions(node.handle);

  if (node.handle === 'pick-n-choose-bundle') {
    return <Navigate to="/juices/pick-and-choose" replace />;
  }

  const handleAddToCart = async () => {
    if (!selectedVariant || selectedVariant.requiresComponents) return;
    
    try {
      await addItem({
        product,
        variantId: selectedVariant.id,
        variantTitle: selectedVariant.title,
        price: selectedVariant.price,
        quantity,
        selectedOptions: selectedVariant.selectedOptions || [],
      });
      toast.success(`${node.title} added to cart`, {
        position: 'top-center',
      });
    } catch (error) {
      toast.error(getStorefrontErrorMessage(error), { position: 'top-center' });
    }
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
                src={getShopifyImageUrl(mainImage.url, 1200)}
                srcSet={getShopifyImageSrcSet(mainImage.url, [480, 720, 960, 1200])}
                sizes="(min-width: 1024px) 50vw, 100vw"
                alt={mainImage.altText || node.title}
                fetchPriority="high"
                decoding="async"
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

            <p className="mt-6 leading-relaxed text-muted-foreground">
              {node.description || 'Description unavailable from Shopify.'}
            </p>

            {isComponentOnly && (
              <div
                className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
                role="note"
              >
                This item is configured in Shopify as a bundle component and cannot be purchased on its own.
              </div>
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
                      disabled={!variant.node.availableForSale || variant.node.requiresComponents}
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
                  className="h-11 w-11"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={selectedVariantRequiresComponents}
                  aria-label={`Decrease ${node.title} quantity`}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-lg font-medium">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  onClick={() => setQuantity(quantity + 1)}
                  disabled={selectedVariantRequiresComponents}
                  aria-label={`Increase ${node.title} quantity`}
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
              disabled={
                cartLoading ||
                !selectedVariant?.availableForSale ||
                selectedVariantRequiresComponents
              }
            >
              {cartLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : selectedVariantRequiresComponents ? (
                <>
                  <PackageOpen className="mr-2 h-5 w-5" aria-hidden="true" />
                  Available only in a bundle
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-5 w-5" aria-hidden="true" />
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
