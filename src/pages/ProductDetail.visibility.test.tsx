import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDetail from './ProductDetail';

const mocks = vi.hoisted(() => ({
  useProductByHandle: vi.fn(),
  addItem: vi.fn(),
  handle: 'weekly-meal-package-rotating-3-menu-cycle',
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ handle: mocks.handle }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
    <div data-testid="redirect" data-to={to} data-replace={String(Boolean(replace))} />
  ),
}));

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useProducts', () => ({
  useProductByHandle: mocks.useProductByHandle,
}));

vi.mock('@/stores/cartStore', () => ({
  useCartStore: (selector: (state: { addItem: typeof mocks.addItem; isLoading: boolean }) => unknown) => (
    selector({ addItem: mocks.addItem, isLoading: false })
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ProductDetail storefront visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = '';
    mocks.handle = 'weekly-meal-package-rotating-3-menu-cycle';
    mocks.useProductByHandle.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('marks a missing product as noindex instead of indexing a soft 404', () => {
    mocks.handle = 'missing-product';

    render(<ProductDetail />);

    expect(screen.getByRole('heading', { name: 'Product not found' })).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    );
  });

  it('does not fetch or render the incompatible $95 package and redirects to the approved plan', () => {
    render(<ProductDetail />);

    expect(mocks.useProductByHandle).toHaveBeenCalledWith('');
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/subscribe/meals');
    expect(screen.getByTestId('redirect')).toHaveAttribute('data-replace', 'true');
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
  });

  it.each(['hibiscus-tea-sweetened', 'hibiscus-tea-add-on'])(
    'keeps %s available only through the approved juice add-on controls',
    (handle) => {
      mocks.handle = handle;

      render(<ProductDetail />);

      expect(mocks.useProductByHandle).toHaveBeenCalledWith('');
      expect(screen.getByTestId('redirect')).toHaveAttribute('data-to', '/juices');
      expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
    },
  );
});
