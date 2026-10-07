import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PolicyContent } from './PolicyContent';
describe('safe readable policies', () => {
  it('preserves headings, lists and working privacy links', () => {
    render(<PolicyContent html='<h2>Your rights</h2><ul><li>Contact us</li></ul><p><a href="https://privacy.shopify.com/en">Privacy portal</a></p>' />);
    expect(screen.getByRole('heading', { name: 'Your rights' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Contact us');
    expect(screen.getByRole('link', { name: 'Privacy portal' })).toHaveAttribute('href', 'https://privacy.shopify.com/en');
  });
  it('drops scripts, event handlers, embeds and unsafe link protocols', () => {
    const { container } = render(<PolicyContent html='<script>danger()</script><iframe>hidden</iframe><p onclick="danger()">Safe text</p><a href="javascript:danger()">Bad link</a>' />);
    expect(container.querySelector('script, iframe, [onclick]')).toBeNull();
    expect(screen.getByText('Bad link')).not.toHaveAttribute('href');
    expect(screen.getByText('Safe text')).toBeInTheDocument();
  });
});
