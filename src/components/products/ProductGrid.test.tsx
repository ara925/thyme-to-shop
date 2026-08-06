import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductGrid } from './ProductGrid';

vi.mock('./ProductCard', () => ({
  ProductCard: () => <div>Product card</div>,
}));

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
});
