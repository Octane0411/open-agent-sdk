import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Open Agent SDK Docs',
      description: 'Documentation for building production-grade AI agents with Open Agent SDK.',
      logo: {
        light: '/src/assets/open-agent-sdk-wordmark-light.svg',
        dark: '/src/assets/open-agent-sdk-wordmark-dark.svg',
        alt: 'Open Agent SDK',
        replacesTitle: true
      },
      customCss: [
        '/src/styles/custom.css'
      ],
      components: {
        ThemeSelect: './src/components/ThemeToggle.astro'
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/OasAIStudio/open-agent-sdk'
        }
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', link: '/getting-started/installation/' },
            { label: 'Quickstart', link: '/getting-started/quickstart/' }
          ]
        },
        {
          label: 'API Reference',
          items: [
            { label: 'API Reference', link: '/api-reference/overview/' }
          ]
        },
        {
          label: 'Migration',
          items: [
            { label: 'Diff vs Claude Agent SDK', link: '/migration/claude-agent-sdk-diff/' },
            { label: 'Quick Migration Guide', link: '/migration/quick-migration/' }
          ]
        }
      ]
    })
  ]
});
