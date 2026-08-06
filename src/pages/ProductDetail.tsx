import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2, Minus, Plus, RefreshCw, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '@/components/layout/Layout';
import { useProductByHandle } from '@/hooks/useProducts';
import { useCartStore } from '@/stores/cartStore';
import {
  formatPrice,
  getHeatingInstructions,
  getShopifyImageUrl,
  getStorefrontErrorMessage,
  parseNutrition,
} from '@/lib/shopify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NutritionLabel } from '@/components/products/NutritionLabel';
import { HeatingInstructions } from '@/components/products/HeatingInstructions';
import { Seo } from '@/components/seo/Seo';
import { SITE_ORIGIN } from '@/components/seo/siteConfig';

function truncateSeoText(value: string, maximumLength: number): string {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, maximumLength - 1).trimEnd()}…`;
}

const ProductDetail = () => {
  const { handle = '' } = useParams<{ handle: string }>();
  const { data: product, isLoading, error, refetch } = useProductByHandle(handle);
  const addItem = useCartStore((state) => state.addItem);
  const cartLoading = useCartStore((state) => state.isLoading);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const productNode = product?.node;
  const primaryVariant = productNode?.variants.edges[selectedVariantIndex]?.node;
  const primaryImage = productNode?.images.edges[0]?.node;
  const productJsonLd = productNode && primaryVariant
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: productNode.title,
        ...(productNode.description ? { description: productNode.description } : {}),
        ...(primaryImage ? { image: [primaryImage.url] } : {}),
        offers: {
          '@type': 'Offer',
          url: `${SITE_ORIGIN}/product/${encodeURIComponent(productNode.handle)}`,
          price: primaryVariant.price.amount,
          priceCurrency: primaryVariant.price.currencyCode,
          availability: primaryVariant.availableForSale
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        },
      }
    : undefined;

  useEffect(() => {
    if (!product) return;
    const firstAvailable = product.node.variants.edges.findIndex(({ node }) => node.availableForSale);
    setSelectedVariantIndex(firstAvailable >= 0 ? firstAvailable : 0);
    setQuantity(1);
  }, [product]);

  if (isLoading) {
    return (
      <Layout>
        <Seo
          title="Loading Product | Place in Thyme"
          description="Loading live product details from Place in Thyme."
          canonicalPath={`/product/${encodeURIComponent(handle)}`}
          noIndex
        />
        <div className="container py-10" role="status" aria-label="Loading product">
          <div className="grid gap-8 lg:grid-cols-2">
            <Skeleton className="aspect-square rounded-2xl" />
            <div className="space-y-5">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
          <span className="sr-only">Loading product…</span>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Seo
          title="Product Unavailable | Place in Thyme"
          description="This product could not be loaded from the Place in Thyme store."
          noIndex
        />
        <div className="container py-16 text-center" role="alert">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          <h1 className="mt-4 text-3xl font-bold">Product unavailable</h1>
          <p className="mt-3 text-muted-foreground">We could not load this product from the live store.</p>
          <Button type="button" variant="outline" className="mt-6" onClick={() => void refetch()}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <Seo
          title="Product Not Found | Place in Thyme"
          description="The requested Place in Thyme product could not be found."
          noIndex
        />
        <div className="container py-16 text-center">
          <h1 className="font-serif text-3xl font-bold">Product not found</h1>
          <Button asChild className="mt-5">
            <Link to="/weekly-meals">
              <ArrowLeft aria-hidden="true" />
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
  const mainImage = node.images.edges[0]?.node;
  const nutrition = parseNutrition(node.metafields);
  const heatingInstructions = getHeatingInstructions(node.metafields);
  const requiresConfiguration = node.handle === 'pick-n-choose-bundle';
  const seoTitle = truncateSeoText(`${node.title} | Place in Thyme`, 59);
  const seoDescription = truncateSeoText(
    node.description || `View ${node.title} availability and pricing from Place in Thyme.`,
    159,
  );

  const handleAddToCart = async () => {
    if (!selectedVariant?.availableForSale || requiresConfiguration) return;
    try {
      await addItem({
        product,
        variantId: selectedVariant.id,
        variantTitle: selectedVariant.title,
        price: selectedVariant.price,
        quantity,
        selectedOptions: selectedVariant.selectedOptions,
      });
      toast.success(`${node.title} added to cart`, { position: 'top-center' });
    } catch (addError) {
      toast.error(getStorefrontErrorMessage(addError), { position: 'top-center' });
    }
  };

  return (
    <Layout>
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonicalPath={`/product/${encodeURIComponent(node.handle)}`}
        openGraphType="product"
        imageUrl={mainImage?.url}
        imageAlt={mainImage?.altText || node.title}
        jsonLd={productJsonLd}
      />
      <div className="container py-8 md:py-12">
        <nav className="mb-6" aria-label="Breadcrumb">
          <Button asChild variant="ghost" size="sm">
            <Link to={node.productType === 'Juice' || node.productType === 'Juice Bundle' ? '/juices' : '/weekly-meals'}>
              <ArrowLeft aria-hidden="true" />
              Back to {node.productType === 'Meal' ? 'Meals' : 'Juices'}
            </Link>
          </Button>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-2xl bg-muted">
            {mainImage ? (
              <img
                src={getShopifyImageUrl(mainImage.url, 1200)}
                alt={mainImage.altText || node.title}
                width={mainImage.width || 1200}
                height={mainImage.height || 1200}
                decoding="async"
                loading="eager"
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-herb-light">
                <span className="font-serif text-lg text-muted-foreground">Image unavailable</span>
              </div>
            )}
          </div>

          <div className="flex flex-col">
            {node.productType && <Badge variant="secondary" className="mb-2 w-fit">{node.productType}</Badge>}
            <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">{node.title}</h1>
            <p className="mt-2 text-2xl font-bold text-primary">
              {formatPrice(
                selectedVariant?.price.amount || node.priceRange.minVariantPrice.amount,
                selectedVariant?.price.currencyCode || node.priceRange.minVariantPrice.currencyCode,
              )}
            </p>
            <p className="mt-6 text-muted-foreground leading-relaxed">
              {node.description || 'Description unavailable.'}
            </p>

            {variants.length > 1 && (
              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-foreground">Options</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {variants.map(({ node: variant }, index) => (
                    <Button
                      key={variant.id}
                      type="button"
                      variant={selectedVariantIndex === index ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={selectedVariantIndex === index}
                      onClick={() => setSelectedVariantIndex(index)}
                      disabled={!variant.availableForSale}
                    >
                      {variant.title}{!variant.availableForSale ? ' — Sold out' : ''}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className="mt-6">
              <legend className="text-sm font-medium text-foreground">Quantity</legend>
              <div className="mt-2 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Decrease ${node.title} quantity`}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity === 1}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <output className="w-12 text-center text-lg font-medium" aria-live="polite">{quantity}</output>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Increase ${node.title} quantity`}
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </fieldset>

            <Button
              type="button"
              size="lg"
              className="mt-8"
              onClick={handleAddToCart}
              disabled={cartLoading || !selectedVariant?.availableForSale || requiresConfiguration}
            >
              {cartLoading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ) : requiresConfiguration ? (
                'Builder unavailable'
              ) : selectedVariant?.availableForSale ? (
                <>
                  <ShoppingCart aria-hidden="true" />
                  Add to Cart — {formatPrice(
                    (Number.parseFloat(selectedVariant.price.amount) * quantity).toString(),
                    selectedVariant.price.currencyCode,
                  )}
                </>
              ) : (
                'Sold out'
              )}
            </Button>
            {requiresConfiguration && (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                Online bundle configuration is temporarily unavailable.
              </p>
            )}

            {node.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2" aria-label="Product tags">
                {node.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
              </div>
            )}
          </div>
        </div>

        {(nutrition || heatingInstructions) && (
          <section className="mt-12 grid gap-6 lg:grid-cols-2" aria-label="Product preparation details">
            {nutrition && <NutritionLabel nutrition={nutrition} />}
            {heatingInstructions && <HeatingInstructions instructions={heatingInstructions} />}
          </section>
        )}
      </div>
    </Layout>
  );
};

export default ProductDetail;
