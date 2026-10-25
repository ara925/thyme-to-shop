/** Exact, non-negative decimal money; never accept parseFloat's partial matches. */
export function parseMoneyCents(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
