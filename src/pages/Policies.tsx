import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { PolicyContent } from '@/components/seo/PolicyContent';
import { fetchStorePolicies, policyParagraphs, safePolicyUrl, type StorePolicies } from '@/lib/storePolicies';

const policySections: Array<{ key: keyof StorePolicies; label: string }> = [
  { key: 'privacyPolicy', label: 'Privacy policy' },
  { key: 'refundPolicy', label: 'Return & refund policy' },
  { key: 'termsOfService', label: 'Terms of service' },
  { key: 'shippingPolicy', label: 'Delivery & shipping policy' },
];

export default function Policies() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['store-policies'],
    queryFn: ({ signal }) => fetchStorePolicies(signal),
    staleTime: 60_000,
  });
  return <Layout>
    <div className="container max-w-4xl py-12 md:py-20">
      <h1 className="font-serif text-3xl font-bold md:text-4xl">Store Information &amp; Policies</h1>
      <p className="mt-4 text-muted-foreground">Published policies are loaded directly from Place in Thyme's Shopify store.</p>
      <section className="mt-8 rounded-xl border bg-primary/5 p-6">
        <h2 className="font-serif text-xl font-bold">Local delivery &amp; pickup</h2>
        <p className="mt-3 leading-relaxed">Orange County delivery is $15 on orders of $99 or more, on Monday or Tuesday. Orders close Friday at 11:59 PM Pacific Time. Pickup is free at 26021 Acero, Mission Viejo, CA 92691, on Monday after 9:00 AM. Shipping is not offered.</p>
        <p className="mt-3 text-sm text-muted-foreground">Delivery address eligibility is confirmed at checkout.</p>
      </section>
      <section className="mt-8 rounded-xl border p-6">
        <h2 className="font-serif text-xl font-bold">Meal &amp; juice plan terms</h2>
        <p className="mt-3 leading-relaxed">The meal plan rotates Week 1 → Week 2 → Week 3, charging the active week's actual selected total with a $120 weekly minimum. You may cancel anytime.</p>
        <p className="mt-3 leading-relaxed">The Pick n' Choose juice plan repeats one mix, with a $134.99 retail minimum before 10% off. It has a four-week minimum commitment, with weekly billing or four-week prepayment. Cancellation is available after each four-week period.</p>
        <p className="mt-3 text-sm text-muted-foreground">Both custom plans currently require team enrollment; submitting a plan does not create an online subscription or make a charge. Fixed juice bundles have separate one-time and weekly purchase options and do not use the custom plan's 10% discount or four-week terms.</p>
        <div className="mt-4 flex flex-wrap gap-3"><Button asChild variant="outline"><Link to="/subscribe/meals">Meal planner</Link></Button><Button asChild variant="outline"><Link to="/subscribe/juices">Juice planner</Link></Button></div>
      </section>
      {isLoading ? <p className="mt-8" role="status">Loading published policies…</p>
        : isError ? <div className="mt-8" role="alert"><p>We couldn't load the published policies. Please try again or contact us.</p><Button className="mt-3" onClick={() => void refetch()}>Try again</Button></div>
        : policySections.map(({ key, label }) => {
          const paragraphs = data?.[key]?.body ? policyParagraphs(data[key]!.body) : [];
          const sourceUrl = safePolicyUrl(data?.[key]?.url);
          return <section key={key} id={key} className="mt-8 scroll-mt-28 rounded-xl border p-6">
            <h2 className="font-serif text-xl font-bold">{label}</h2>
            {paragraphs.length ? <div className="mt-4"><PolicyContent html={data![key]!.body} />{sourceUrl && <a className="inline-flex min-h-11 items-center text-primary underline" href={sourceUrl}>View original policy with its links</a>}</div>
              : <p className="mt-3 text-sm text-muted-foreground">This policy has not been published yet. Please contact Place in Thyme for details.</p>}
          </section>;
        })}
      <p className="mt-8 leading-relaxed">Questions about ingredients, allergens, storage, refunds or cancellation? <a className="font-medium text-primary underline underline-offset-4" href="mailto:info@placeinthyme.com">Contact Place in Thyme</a> before placing an order.</p>
    </div>
  </Layout>;
}
