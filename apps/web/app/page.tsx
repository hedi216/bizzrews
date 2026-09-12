import Link from 'next/link';

export default function Home() {
  return (
    <main className="home-main">
      <span className="brand-mark">B</span>
      <h1>BizzRes</h1>
      <p>Thoughtful booking experiences for every kind of business.</p>
      <Link className="public-cta" href="/marketplace">
        Explore experiences
      </Link>
    </main>
  );
}
