import { describe, expect, it } from 'vitest';
import { parseFulfillmentWindows } from './fulfillmentConfig';

describe('fulfillment window configuration', () => {
  it('fails closed when no client-approved windows are configured', () => {
    expect(parseFulfillmentWindows(undefined)).toEqual({
      windows: [],
      error: 'No fulfillment windows are configured.',
    });
  });

  it('accepts a valid ordered list of combined day and time labels', () => {
    expect(parseFulfillmentWindows(JSON.stringify([
      { value: 'monday-10am-12pm', label: 'Monday, 10:00 AM – 12:00 PM' },
      { value: 'tuesday-10am-12pm', label: 'Tuesday, 10:00 AM – 12:00 PM' },
    ]))).toEqual({
      windows: [
        { value: 'monday-10am-12pm', label: 'Monday, 10:00 AM – 12:00 PM' },
        { value: 'tuesday-10am-12pm', label: 'Tuesday, 10:00 AM – 12:00 PM' },
      ],
      error: null,
    });
  });

  it.each([
    'not-json',
    '[]',
    JSON.stringify([{ value: '../monday', label: 'Monday' }]),
    JSON.stringify([
      { value: 'monday', label: 'Monday morning' },
      { value: 'monday', label: 'Monday afternoon' },
    ]),
  ])('rejects invalid or ambiguous configuration: %s', (configuration) => {
    expect(parseFulfillmentWindows(configuration).windows).toEqual([]);
    expect(parseFulfillmentWindows(configuration).error).not.toBeNull();
  });

  it('rejects delivery windows outside the client-approved Monday and Tuesday service days', () => {
    const result = parseFulfillmentWindows(
      JSON.stringify([{ value: 'wednesday-10am', label: 'Wednesday, 10:00 AM' }]),
      ['Monday', 'Tuesday'],
    );

    expect(result.windows).toEqual([]);
    expect(result.error).toMatch(/outside the approved service days/i);
  });
});
