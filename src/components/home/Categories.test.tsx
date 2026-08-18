import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopifyProduct } from '@/lib/shopify';
import { Categories } from './Categories';

const mocks = vi.hoisted(() => ({
  useProducts: vi.fn(),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: mocks.useProducts,
}));

function createProduct({
  handle,
  title,
  amount,
  productType,
}: {
  handle: string;
  title: string;
  amount: string;
  productType: 'Meal' | 'Juice';
}): ShopifyProduct {
  return {
    node: {
      id: handle,
      title,
      description: '',
      handle,
      productType,
      tags: [],
      priceRange: { minVariantPrice: { amount, currencyCode: 'USD' } },
      images: { edges: [] },
      options: [{ name: 'Title', values: ['Default Title'] }],
      variants: {
        edges: [{
          node: {
            id: `${handle}-variant`,
            title: 'Default Title',
            price: { amount, currencyCode: 'USD' },
            availableForSale: true,
            requiresComponents: false,
            selectedOptions: [],
          },
        }],
      },
    },
  };
}

describe('Categories live starting prices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the hidden $3 Hibiscus record from driving the juice starting price', () => {
    const meal = createProduct({
      handle: 'chicken-meal',
      title: 'Chicken Meal',
      amount: '12.00',
      productType: 'Meal',
    });
    const hiddenHibiscus = createProduct({
      handle: 'hibiscus-tea-sweetened',
      title: 'Hibiscus Tea (Sweetened)',
      amount: '3.00',
      productType: 'Juice',
    });
    const visibleJuice = createProduct({
      handle: 'green-cleanse',
      title: 'Green Cleanse',
      amount: '8.50',
      productType: 'Juice',
    });

    mocks.useProducts.mockImplementation((_first: number, query: string) => ({
      data: query === 'product_type:Meal'
        ? [meal]
        : [hiddenHibiscus, visibleJuice],
      isLoading: false,
      isError: false,
    }));

    render(
      <MemoryRouter>
        <Categories />
      </MemoryRouter>,
    );

    expect(screen.getByText('From $8.50/bottle')).toBeInTheDocument();
    expect(screen.queryByText('From $3.00/bottle')).not.toBeInTheDocument();
  });
});
