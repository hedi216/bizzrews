import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PublicApiError,
  publicBookingApi,
} from '../../../lib/api/public-booking';
import { money } from '../../../lib/booking';
import { BookingFlow } from './booking-flow';
import { Providers } from '../../providers';
import { PageBlocks } from './page-blocks';
import { bookingBlockConfig } from '../../../lib/page-block-layout';
import { onlineBookingAvailable } from '../../../lib/payment-availability';
type Props = {
  params: Promise<{ businessSlug: string; experienceSlug: string }>;
};
async function load(params: Props['params']) {
  const p = await params;
  return publicBookingApi.experience(p.businessSlug, p.experienceSlug);
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const d = await load(params);
    return {
      title: `${d.publishedRevision.name} | ${d.business.name} | BizzRes`,
      description:
        d.publishedRevision.description?.slice(0, 160) ??
        `Book ${d.publishedRevision.name} with ${d.business.name}.`,
    };
  } catch {
    return { title: 'Experience | BizzRes' };
  }
}
export default async function ExperiencePage({ params }: Props) {
  let data;
  try {
    data = await load(params);
  } catch (e) {
    if (e instanceof PublicApiError && e.status === 404) notFound();
    return (
      <main className="public-main">
        <div className="state-card">
          <h1>We could not load this experience</h1>
          <p>BizzRes is temporarily unavailable. Please try again shortly.</p>
        </div>
      </main>
    );
  }
  const r = data.publishedRevision;
  const hasHero = data.pageBlocks.some((block) => block.type === 'HERO');
  return (
    <main className="public-main">
      <div className="public-shell">
        <header className="brand">
          <Link href="/">
            <Image
              className="brand-logo"
              src="/brand/logobizzres.png"
              alt="BizzRes"
              width={1448}
              height={1086}
            />
          </Link>
          <Link href="/account" className="account-link">
            My account
          </Link>
        </header>
        <div className="experience-layout">
          <aside className="experience-card">
            <p className="business-name">{data.business.name}</p>
            {!hasHero && <h1>{r.name}</h1>}
            {!hasHero && r.description && (
              <p className="description">{r.description}</p>
            )}
            {hasHero && <p className="experience-context">Booking details</p>}
            <div className="price">{money(r.priceAmount, r.currency)}</div>
            <p className="timezone">Times shown in {data.business.timezone}</p>
            {r.cancellationTerms && (
              <details>
                <summary>Cancellation terms</summary>
                <p>{r.cancellationTerms}</p>
              </details>
            )}
          </aside>
          <div>
            <PageBlocks
              blocks={data.pageBlocks}
              businessLogoId={data.business.logoMedia?.id}
              booking={
                onlineBookingAvailable(r.paymentMode) ? (
                  <Providers>
                    <BookingFlow
                      data={data}
                      submitLabel={
                        bookingBlockConfig(data.pageBlocks).submitLabel
                      }
                    />
                  </Providers>
                ) : (
                  <div className="state-card">
                    <h2>Online booking is not available yet</h2>
                    <p>
                      This experience uses a payment option that BizzRes cannot
                      process yet. Please contact the business directly.
                    </p>
                  </div>
                )
              }
            />
          </div>
        </div>
        <footer>
          Powered by <strong>BizzRes</strong>
        </footer>
      </div>
    </main>
  );
}
