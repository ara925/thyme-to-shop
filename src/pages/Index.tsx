import { Layout } from '@/components/layout/Layout';
import { Hero } from '@/components/home/Hero';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { Categories } from '@/components/home/Categories';
import { HowItWorks } from '@/components/home/HowItWorks';

const Index = () => {
  return (
    <Layout>
      <Hero />
      <FeaturedProducts />
      <Categories />
      <HowItWorks />
    </Layout>
  );
};

export default Index;
