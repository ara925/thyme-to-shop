import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeliveryTimeSelect } from './DeliveryTimeSelect';

describe('DeliveryTimeSelect local fulfillment', () => {
  it('offers the approved Orange County delivery and Monday pickup choices', () => {
    const onMethodChange = vi.fn();

    render(
      <DeliveryTimeSelect
        fulfillmentMethod="delivery"
        value=""
        onMethodChange={onMethodChange}
        onWindowChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delivery' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pickup' })).toBeInTheDocument();
    expect(screen.getByText('Preferred Local Delivery Day')).toBeInTheDocument();
    expect(screen.getByText(/orange county delivery:/i)).toBeInTheDocument();
    expect(screen.getByText(/\$15 on orders of \$99 or more/i)).toBeInTheDocument();
    expect(screen.getByText(/free pickup is available at 26021 acero, mission viejo, ca 92691 on monday after 9:00 am/i)).toBeInTheDocument();
    expect(screen.getByText(/shipping is not currently offered/i)).toBeInTheDocument();
    expect(onMethodChange).not.toHaveBeenCalled();
  });
});
