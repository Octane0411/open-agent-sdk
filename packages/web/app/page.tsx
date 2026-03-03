import Link from 'next/link';

const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? '/docs';
const githubUrl = 'https://github.com/OasAIStudio/open-agent-sdk';

const navItems = [
  { href: docsUrl, label: 'Docs' },
  { href: '/blog', label: 'Blog' },
  { href: '/playground', label: 'Playground' },
  { href: githubUrl, label: 'GitHub', external: true }
];

export default function HomePage() {
  return (
    <main className="shell">
      <div className="aurora" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">Open Agent SDK</div>
        <nav className="nav">
          {navItems.map((item) => (
            item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noreferrer">
                {item.label}
              </a>
            ) : (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            )
          ))}
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Open-source agent runtime</p>
        <h1>Ship autonomous workflows with confidence.</h1>
        <p>
          Build production-grade AI agents with tools, sessions, permissions, hooks,
          and multi-provider support.
        </p>
      </section>

      <section className="portal-grid" aria-label="Primary entries">
        <Link className="portal-card" href={docsUrl}>
          <h2>Docs</h2>
          <p>API reference, integration guides, and migration docs.</p>
          <span>Open documentation</span>
        </Link>
        <Link className="portal-card" href="/blog">
          <h2>Blog</h2>
          <p>Roadmap updates, architecture notes, and release progress.</p>
          <span>Read updates</span>
        </Link>
        <Link className="portal-card" href="/playground">
          <h2>Playground</h2>
          <p>Interactive testing entry for agent runs and tool workflows.</p>
          <span>Open playground</span>
        </Link>
      </section>
    </main>
  );
}
