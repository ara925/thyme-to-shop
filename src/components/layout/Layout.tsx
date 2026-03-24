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
      <Header />
      <div className="bg-muted/50 border-b border-border">
        <div className="container flex justify-center py-2">
          <CutoffBanner />
        </div>
      </div>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
