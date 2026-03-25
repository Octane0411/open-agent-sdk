import Link from 'next/link';

const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? '/docs';
const githubUrl = 'https://github.com/OasAIStudio/open-agent-sdk';
const npmUrl = 'https://www.npmjs.com/package/open-agent-sdk';
const docsQuickstartUrl = `${docsUrl}/getting-started/quickstart/`;
const docsMigrationUrl = `${docsUrl}/migration/quick-migration/`;
const docsApiUrl = `${docsUrl}/api-reference/overview/`;
const permissionsUrl = `${docsUrl}/guides/permissions-and-safety/`;
const providerAuthUrl = `${docsUrl}/guides/provider-auth-strategy/`;
const benchmarksUrl = `${githubUrl}/blob/main/BENCHMARKS.md`;

const navItems = [
  { href: docsUrl, label: 'Docs' },
  { href: '/blog', label: 'Blog' },
  { href: '/playground', label: 'Playground' },
  { href: githubUrl, label: 'GitHub', external: true }
];

const heroSignals = [
  'MIT licensed',
  'TypeScript + Bun',
  'Codex, OpenAI, Gemini, Anthropic',
  'Sessions, permissions, hooks, subagents'
];

const workflowSteps = [
  {
    number: '01',
    title: 'Start from a real runtime surface',
    description:
      'Move beyond one-shot demos with prompts, streaming sessions, tool execution, and file-backed persistence in the same TypeScript runtime.',
    href: docsQuickstartUrl,
    cta: 'Run the quickstart'
  },
  {
    number: '02',
    title: 'Add guardrails before the risky part',
    description:
      'Permission modes, tool gating, and lifecycle hooks let product teams inspect, approve, and instrument agent behavior before it turns into operations debt.',
    href: permissionsUrl,
    cta: 'Review safety controls'
  },
  {
    number: '03',
    title: 'Stay flexible when product needs change',
    description:
      'Keep the same mental model while changing providers, extending with MCP servers, or benchmarking real workflows instead of rebuilding your loop.',
    href: docsApiUrl,
    cta: 'Browse the API surface'
  }
];

const capabilityRows = [
  {
    title: 'Sessions that survive real workflows',
    description:
      'Create, resume, and fork long-lived agent runs with storage-backed history so product work is not trapped in a single request cycle.',
    href: docsApiUrl,
    label: 'Session API'
  },
  {
    title: 'Safety controls built into the runtime',
    description:
      'Use `default`, `plan`, `acceptEdits`, and `bypassPermissions`, then layer custom tool checks and lifecycle hooks when your surface area grows.',
    href: permissionsUrl,
    label: 'Permissions and hooks'
  },
  {
    title: 'Tools that map to actual agent work',
    description:
      'Ship with bash, file operations, web search and fetch, MCP integration, and subagent task delegation instead of stitching one-off helpers together.',
    href: docsApiUrl,
    label: 'Tool model'
  },
  {
    title: 'Provider strategy without lock-in',
    description:
      'Reuse local Codex OAuth when it fits, or target OpenAI, Gemini, and Anthropic with explicit provider configuration and migration paths.',
    href: providerAuthUrl,
    label: 'Provider and auth'
  }
];

const entryPoints = [
  {
    title: 'Start a new agent product',
    description:
      'Use the SDK and CLI-first workflow when you want one open runtime to own prompts, sessions, tools, and safety policy.',
    bullets: [
      'Run a one-shot prompt first, then expand to sessions',
      'Add bash, file, web, MCP, and task delegation capabilities',
      'Keep auth and provider strategy explicit from the start'
    ],
    href: docsQuickstartUrl,
    cta: 'Open quickstart'
  },
  {
    title: 'Migrate a Claude-style workflow',
    description:
      'Keep the familiar session and tool-first mental model, then widen the runtime around providers, hooks, and evaluation without a rewrite.',
    bullets: [
      'Map create, resume, and fork onto your current flow',
      'Move permission and hook logic into typed control points',
      'Validate the migration against the API reference and guides'
    ],
    href: docsMigrationUrl,
    cta: 'See migration path'
  }
];

const resourceLinks = [
  {
    title: 'Documentation',
    description: 'Install guides, quickstart, migration, and operational patterns.',
    href: docsUrl
  },
  {
    title: 'API Reference',
    description: 'Sessions, providers, tools, permissions, hooks, and types.',
    href: docsApiUrl
  },
  {
    title: 'Benchmarks',
    description: 'SWE-bench and Terminal-bench harnesses for reproducible evaluation.',
    href: benchmarksUrl,
    external: true
  }
];

const consoleLines = [
  {
    label: 'boot',
    text: 'Create a CLI-first workspace and wire the runtime in minutes.'
  },
  {
    label: 'loop',
    text: 'Stream one-shot prompts or long-lived sessions from the same SDK.'
  },
  {
    label: 'tools',
    text: 'Add bash, file, web, MCP, and task delegation without custom glue.'
  },
  {
    label: 'policy',
    text: 'Apply permissions and hooks before the runtime touches real systems.'
  }
];

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="masthead">
        <div className="masthead-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">OAS</span>
            <span className="brand-copy">
              <strong>Open Agent SDK</strong>
              <span>Open-source agent runtime</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Primary navigation">
            {navItems.map((item) =>
              item.external ? (
                <a key={item.href} href={item.href} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ) : (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              )
            )}
          </nav>
        </div>
      </header>

      <section className="hero" aria-label="Product introduction">
        <div className="hero-shell">
          <div className="hero-copy">
            <p className="hero-kicker">Open Agent SDK</p>
            <h1>Lightweight, general-purpose TypeScript agent runtime.</h1>
            <p className="hero-body">
              Open-source alternative to Claude Agent SDK. Use it when you want a
              lightweight runtime with sessions, tools, hooks, subagents, and
              multi-provider support in a codebase you can inspect and extend.
            </p>
            <p className="hero-note">
              Claude-style mental model, open implementation, broader provider
              choice.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href={docsQuickstartUrl}>
                Start with the quickstart
              </Link>
              <Link className="button button-secondary" href={docsApiUrl}>
                Browse the API
              </Link>
              <a className="button button-tertiary" href={githubUrl} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
            <div className="hero-command" aria-label="Install command">
              <span className="hero-command-label">Init</span>
              <code>npx open-agent-sdk@alpha init my-agent</code>
            </div>
            <ul className="signal-list" aria-label="Project highlights">
              {heroSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </div>

          <aside className="hero-console" aria-label="Runtime overview">
            <div className="console-header">
              <div className="console-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p>agent-runtime.ts</p>
            </div>
            <div className="console-command-line">
              <span>$</span>
              <code>bunx open-agent-sdk@alpha init my-agent</code>
            </div>
            <ul className="console-log">
              {consoleLines.map((line) => (
                <li key={line.label}>
                  <span>{line.label}</span>
                  <p>{line.text}</p>
                </li>
              ))}
            </ul>
            <div className="console-footer">
              <span>provider: codex | openai | google | anthropic</span>
              <span>runtime: prompt | session | resume | fork</span>
              <span>controls: permissions | hooks | MCP</span>
            </div>
          </aside>
        </div>
      </section>

      <section className="section workflow" aria-label="Workflow">
        <div className="section-heading">
          <p className="section-kicker">Workflow</p>
          <h2>Build the runtime, not a pile of glue code.</h2>
          <p>
            Product teams usually outgrow isolated demos in the same places: session
            state, tool control, provider churn, and operational safety. This SDK is
            organized around those failure points from the start.
          </p>
        </div>
        <div className="workflow-list">
          {workflowSteps.map((step) => (
            <article key={step.number} className="workflow-step">
              <p className="workflow-number">{step.number}</p>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <Link href={step.href}>{step.cta}</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section capabilities" aria-label="Core capabilities">
        <div className="section-heading">
          <p className="section-kicker">Capabilities</p>
          <h2>One runtime surface for prompts, tools, policy, and evaluation.</h2>
          <p>
            Keep the repo approachable for local experiments, then extend the same
            primitives into production workflows, migration projects, and benchmark
            runs.
          </p>
        </div>
        <div className="capability-list">
          {capabilityRows.map((item) => (
            <article key={item.title} className="capability-row">
              <h3>{item.title}</h3>
              <div>
                <p>{item.description}</p>
                <Link href={item.href}>{item.label}</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section pathways" aria-label="Primary entry points">
        <div className="section-heading">
          <p className="section-kicker">Adoption paths</p>
          <h2>Start new, migrate carefully, or benchmark the hard parts.</h2>
          <p>
            The repository now has three jobs: explain the product quickly, move
            builders into working code, and give evaluators enough surface area to
            trust the runtime.
          </p>
        </div>
        <div className="entry-grid">
          {entryPoints.map((item) => (
            <article key={item.title} className="entry-panel">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ul>
                {item.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <Link href={item.href}>{item.cta}</Link>
            </article>
          ))}
        </div>
        <div className="resource-grid">
          {resourceLinks.map((item) =>
            item.external ? (
              <a
                key={item.title}
                className="resource-link"
                href={item.href}
                target="_blank"
                rel="noreferrer"
              >
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </a>
            ) : (
              <Link key={item.title} className="resource-link" href={item.href}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </Link>
            )
          )}
        </div>
      </section>

      <section className="section final-cta" aria-label="Final call to action">
        <div>
          <p className="section-kicker">Build with it</p>
          <h2>Use the quickstart in one minute, then deepen the runtime as the product hardens.</h2>
        </div>
        <div className="final-cta-side">
          <p>
            Start with docs and API reference, or jump straight into the package if
            you already know the workflow you want to ship.
          </p>
          <div className="final-actions">
            <a className="button button-primary" href={npmUrl} target="_blank" rel="noreferrer">
              Open npm package
            </a>
            <Link className="button button-secondary" href={docsUrl}>
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <footer className="site-footer" aria-label="Site footer">
        <p>
          Built by{' '}
          <a href="https://oasai.studio" target="_blank" rel="noreferrer">
            OasAI Studio
          </a>{' '}
          · MIT licensed ·{' '}
          <a href={benchmarksUrl} target="_blank" rel="noreferrer">
            Benchmarks
          </a>{' '}
          ·{' '}
          <a href={githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
