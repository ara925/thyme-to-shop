import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isQuantityMap, usePersistentDraft } from './usePersistentDraft';

describe('persistent planner drafts', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('saves and restores validated quantities', () => {
    const first = renderHook(() => usePersistentDraft('test-draft', {}, isQuantityMap));
    act(() => first.result.current[1]({ ginger: 16 }));
    first.unmount();
    const second = renderHook(() => usePersistentDraft('test-draft', {}, isQuantityMap));
    expect(second.result.current[0]).toEqual({ ginger: 16 });
  });
  it.each([
    'not json',
    JSON.stringify({ savedAt: Date.now(), value: { ginger: -2 } }),
    JSON.stringify({ savedAt: Date.now(), value: { ginger: 1.5 } }),
    JSON.stringify({ savedAt: Date.now(), value: [] }),
    JSON.stringify({ savedAt: Date.now() - 31 * 86400000, value: { ginger: 16 } }),
  ])('ignores corrupt, invalid or expired drafts: %s', raw => {
    localStorage.setItem('test-draft', raw);
    const hook = renderHook(() => usePersistentDraft('test-draft', {}, isQuantityMap));
    expect(hook.result.current[0]).toEqual({});
  });
  it('keeps the planner usable when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    const hook = renderHook(() => usePersistentDraft('test-draft', {}, isQuantityMap));
    act(() => hook.result.current[1]({ ginger: 2 }));
    expect(hook.result.current[0]).toEqual({ ginger: 2 });
    expect(hook.result.current[2]).toBe(true);
  });
});
