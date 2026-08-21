import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fulfillmentConfig', () => ({
  DROPOFF_CONFIGURATION_ERROR: 'No fulfillment windows are configured.',
  DROPOFF_WINDOWS: [],
  PICKUP_ENABLED: false,
  PICKUP_WINDOWS: [],
}));

import { DeliveryTimeSelect } from './DeliveryTimeSelect';

describe('DeliveryTimeSelect without approved windows', () => {
  it('shows a blocking message and does not invent a selectable schedule', () => {
    render(
      <DeliveryTimeSelect
        fulfillmentMethod="delivery"
        value=""
        onMethodChange={vi.fn()}
        onWindowChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /still needs to publish its approved Monday and Tuesday windows/i,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
