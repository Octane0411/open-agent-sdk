import Link from 'next/link';
import { posts } from '../../lib/blog';

export default function BlogPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Blog</h1>
        <p>Product and engineering updates from Open Agent SDK.</p>
      </header>

      <section className="list">
        {posts.map((post) => (
          <article className="list-item" key={post.slug}>
            <h2>
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </h2>
            <time dateTime={post.date}>{post.date}</time>
            <p>{post.summary}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
