const MEAL_MINIMUM_LABEL_PATTERN =
  /^Weekly Meal Subscription - \$(\d+(?:\.\d{1,2})?) Minimum$/;

export function parsePositiveMoneyCents(amount: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return null;

  const wholeUnits = Number.parseInt(match[1], 10);
  const fractionalUnits = Number.parseInt((match[2] || '').padEnd(2, '0'), 10) || 0;
  const cents = wholeUnits * 100 + fractionalUnits;

  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function parseMealMinimumCents(groupLabel: string): number | null {
  const match = MEAL_MINIMUM_LABEL_PATTERN.exec(groupLabel.trim());
  return match ? parsePositiveMoneyCents(match[1]) : null;
}
