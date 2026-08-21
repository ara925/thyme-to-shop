import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  return (
    <Layout>
      <div className="flex min-h-[50vh] items-center justify-center bg-muted/50 px-4 py-16">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-accent">Error 404</p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-foreground">Page not found</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            The page you requested doesn&apos;t exist or may have moved.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
