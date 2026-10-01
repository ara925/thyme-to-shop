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

  it('accepts approved day-only delivery choices without inventing hours', () => {
    expect(parseFulfillmentWindows(JSON.stringify([
      { value: 'monday', label: 'Monday' },
      { value: 'tuesday', label: 'Tuesday' },
    ]), ['Monday', 'Tuesday'])).toEqual({
      windows: [
        { value: 'monday', label: 'Monday' },
        { value: 'tuesday', label: 'Tuesday' },
      ],
      error: null,
    });
  });

  it('accepts only the approved Monday-after-9 pickup wording', () => {
    expect(parseFulfillmentWindows(JSON.stringify([
      { value: 'monday-after-9am', label: 'Monday after 9:00 AM' },
    ]), ['Monday'], ['Monday after 9:00 AM']).error).toBeNull();

    expect(parseFulfillmentWindows(JSON.stringify([
      { value: 'tuesday-after-9am', label: 'Tuesday after 9:00 AM' },
    ]), ['Monday'], ['Monday after 9:00 AM']).error).toMatch(/outside the approved service days/i);

    for (const label of ['Monday', 'Monday at 8:00 AM']) {
      expect(parseFulfillmentWindows(JSON.stringify([
        { value: 'monday-custom', label },
      ]), ['Monday'], ['Monday after 9:00 AM']).error).toMatch(/outside the approved schedule/i);
    }
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
