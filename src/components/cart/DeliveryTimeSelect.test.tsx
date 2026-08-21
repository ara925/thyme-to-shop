import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeliveryTimeSelect } from './DeliveryTimeSelect';

describe('DeliveryTimeSelect local fulfillment', () => {
  it('defaults to local delivery and resets stale pickup state when pickup is not configured', async () => {
    const onMethodChange = vi.fn();

    render(
      <DeliveryTimeSelect
        fulfillmentMethod="pickup"
        value=""
        onMethodChange={onMethodChange}
        onWindowChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/local delivery only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pickup' })).not.toBeInTheDocument();
    expect(screen.getByText('Preferred Local Delivery Window')).toBeInTheDocument();
    await waitFor(() => expect(onMethodChange).toHaveBeenCalledWith('delivery'));
  });
});
