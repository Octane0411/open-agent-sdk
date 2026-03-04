import Link from 'next/link';

const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? '/docs';
const githubUrl = 'https://github.com/OasAIStudio/open-agent-sdk';
const npmUrl = 'https://www.npmjs.com/package/open-agent-sdk';
const docsQuickstartUrl = `${docsUrl}/getting-started/quickstart/`;
const docsMigrationUrl = `${docsUrl}/migration/quick-migration/`;
const docsApiUrl = `${docsUrl}/api-reference/overview/`;

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
        <p className="eyebrow">Open-source agent sdk</p>
        <h1>Claude Agent SDK-style APIs, open-source flexibility.</h1>
        <p>
          Build production-grade AI agents in TypeScript with a Claude-like developer
          experience, aligned API patterns, and broader provider and plugin options.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-primary" href={docsUrl}>
            Start with the docs
          </Link>
          <a className="btn btn-secondary" href={githubUrl} target="_blank" rel="noreferrer">
            Star on GitHub
          </a>
        </div>
      </section>

      <section className="portal-grid" aria-label="Primary entries">
        <Link className="portal-card portal-card-primary" href={docsQuickstartUrl}>
          <h2>Start Building</h2>
          <p>Install the SDK and run your first workflow in minutes.</p>
          <span>Open quickstart</span>
        </Link>
        <Link className="portal-card" href={docsMigrationUrl}>
          <h2>Migrate from Claude Agent SDK</h2>
          <p>Use aligned API concepts and move existing flows with less friction.</p>
          <span>See migration path</span>
        </Link>
        <Link className="portal-card" href={docsApiUrl}>
          <h2>Evaluate the API Surface</h2>
          <p>Review sessions, permissions, providers, hooks, and tool interfaces.</p>
          <span>Browse API reference</span>
        </Link>
      </section>

      <section className="faq" aria-label="Frequently asked questions">
        <h2>FAQ</h2>
        <details>
          <summary>Why not just use Claude Agent SDK directly?</summary>
          <p>
            Use Open Agent SDK when you want Claude Agent SDK-style APIs plus broader
            provider and plugin options in one MIT-licensed codebase.
          </p>
        </details>
        <details>
          <summary>How open is this project?</summary>
          <p>
            The core SDK is open-source under MIT. You can inspect, fork, and extend
            runtime behavior without black-box constraints.
          </p>
        </details>
        <details>
          <summary>Can we start simple and add controls later?</summary>
          <p>
            Yes. Start with one-shot prompts, then add sessions, permissions, hooks,
            and tool policies as your workflows become more complex.
          </p>
        </details>
        <details>
          <summary>Which providers are supported?</summary>
          <p>
            OpenAI, Google Gemini, and Anthropic are supported today, with explicit
            provider configuration and compatible endpoint patterns.
          </p>
        </details>
      </section>

      <section className="final-cta" aria-label="Final call to action">
        <h2>Build now. Migrate safely. Stay open.</h2>
        <p>
          Ship with Claude Agent SDK-style APIs while keeping the flexibility to
          choose providers and extensions as your product evolves.
        </p>
      </section>
    </main>
  );
}
