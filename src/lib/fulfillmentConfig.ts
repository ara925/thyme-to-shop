function parseBooleanFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const DELIVERY_SERVICE_AREA = 'Orange County';
export const DELIVERY_FEE_CENTS = 1_500;
export const DELIVERY_MINIMUM_CENTS = 9_900;
export const DELIVERY_CURRENCY = 'USD';
export const PICKUP_ADDRESS = '26021 Acero, Mission Viejo, CA 92691';

/**
 * Keep customer checkout fail-closed until the matching Shopify location,
 * local-delivery zone/rate, pickup instructions, and zero-shipping-rate setup
 * have been accepted in Admin.
 */
export const LOCAL_FULFILLMENT_READY = parseBooleanFlag(
  import.meta.env.VITE_SHOPIFY_LOCAL_FULFILLMENT_READY,
);

const APPROVED_DROPOFF_WINDOWS: FulfillmentWindowDefinition[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
];

const APPROVED_PICKUP_WINDOWS: FulfillmentWindowDefinition[] = [
  { value: 'monday-after-9am', label: 'Monday after 9:00 AM' },
];

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
  allowedLabels?: readonly string[],
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
        && !allowedDays.some((day) => {
          const normalizedLabel = label.toLowerCase();
          const normalizedDay = day.toLowerCase();
          return normalizedLabel === normalizedDay
            || normalizedLabel.startsWith(`${normalizedDay},`)
            || normalizedLabel.startsWith(`${normalizedDay} `);
        })
      ) {
        return { windows: [], error: 'A fulfillment window is outside the approved service days.' };
      }
      if (
        allowedLabels?.length
        && !allowedLabels.some((allowedLabel) => label === allowedLabel)
      ) {
        return { windows: [], error: 'A fulfillment window is outside the approved schedule.' };
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
  import.meta.env.VITE_DELIVERY_WINDOWS_JSON === undefined
    ? JSON.stringify(APPROVED_DROPOFF_WINDOWS)
    : import.meta.env.VITE_DELIVERY_WINDOWS_JSON,
  ['Monday', 'Tuesday'],
);
const pickupConfiguration = parseFulfillmentWindows(
  import.meta.env.VITE_PICKUP_WINDOWS_JSON === undefined
    ? JSON.stringify(APPROVED_PICKUP_WINDOWS)
    : import.meta.env.VITE_PICKUP_WINDOWS_JSON,
  ['Monday'],
  ['Monday after 9:00 AM'],
);

export const DROPOFF_WINDOWS = LOCAL_FULFILLMENT_READY
  ? dropoffConfiguration.windows
  : [];
export const DROPOFF_CONFIGURATION_ERROR = LOCAL_FULFILLMENT_READY
  ? dropoffConfiguration.error
  : 'Shopify local fulfillment is not ready.';
export const PICKUP_WINDOWS = LOCAL_FULFILLMENT_READY
  ? pickupConfiguration.windows
  : [];
export const PICKUP_CONFIGURATION_ERROR = LOCAL_FULFILLMENT_READY
  ? pickupConfiguration.error
  : 'Shopify pickup is not ready.';

/**
 * Pickup is client-approved. A non-empty deployment override still takes
 * precedence so operators can temporarily disable it without a code release.
 */
export const PICKUP_ENABLED = (
  LOCAL_FULFILLMENT_READY
  &&
  (import.meta.env.VITE_ENABLE_PICKUP === undefined
    ? true
    : parseBooleanFlag(import.meta.env.VITE_ENABLE_PICKUP))
  && PICKUP_WINDOWS.length > 0
);
