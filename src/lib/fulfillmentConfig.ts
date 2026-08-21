function parseBooleanFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export interface FulfillmentWindowDefinition {
  value: string;
  label: string;
}

export type FulfillmentWindow = string;

interface ParsedWindowConfiguration {
  windows: FulfillmentWindowDefinition[];
  error: string | null;
}

export function parseFulfillmentWindows(
  value: string | undefined,
  allowedDays?: readonly string[],
): ParsedWindowConfiguration {
  if (!value?.trim()) {
    return { windows: [], error: 'No fulfillment windows are configured.' };
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 20) {
      return { windows: [], error: 'Fulfillment windows must be a non-empty JSON array.' };
    }

    const windows: FulfillmentWindowDefinition[] = [];
    const values = new Set<string>();
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        return { windows: [], error: 'Every fulfillment window must be an object.' };
      }
      const candidate = entry as Record<string, unknown>;
      const windowValue = typeof candidate.value === 'string' ? candidate.value.trim() : '';
      const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(windowValue) || !label || label.length > 100) {
        return { windows: [], error: 'A fulfillment window has an invalid value or label.' };
      }
      if (
        allowedDays?.length
        && !allowedDays.some((day) => label.toLowerCase().startsWith(`${day.toLowerCase()},`))
      ) {
        return { windows: [], error: 'A fulfillment window is outside the approved service days.' };
      }
      if (values.has(windowValue)) {
        return { windows: [], error: 'Fulfillment window values must be unique.' };
      }
      values.add(windowValue);
      windows.push({ value: windowValue, label });
    }

    return { windows, error: null };
  } catch {
    return { windows: [], error: 'Fulfillment windows contain invalid JSON.' };
  }
}

const dropoffConfiguration = parseFulfillmentWindows(
  import.meta.env.VITE_DELIVERY_WINDOWS_JSON,
  ['Monday', 'Tuesday'],
);
const pickupConfiguration = parseFulfillmentWindows(
  import.meta.env.VITE_PICKUP_WINDOWS_JSON,
);

export const DROPOFF_WINDOWS = dropoffConfiguration.windows;
export const DROPOFF_CONFIGURATION_ERROR = dropoffConfiguration.error;
export const PICKUP_WINDOWS = pickupConfiguration.windows;
export const PICKUP_CONFIGURATION_ERROR = pickupConfiguration.error;

/**
 * Pickup stays hidden unless the deployed storefront explicitly enables it.
 * This prevents the cart from offering a fulfillment method that has not been
 * configured with an approved Shopify pickup location and instructions.
 */
export const PICKUP_ENABLED = (
  parseBooleanFlag(import.meta.env.VITE_ENABLE_PICKUP)
  && PICKUP_WINDOWS.length > 0
);
