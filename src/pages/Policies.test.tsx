import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Policies from './Policies';

const mocks = vi.hoisted(() => ({ policies: vi.fn() }));
vi.mock('@/components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/storePolicies', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/storePolicies')>(), fetchStorePolicies: mocks.policies }));

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Policies /></MemoryRouter></QueryClientProvider>);

describe('customer policy page', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows the merchant-published cancellation policy and direct section navigation', async () => {
    mocks.policies.mockResolvedValue({ privacyPolicy: null, refundPolicy: null, termsOfService: null, shippingPolicy: null,
      subscriptionPolicy: { title: 'Subscription policy', body: '<p>TEST ONLY: merchant cancellation terms.</p>', url: '' } });
    show();
    expect(await screen.findByText('TEST ONLY: merchant cancellation terms.')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Policy sections' })).getByRole('link', { name: 'Subscription cancellation policy' })).toHaveAttribute('href', '#subscriptionPolicy');
    expect(document.getElementById('subscriptionPolicy')).toHaveTextContent('TEST ONLY: merchant cancellation terms.');
  });
  it('shows an honest missing-policy state instead of inventing merchant terms', async () => {
    mocks.policies.mockResolvedValue({ privacyPolicy: null, refundPolicy: null, termsOfService: null, shippingPolicy: null, subscriptionPolicy: null });
    show(); await screen.findAllByText('This policy has not been published yet. Please contact Place in Thyme for details.');
    expect(document.getElementById('subscriptionPolicy')).toHaveTextContent('This policy has not been published yet.');
  });
});
