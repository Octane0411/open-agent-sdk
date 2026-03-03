export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  content: string[];
};

export const posts: BlogPost[] = [
  {
    slug: 'docs-site-iteration',
    title: 'Docs Site Iteration',
    date: '2026-03-03',
    summary: 'Progress update on docs structure, UX, and migration-focused content.',
    content: [
      'We reorganized the docs around API reference and migration workflows.',
      'The next phase is to split product web and docs into separate packages and deployments.',
      'This enables a cleaner product homepage and a focused docs experience.'
    ]
  },
  {
    slug: 'roadmap-focus',
    title: 'Roadmap Focus',
    date: '2026-03-03',
    summary: 'Near-term priorities: benchmarks, docs maturity, evals, and Claude Code alignment.',
    content: [
      'Benchmark quality and reproducibility are priority one.',
      'Docs and migration quality are priority two.',
      'Eval framework and capability parity continue in parallel.'
    ]
  }
];

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
