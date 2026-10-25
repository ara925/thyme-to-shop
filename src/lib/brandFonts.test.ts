import { afterEach, describe, expect, it } from 'vitest';
import { activateBrandFonts } from './brandFonts';

afterEach(() => { document.getElementById('brand-fonts')?.remove(); });

describe('non-blocking brand font activation', () => {
  it('activates only the existing preloaded stylesheet without changing its source', () => {
    const link = document.createElement('link');
    link.id = 'brand-fonts'; link.rel = 'preload'; link.as = 'style';
    link.href = 'https://fonts.googleapis.com/css2?family=Lato&display=swap';
    document.head.appendChild(link);
    activateBrandFonts();
    expect(link.rel).toBe('stylesheet');
    expect(link.hasAttribute('as')).toBe(false);
    expect(link.href).toBe('https://fonts.googleapis.com/css2?family=Lato&display=swap');
    activateBrandFonts();
    expect(document.querySelectorAll('#brand-fonts')).toHaveLength(1);
  });

  it('leaves missing or unrelated elements unchanged', () => {
    expect(() => activateBrandFonts()).not.toThrow();
    const link = document.createElement('link');
    link.id = 'brand-fonts'; link.rel = 'preload'; link.as = 'image';
    document.head.appendChild(link);
    activateBrandFonts();
    expect(link.rel).toBe('preload');
    expect(link.as).toBe('image');
  });
});
