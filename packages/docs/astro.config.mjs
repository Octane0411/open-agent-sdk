import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.openagentsdk.dev',
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
        ThemeSelect: './src/components/ThemeToggle.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        Footer: './src/components/Footer.astro'
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
          label: 'Start Here',
          items: [
            { label: 'Documentation Overview', link: '/' },
            { label: 'Installation', link: '/getting-started/installation/' },
            { label: 'Quickstart', link: '/getting-started/quickstart/' }
          ]
        },
        {
          label: 'Build',
          items: [
            { label: 'Provider & Auth Strategy', link: '/guides/provider-auth-strategy/' },
            { label: 'Permissions & Safety', link: '/guides/permissions-and-safety/' }
          ]
        },
        {
          label: 'Migrate',
          items: [
            { label: 'Quick Migration Guide', link: '/migration/quick-migration/' },
            { label: 'Diff vs Claude Agent SDK', link: '/migration/claude-agent-sdk-diff/' }
          ]
        },
        {
          label: 'Reference',
          items: [
            { label: 'API Reference', link: '/api-reference/overview/' }
          ]
        }
      ]
    })
  ]
});
