import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="public-main">
      <div className="state-card">
        <span className="brand-mark">B</span>
        <h1>Experience not found</h1>
        <p>This link may be incorrect, unpublished, or no longer available.</p>
        <Link className="button-link" href="/">
          Go to BizzRes
        </Link>
      </div>
    </main>
  );
}
