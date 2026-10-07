import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteScroll } from './RouteScroll';

const route = vi.hoisted(() => ({ key: 'initial-test', hash: '', navigationType: 'POP' }));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ key: route.key, hash: route.hash }),
  useNavigationType: () => route.navigationType,
}));

describe('customer route scrolling', () => {
  beforeEach(() => {
    route.key = 'initial-test'; route.hash = ''; route.navigationType = 'POP';
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  it('starts a newly chosen page at the top and restores Back positions', () => {
    const view = render(<RouteScroll />);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 820 });
    act(() => window.dispatchEvent(new Event('scroll')));
    route.key = 'next-test'; route.navigationType = 'PUSH';
    view.rerender(<RouteScroll />);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    route.key = 'initial-test'; route.navigationType = 'POP';
    view.rerender(<RouteScroll />);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 820, behavior: 'instant' });
  });
  it('does not crash on malformed link fragments', () => {
    route.hash = '#%';
    expect(() => render(<RouteScroll />)).not.toThrow();
  });
});
