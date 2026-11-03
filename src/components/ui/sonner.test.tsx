import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => { capture.props = props; return null; },
  toast: {},
}));

import { Toaster } from './sonner';

describe('notification navigation clearance', () => {
  it('keeps top notifications below the desktop and mobile sticky navigation', () => {
    render(<Toaster />);
    expect(capture.props.offset).toEqual({ top: 96 });
    expect(capture.props.mobileOffset).toEqual({ top: 64 });
  });

  it('preserves explicit offsets for a caller with a different layout', () => {
    render(<Toaster offset={{ top: 140 }} mobileOffset={{ top: 90 }} />);
    expect(capture.props.offset).toEqual({ top: 140 });
    expect(capture.props.mobileOffset).toEqual({ top: 90 });
  });
});
