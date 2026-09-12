import Link from 'next/link';
import {
  publicBookingApi,
  type MarketplaceBusiness,
} from '../../lib/api/public-booking';
import { money } from '../../lib/booking';

export const metadata = {
  title: 'Discover experiences | BizzRes',
  description: 'Discover public booking experiences on BizzRes.',
};
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const query = (await searchParams).query?.slice(0, 100) ?? '';
  let businesses: MarketplaceBusiness[] = [];
  let unavailable = false;
  try {
    businesses = (await publicBookingApi.marketplace(query)).businesses;
  } catch {
    unavailable = true;
  }
  return (
    <main className="marketplace-page">
      <header className="marketplace-header">
        <Link href="/" className="brand-link">
          BizzRes
        </Link>
        <h1>Discover experiences</h1>
        <form>
          <input
            name="query"
            defaultValue={query}
            maxLength={100}
            placeholder="Search businesses"
          />
          <button>Search</button>
        </form>
      </header>
      <section className="marketplace-grid">
        {unavailable && (
          <div className="notice error">
            Marketplace is temporarily unavailable.
          </div>
        )}
        {businesses.flatMap((b) =>
          b.experiences.map((e) => (
            <Link
              className="marketplace-card"
              href={`/${b.slug}/${e.slug}`}
              key={`${b.slug}-${e.slug}`}
            >
              <span>{b.name}</span>
              <h2>{e.publishedRevision.name}</h2>
              <p>{e.publishedRevision.description ?? b.description}</p>
              <strong>
                {money(
                  e.publishedRevision.priceAmount,
                  e.publishedRevision.currency,
                )}
              </strong>
            </Link>
          )),
        )}
        {!businesses.length && (
          <div className="empty">No public experiences found.</div>
        )}
      </section>
    </main>
  );
}
