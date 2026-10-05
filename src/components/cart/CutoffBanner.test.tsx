import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CutoffBanner } from './CutoffBanner';
import {
  FULFILLMENT_SETUP_BANNER_MESSAGE,
  getCutoffBannerMessage,
} from '@/lib/orderCutoff';

describe('CutoffBanner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not advertise ordering before Shopify local fulfillment is ready', () => {
    expect(getCutoffBannerMessage(false, false)).toBe(FULFILLMENT_SETUP_BANNER_MESSAGE);
  });

  it('shows the unambiguous end-of-Friday Pacific deadline while ordering is open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T18:00:00.000Z'));

    render(<CutoffBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(
      /order by friday at 11:59 pm pt/i,
    );
  });

  it('announces the closed period after the Friday deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T07:00:00.000Z'));

    render(<CutoffBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(
      /online ordering is closed for this delivery cycle/i,
    );
  });

  it('updates an already-open page when the cutoff is crossed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T06:59:59.000Z'));
    render(<CutoffBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(/order by friday/i);
    act(() => vi.advanceTimersByTime(1_100));
    expect(screen.getByRole('status')).toHaveTextContent(/online ordering is closed/i);
  });
});
