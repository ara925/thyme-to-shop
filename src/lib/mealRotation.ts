/** Converts a Shopify decimal money string to integer cents. */
export const parseMoneyAmountToCents = (amount: string): number | null => {
  const match = amount.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const whole = Number(match[1]);
  const fraction = match[2] || '';
  if (!Number.isSafeInteger(whole)) return null;

  const firstTwoDigits = fraction.padEnd(2, '0').slice(0, 2);
  const shouldRoundUp = Number(fraction[2] || '0') >= 5;
  const cents = (whole * 100) + Number(firstTwoDigits) + (shouldRoundUp ? 1 : 0);
  return Number.isSafeInteger(cents) ? cents : null;
};
