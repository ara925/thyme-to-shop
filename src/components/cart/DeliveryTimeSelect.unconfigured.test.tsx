import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fulfillmentConfig', () => ({
  DELIVERY_SERVICE_AREA: 'Orange County',
  DROPOFF_CONFIGURATION_ERROR: 'No fulfillment windows are configured.',
  DROPOFF_WINDOWS: [],
  LOCAL_FULFILLMENT_READY: false,
  PICKUP_ADDRESS: '26021 Acero, Mission Viejo, CA 92691',
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
      /checkout stays disabled while launch testing is in progress/i,
    );
    expect(screen.getByText(/online ordering is in test mode/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
