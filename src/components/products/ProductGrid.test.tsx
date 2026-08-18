import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShopifyProduct } from '@/lib/shopify';
import { ProductGrid } from './ProductGrid';

vi.mock('./ProductCard', () => ({
  ProductCard: ({ product }: { product: ShopifyProduct }) => <div>{product.node.title}</div>,
}));

function createProduct(handle: string, title: string): ShopifyProduct {
  return {
    node: {
      id: `product-${handle}`,
      title,
      description: '',
      handle,
      priceRange: { minVariantPrice: { amount: '10.00', currencyCode: 'USD' } },
      images: { edges: [] },
      variants: { edges: [] },
      options: [],
      tags: ['meal', 'week-a'],
      productType: 'Meal',
    },
  };
}

describe('ProductGrid', () => {
  it('shows an accessible product skeleton while loading', () => {
    const { container } = render(<ProductGrid products={[]} isLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(1);
  });

  it('shows a fetch failure instead of the empty catalog state', () => {
    render(
      <ProductGrid
        products={[]}
        errorMessage="The live catalog could not be loaded."
        emptyMessage="No products are available."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The live catalog could not be loaded.',
    );
    expect(screen.queryByText('No products are available.')).not.toBeInTheDocument();
  });

  it('keeps the normal empty state when the request succeeds', () => {
    render(<ProductGrid products={[]} emptyMessage="No products are available." />);

    expect(screen.getByText('No products are available.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('removes only the incompatible legacy meal package from customer-facing grids', () => {
    render(
      <ProductGrid
        products={[
          createProduct(
            'weekly-meal-package-rotating-3-menu-cycle',
            'Weekly Meal Package (Rotating 3-Menu Cycle)',
          ),
          createProduct('protein-pancakes-2', 'Protein Pancakes'),
        ]}
      />,
    );

    expect(screen.queryByText('Weekly Meal Package (Rotating 3-Menu Cycle)'))
      .not.toBeInTheDocument();
    expect(screen.getByText('Protein Pancakes')).toBeInTheDocument();
  });

  it('uses the normal empty state when the legacy package is the only result', () => {
    render(
      <ProductGrid
        products={[
          createProduct(
            'weekly-meal-package-rotating-3-menu-cycle',
            'Weekly Meal Package (Rotating 3-Menu Cycle)',
          ),
        ]}
        emptyMessage="No approved meals are available."
      />,
    );

    expect(screen.getByText('No approved meals are available.')).toBeInTheDocument();
    expect(screen.queryByText('Weekly Meal Package (Rotating 3-Menu Cycle)'))
      .not.toBeInTheDocument();
  });

  it('keeps Hibiscus products out of standalone grids while preserving normal juices', () => {
    render(
      <ProductGrid
        products={[
          createProduct('hibiscus-tea-sweetened', 'Hibiscus Tea (Sweetened)'),
          createProduct('hibiscus-tea-add-on', 'Hibiscus Tea Add-On'),
          createProduct('green-cleanse', 'Green Cleanse'),
        ]}
      />,
    );

    expect(screen.queryByText('Hibiscus Tea (Sweetened)')).not.toBeInTheDocument();
    expect(screen.queryByText('Hibiscus Tea Add-On')).not.toBeInTheDocument();
    expect(screen.getByText('Green Cleanse')).toBeInTheDocument();
  });
});
