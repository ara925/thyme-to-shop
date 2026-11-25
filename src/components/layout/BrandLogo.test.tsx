import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('supplied brand artwork', () => {
  it('uses the horizontal logo without stretching it or duplicating its text', () => {
    const { container } = render(<BrandLogo />);
    const image = screen.getByRole('img', { name: 'Place in Thyme logo' });
    expect(image).toHaveAttribute('src', expect.stringContaining('place-in-thyme-horizontal-2026.png'));
    expect(image).toHaveAttribute('width', '1536');
    expect(image).toHaveAttribute('height', '1024');
    expect(image).toHaveClass('h-auto', 'w-full');
    expect(container.firstElementChild).toHaveClass('overflow-hidden');
  });

  it('preserves the full round logo on a white background for the footer', () => {
    render(<BrandLogo variant="round" />);
    const image = screen.getByRole('img', { name: 'Place in Thyme logo' });
    expect(image).toHaveAttribute('src', expect.stringContaining('place-in-thyme-round-2026.png'));
    expect(image).toHaveClass('object-contain', 'bg-white');
    expect(image).toHaveAttribute('loading', 'lazy');
  });
});
