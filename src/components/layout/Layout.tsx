import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { CutoffBanner } from '@/components/cart/CutoffBanner';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <Header />
      <div className="bg-muted/50 border-b border-border">
        <div className="container flex justify-center py-2">
          <CutoffBanner />
        </div>
      </div>
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
