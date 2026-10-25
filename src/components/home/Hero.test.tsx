import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';

describe('homepage hero accessibility and loading', () => {
  it('uses second-level feature headings below the page heading', () => {
    render(<MemoryRouter><Hero /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chef-Prepared Meals');
    for (const name of ['Farm Fresh', 'Weekly Menus', 'Local Fulfillment']) {
      expect(screen.getByRole('heading', { name, level: 2 })).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('prioritizes responsive AVIF while keeping the original JPEG fallback', () => {
    render(<MemoryRouter><Hero /></MemoryRouter>);
    const image = screen.getByRole('img', { name: 'Fresh meal prep containers' });
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('width', '1920');
    expect(image.getAttribute('src')).toContain('.jpg');
    const source = image.parentElement?.querySelector('source[type="image/avif"]');
    expect(source?.getAttribute('srcset')).toMatch(/768w, .*960w, .*1920w$/);
    expect(source?.getAttribute('sizes')).toBe('100vw');
  });
});
