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
        '/src/styles/custom.css',
        '@fontsource-variable/manrope',
        '@fontsource/jetbrains-mono'
      ],
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
          label: 'Core Concepts',
          items: [{ label: 'ReAct Loop', link: '/core-concepts/react-loop/' }]
        },
        {
          label: 'Providers',
          items: [{ label: 'Overview', link: '/providers/overview/' }]
        },
        {
          label: 'Tools',
          items: [{ label: 'Overview', link: '/tools/overview/' }]
        },
        {
          label: 'Sessions & Permissions',
          items: [{ label: 'Overview', link: '/sessions-permissions/overview/' }]
        },
        {
          label: 'Examples',
          items: [{ label: 'Overview', link: '/examples/overview/' }]
        },
        {
          label: 'API Reference',
          items: [{ label: 'Overview', link: '/api-reference/overview/' }]
        }
      ]
    })
  ]
});
