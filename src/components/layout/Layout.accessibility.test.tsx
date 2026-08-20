import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { Layout } from './Layout';

vi.mock('@/components/cart/CartDrawer', () => ({
  CartDrawer: () => <button type="button">Cart</button>,
}));

vi.mock('@/components/cart/CutoffBanner', () => ({
  CutoffBanner: () => <p>Order cutoff</p>,
}));

vi.mock('./Footer', () => ({
  Footer: () => <footer>Footer</footer>,
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe('layout keyboard accessibility', () => {
  it('keeps the closed mobile navigation out of the accessibility tree and tab order', () => {
    renderHeader();

    const mobileNavigation = document.getElementById('mobile-navigation');
    expect(mobileNavigation).toHaveAttribute('aria-hidden', 'true');

    const mobileLinks = within(mobileNavigation as HTMLElement).getAllByRole('link', {
      hidden: true,
    });
    expect(mobileLinks).toHaveLength(7);
    mobileLinks.forEach((link) => expect(link).toHaveAttribute('tabindex', '-1'));

    const tabbableElements = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ).filter((element) => element.tabIndex >= 0);
    expect(tabbableElements.some((element) => mobileNavigation?.contains(element))).toBe(false);
  });

  it('restores the mobile navigation links when opened and returns focus on Escape', () => {
    renderHeader();

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    fireEvent.click(menuButton);

    const mobileNavigation = document.getElementById('mobile-navigation');
    expect(mobileNavigation).toHaveAttribute('aria-hidden', 'false');
    within(mobileNavigation as HTMLElement).getAllByRole('link').forEach((link) => {
      expect(link).not.toHaveAttribute('tabindex');
    });

    const firstMobileLink = within(mobileNavigation as HTMLElement).getAllByRole('link')[0];
    firstMobileLink.focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mobileNavigation).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveFocus();
  });

  it('puts a visible-on-focus skip link first and points it at a focusable main landmark', () => {
    render(
      <MemoryRouter>
        <Layout>
          <h1>Page heading</h1>
        </Layout>
      </MemoryRouter>,
    );

    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    const main = screen.getByRole('main');
    const tabbableElements = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ).filter((element) => element.tabIndex >= 0);

    expect(tabbableElements[0]).toBe(skipLink);
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(skipLink).toHaveClass('sr-only', 'focus:not-sr-only');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});
