import { notFound } from 'next/navigation';
import { getPost, posts } from '../../../lib/blog';

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) notFound();

  return (
    <main className="page">
      <article className="post">
        <h1>{post.title}</h1>
        <time dateTime={post.date}>{post.date}</time>
        {post.content.map((paragraph, idx) => (
          <p key={idx}>{paragraph}</p>
        ))}
      </article>
    </main>
  );
}
