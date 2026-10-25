import { describe, expect, it } from 'vitest';
import { parseMoneyCents } from './moneyCents';

describe('exact money amounts', () => {
  it.each([['0', 0], ['0.01', 1], ['99', 9900], ['99.0', 9900], ['134.99', 13499]])('parses %s exactly', (value, expected) => {
    expect(parseMoneyCents(value)).toBe(expected);
  });
  it.each(['99oops', '99.001', '9.9e1', '-1', ' 99.00', '99.00 ', '01.00', '', 'NaN', 'Infinity', null, undefined, 99])('rejects malformed amount %s', value => {
    expect(parseMoneyCents(value)).toBeNull();
  });
});
